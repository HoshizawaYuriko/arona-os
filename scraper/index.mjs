// Orchestrator: fetch JP+GL rows from bluearchive.wiki's Cargo API, match them,
// predict Global's future queue, and write the result as a static JSON asset that
// the Angular app reads at runtime (no backend involved on either end).
//
// Run with: node scraper/index.mjs
// Output:   public/data/schedule.json  (bundled by `ng build` — Angular 17+ serves
//           everything under public/ from the site root).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { cargoQuery } from './lib/cargo.mjs';
import { normalizeEvent, normalizeBanner, buildQueue, serializeItem } from './lib/predict.mjs';
import { resolveImageUrls } from './lib/images.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'schedule.json');
const CONFIRMED_PATH = path.join(__dirname, 'confirmed.json');

// Deliberately narrow scope for v1: `Event` is Blue Archive's actual story/limited
// event category. Rows like `Rewards` or `Joint Firepower Exercise` are recurring
// generic campaigns with no Id/OriginalId to pair on — not "roadmap" content. Widen
// this list later if you want those tracked too.
const EVENT_CATEGORIES = new Set(['Event']);

// Same reasoning for banners: PickupGacha/LimitedGacha/FesGacha are the actual
// time-limited rate-up banners that rotate weekly/biweekly — what the roadmap means
// by "banner". The `Select...` variants are standing recruitment pools with no real
// end date (verified: one has End_date 2099-12-30), which would poison the "latest
// confirmed" cursor calculation if left in.
const BANNER_TYPES = new Set(['PickupGacha', 'LimitedGacha', 'FesGacha']);

async function fetchEventRows() {
  // NB: Cargo's *query* field names use underscores (Start_date), but the JSON it
  // hands back keys those same values with a space (row['Start date']) — see
  // normalizeEvent/normalizeBanner, which read the response-shaped names.
  const fields = [
    '_pageName=Page', 'Uid', 'Id', 'OriginalId', 'Server', 'Category',
    'NameEN', 'Start_date', 'End_date', 'Notes', 'Image',
  ];
  const rows = await cargoQuery('events', fields, { orderBy: 'Start_date ASC' });
  return rows.filter((r) => EVENT_CATEGORIES.has(r.Category)).map(normalizeEvent);
}

async function fetchBannerRows() {
  const fields = [
    '_pageName=Page', 'Uid', 'Id', 'CrossregionId', 'Server', 'Type',
    'NameEN', 'Rateup_character', 'Rerun', 'Start_date', 'End_date', 'Notes', 'Image',
  ];
  const rows = await cargoQuery('banners', fields, { orderBy: 'Start_date ASC' });
  return rows.filter((r) => BANNER_TYPES.has(r.Type)).map(normalizeBanner);
}

async function main() {
  const confirmed = JSON.parse(await readFile(CONFIRMED_PATH, 'utf8'));

  const [eventItems, bannerItems] = await Promise.all([fetchEventRows(), fetchBannerRows()]);

  const events = buildQueue(eventItems, {
    cursorOverride: confirmed.cursorOverride?.events,
    manualOverrides: confirmed.manualOverrides?.events ?? [],
  });
  const banners = buildQueue(bannerItems, {
    cursorOverride: confirmed.cursorOverride?.banners,
    manualOverrides: confirmed.manualOverrides?.banners ?? [],
  });

  for (const [domain, result] of [['events', events], ['banners', banners]]) {
    for (const unused of result.unusedOverrides) {
      console.warn(
        `WARNING: manualOverrides.${domain} entry for pairKey "${unused.pairKey}" was never used — ` +
        `it may already be confirmed, mistyped, or no longer upcoming. Safe to remove from confirmed.json.`,
      );
    }
  }

  const eventRows = [
    ...events.confirmed.map((i) => serializeItem(i, 'confirmed')),
    ...events.predicted.map((i) => serializeItem(i, 'predicted')),
  ];
  const bannerRows = [
    ...banners.confirmed.map((i) => serializeItem(i, 'confirmed')),
    ...banners.predicted.map((i) => serializeItem(i, 'predicted')),
  ];

  // One batched pass over every distinct filename across both tracks, hotlinked
  // straight to the wiki's own CDN — see scraper/lib/images.mjs for why this needs a
  // second API round-trip (Cargo's `Image` field is a bare filename, not a URL).
  const imageUrls = await resolveImageUrls([...eventRows, ...bannerRows].map((r) => r.image));
  for (const row of [...eventRows, ...bannerRows]) {
    row.imageUrl = row.image ? imageUrls.get(row.image) ?? null : null;
    delete row.image;
  }

  const schedule = {
    generatedAt: new Date().toISOString(),
    source: 'https://bluearchive.wiki (Cargo tables: events, banners)',
    events: eventRows,
    banners: bannerRows,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(schedule, null, 2));

  console.log(
    `Wrote ${schedule.events.length} events (${events.predicted.length} predicted) and ` +
    `${schedule.banners.length} banners (${banners.predicted.length} predicted) to ${OUTPUT_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
