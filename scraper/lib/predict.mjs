import {
  parseCargoDate,
  diffDays,
  nextTuesdayResetAfterEnd,
  snapDurationDays,
  snapGapDays,
  addDays,
  toIsoDate,
  parseOverrideDate,
} from './dates.mjs';

/**
 * Normalizes a raw Cargo `events` row into the shape `buildQueue` works with.
 * `pairKey` is what links the same content across JP and GL — for events that's
 * OriginalId (the first-ever run's Id; reruns point back to it, see wiki schema).
 */
export function normalizeEvent(row) {
  return {
    domain: 'event',
    pairKey: row.OriginalId || row.Id || row.Page,
    server: row.Server,
    name: row.NameEN || row.Page,
    type: row.Category,
    startDate: parseCargoDate(row['Start date']),
    endDate: parseCargoDate(row['End date']),
    notes: row.Notes || null,
    image: row.Image || null, // raw filename — resolveImageUrls() turns this into a URL
    raw: row,
  };
}

/** Same idea for `banners`, whose pairing key is CrossregionId instead of OriginalId. */
export function normalizeBanner(row) {
  return {
    domain: 'banner',
    // CrossregionId turned out NOT to be a JP<->GL pairing key despite the name: spot
    // checks show matched JP/GL occurrences of the same character banner carry
    // *different* CrossregionId values, and unpaired rows all share the sentinel "0"
    // (which would wrongly bucket together dozens of unrelated banners). The rate-up
    // character name is what's actually stable across a banner's JP run and its later
    // GL run, so pair on that instead — same occurrence-index-within-group approach.
    pairKey: row['Rateup character'] || row.Id || row.Page,
    server: row.Server,
    // Rate-up character name first: `NameEN` is the banner's flavor-text catchphrase
    // (e.g. "Who says you can't be sweet"), not the character's name — a real
    // regression when it won the fallback race for rows where it happens to be
    // filled in. `Page` is the last resort and is nearly useless too — Cargo's
    // _pageName returns whichever "Banner List/Banners of <year>" index page
    // declared the row, not the banner's own name.
    name: row['Rateup character'] || row.NameEN || row.Page,
    type: row.Type,
    startDate: parseCargoDate(row['Start date']),
    endDate: parseCargoDate(row['End date']),
    notes: row.Notes || null,
    image: row.Image || null, // raw filename — resolveImageUrls() turns this into a URL
    raw: row,
  };
}

/**
 * Core algorithm. Given a flat list of normalized items (JP + GL mixed) for one
 * domain (events or banners), figures out:
 *   1. which JP occurrences already have a matching GL run ("confirmed", GL already
 *      did it or the wiki already lists it as officially scheduled),
 *   2. the current "cursor" — the latest confirmed GL end date, i.e. where GL's queue
 *      consumption currently sits,
 *   3. every remaining JP occurrence with no GL counterpart yet, walked forward from
 *      the cursor onto the next Tuesday slots, using each item's own JP-observed
 *      duration snapped to 1 or 2 weeks, WITH the same gap JP itself left before that
 *      wave (see the walk below) — never assumed to be back-to-back.
 *
 * Why occurrence *index* within a pairKey, not just presence of a pairKey: the same
 * content can run on JP more than once (original + rerun + permanent-archive add),
 * each getting its own GL counterpart later — so we match the Nth JP occurrence of a
 * pairKey to the Nth GL occurrence of that same pairKey, not "any" GL row sharing it.
 *
 * Gaps: verified against real JP history that events and banners behave differently
 * here — banners are always back-to-back (0 gaps across 196 consecutive JP banner
 * waves checked), but events routinely have a dead week with nothing running (53 real
 * gaps across 101 consecutive JP event pairs, almost always exactly 7 days). Rather
 * than special-case "events only," the walk below always measures the actual JP gap
 * between consecutive waves and replicates it on GL — for banners that measurement
 * naturally comes out to ~0 because that's what the JP data shows, so one piece of
 * logic covers both without hardcoding which domain gets gaps.
 *
 * `manualOverrides` (from confirmed.json) is the escape hatch for when real-world
 * knowledge disagrees with what JP's history implies — e.g. a Global announcement
 * confirming a specific item follows the previous one with no gap, even though JP
 * itself had one. Each `{ pairKey, startDate }` entry pins that wave's start outright,
 * skipping the gap computation for that one transition only; every later wave still
 * measures its own gap normally, chained from the overridden position.
 */
export function buildQueue(items, { cursorOverride, manualOverrides = [] } = {}) {
  const usedOverrides = new Set();
  const byKeyServer = new Map(); // pairKey -> { JP: [...], GL: [...] }

  for (const item of items) {
    if (!item.startDate || !item.endDate) continue; // skip malformed/placeholder rows
    if (!byKeyServer.has(item.pairKey)) byKeyServer.set(item.pairKey, { JP: [], GL: [] });
    const bucket = byKeyServer.get(item.pairKey)[item.server];
    if (bucket) bucket.push(item);
  }
  for (const bucket of byKeyServer.values()) {
    bucket.JP?.sort((a, b) => a.startDate - b.startDate);
    bucket.GL?.sort((a, b) => a.startDate - b.startDate);
  }

  const confirmed = [];
  const unmatchedJp = [];

  for (const bucket of byKeyServer.values()) {
    bucket.JP.forEach((jpItem, i) => {
      const glMatch = bucket.GL[i];
      if (glMatch) {
        confirmed.push({ ...glMatch, matchedJp: jpItem });
      } else {
        unmatchedJp.push(jpItem);
      }
    });
  }

  // Items that ran concurrently on JP (identical Start/End — verified: Blue Archive
  // routinely runs several banners, occasionally two events, in the same version-update
  // wave) must land in the same predicted GL slot too, not one after another. Group by
  // exact (start, end) before walking the cursor forward, instead of walking the flat
  // date-sorted list item-by-item — that flat walk is what serialized same-wave items
  // like Niko/Kurumi that should have stayed side by side.
  const waveMap = new Map();
  for (const jpItem of unmatchedJp) {
    const key = `${jpItem.startDate.getTime()}|${jpItem.endDate.getTime()}`;
    if (!waveMap.has(key)) waveMap.set(key, []);
    waveMap.get(key).push(jpItem);
  }
  const waves = [...waveMap.values()].sort((a, b) => a[0].startDate - b[0].startDate);

  const latestConfirmedEnd = confirmed.reduce(
    (max, c) => (!max || c.endDate > max ? c.endDate : max),
    null,
  );
  // Separate from latestConfirmedEnd (a GL date, used below to seed the cursor): this
  // is the JP-side reference point the gap walk measures *from* — the latest JP end
  // among everything already matched to GL, i.e. how far JP's own queue GL has
  // actually consumed so far.
  let prevJpEnd = confirmed.reduce(
    (max, c) => (!max || c.matchedJp.endDate > max ? c.matchedJp.endDate : max),
    null,
  );

  let cursor = cursorOverride ? new Date(cursorOverride) : latestConfirmedEnd;
  if (!cursor) {
    // No confirmed GL data at all for this domain (shouldn't happen once the wiki has
    // any GL history) — fall back to "now" so prediction still has somewhere to start.
    cursor = new Date();
  }
  // `cursor` here is an *end* timestamp (Cargo's "-1 minute before reset" convention),
  // not a start — see nextTuesdayResetAfterEnd's doc comment for why advancing a whole
  // day first (the old approach) skipped a real week whenever the end already fell on
  // a Tuesday.
  cursor = nextTuesdayResetAfterEnd(cursor);

  const predicted = [];
  for (const wave of waves) {
    // All members of a wave share the same JP Start/End by construction (that's the
    // grouping key), so duration/gap only need computing once per wave.
    const observedDays = diffDays(wave[0].endDate, wave[0].startDate);
    const duration = snapDurationDays(observedDays);

    const override = manualOverrides.find((o) => wave.some((item) => String(item.pairKey) === String(o.pairKey)));

    let start;
    if (override) {
      start = parseOverrideDate(override.startDate);
      usedOverrides.add(override);
      cursor = start; // later waves chain from the overridden position, not the un-overridden one
    } else {
      if (prevJpEnd) {
        const rawGap = diffDays(wave[0].startDate, prevJpEnd);
        const gap = snapGapDays(rawGap);
        cursor = addDays(cursor, gap);
      }
      start = cursor;
    }
    prevJpEnd = wave[0].endDate; // this wave's JP end becomes the reference for the next one

    const end = addDays(start, duration);
    for (const jpItem of wave) {
      predicted.push({
        ...jpItem,
        predictedStart: start,
        predictedEnd: end,
      });
    }
    cursor = end; // duration is always a multiple of 7, so this lands back on a Tuesday
  }

  // Surfaced so the caller (index.mjs) can warn about a stale/typo'd override instead
  // of it silently doing nothing — e.g. the item it targeted already became confirmed.
  const unusedOverrides = manualOverrides.filter((o) => !usedOverrides.has(o));

  return {
    cursorStart: cursor,
    confirmed,
    predicted,
    unusedOverrides,
  };
}

export function serializeItem(item, status) {
  return {
    pairKey: String(item.pairKey ?? ''),
    name: item.name,
    type: item.type,
    startDate: toIsoDate(item.predictedStart ?? item.startDate),
    endDate: toIsoDate(item.predictedEnd ?? item.endDate),
    status,
    notes: item.notes,
    // Raw Cargo filename for now — index.mjs's resolveImageUrls() pass turns this into
    // an actual `imageUrl` (or null) as a post-processing step, since resolving needs
    // an extra async API round-trip this synchronous function can't make.
    image: item.image ?? null,
  };
}