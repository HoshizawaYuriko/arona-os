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
    // Promo first: confirmed by inspection that `Image` is actually an in-game
    // hotlink-style banner (used to jump to the event's screen) that visually
    // resembles real gacha banner art closely enough to undermine telling events and
    // banners apart on the roadmap at a glance. `Promo` is the event's own distinct
    // key art — falls back to `Image` only since `Promo` is empty on ~9% of events
    // (18/197 checked), so something still shows rather than nothing.
    image: row.Promo || row.Image || null, // raw filename — resolveImageUrls() turns this into a URL
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

  // Items that launched together on JP (identical Start — NOT necessarily identical End
  // too: verified real case, a 1-week Fest Archive banner launched the same day as a
  // 2-week normal banner) must land on the same predicted GL start too, not one after
  // another. Group by start alone before walking the cursor forward, instead of walking
  // the flat date-sorted list item-by-item — that flat walk is what serialized same-wave
  // items like Niko/Kurumi that should have stayed side by side, and (the bug this
  // comment used to miss) also wrongly split apart same-start items whose durations
  // happened to differ, since grouping on (start, end) treated them as unrelated waves.
  const waveMap = new Map();
  for (const jpItem of unmatchedJp) {
    const key = jpItem.startDate.getTime();
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
    // Members of a wave now only share a Start, not necessarily an End (see grouping
    // comment above) — each item's own predicted End comes from its own individually
    // snapped duration below. What the wave-level cursor advances by, and what becomes
    // `prevJpEnd` for the next wave's gap measurement, uses the LONGEST of them: that's
    // genuinely when JP's queue was next clear, not just whichever item happened to be
    // first in the array.
    const waveDurations = wave.map((item) => snapDurationDays(diffDays(item.endDate, item.startDate)));
    const maxDuration = Math.max(...waveDurations);
    const waveJpEnd = wave.reduce((max, item) => (item.endDate > max ? item.endDate : max), wave[0].endDate);

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
    prevJpEnd = waveJpEnd; // the longest-running item's JP end becomes the reference for the next wave

    wave.forEach((jpItem, i) => {
      predicted.push({
        ...jpItem,
        predictedStart: start,
        predictedEnd: addDays(start, waveDurations[i]),
      });
    });
    cursor = addDays(start, maxDuration); // duration is always a multiple of 7, so this lands back on a Tuesday
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