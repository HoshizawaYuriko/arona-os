# Arona OS

A toolbox of small Blue Archive utilities — no backend, no database, everything is a
static site with any data fetching done ahead of time in CI. Currently one tool:

## Predicted Roadmap

Predicts Blue Archive **Global**'s upcoming Events/Banners by reading Japan's
already-known schedule from [bluearchive.wiki](https://bluearchive.wiki) and
re-mapping it onto Global's queue. A GitHub Actions job scrapes on a schedule; the
Angular app just reads the resulting static JSON.

### How it works

1. **`scraper/`** (plain Node, no deps) queries bluearchive.wiki's Cargo API — a
   structured MediaWiki extension, not HTML scraping — for the `events` and `banners`
   tables, for both `Server=JP` and `Server=GL`.
2. It matches each JP occurrence to its GL counterpart (events pair on `OriginalId`;
   banners pair on the rate-up character name — see comments in
   `scraper/lib/predict.mjs` for why `CrossregionId` turned out *not* to be a reliable
   pairing key despite the name).
3. The latest confirmed GL end date becomes the "cursor." Every JP occurrence that
   doesn't have a GL match yet gets walked forward from the cursor onto the next
   Tuesday, with its JP-observed duration snapped to 1 or 2 weeks (Global's only two
   valid event/banner lengths) — and the same gap JP itself left before that item, if
   any (events routinely have a dead week with nothing running; banners never do —
   both are measured from real JP history, not assumed). Items that don't fit that
   pattern (anniversaries, collabs, an unsnappable gap, etc.) are still placed, but
   flagged `irregular: true` for manual review.
4. Output is `public/data/schedule.json` — bundled by `ng build` as a static asset,
   never committed to the repo (see `.gitignore`; CI regenerates it every run).
5. The Angular app (`src/app`) is a plain client-rendered SPA that fetches
   `data/schedule.json` at runtime and renders a merged events+banners timeline.

### Manual correction

`scraper/confirmed.json` is the one file meant to be hand-edited:

- `cursorOverride.events` / `cursorOverride.banners` — set to an ISO date only if you
  know Global has officially confirmed something further out than what
  bluearchive.wiki currently lists for `Server=GL`. Leave `null` to trust the wiki.
  This only moves the *starting point* — it can't cancel or change the gap on one
  specific transition; that's what `manualOverrides` is for.
- `manualOverrides.events` / `manualOverrides.banners` — pin one specific upcoming
  item to an exact date, e.g. when a Global announcement confirms it follows the
  previous one with a different gap than JP's own history implies. Each entry is
  `{ pairKey, startDate, note? }` — `pairKey` is the OriginalId (events) or rate-up
  character name (banners), both visible in that item's tooltip on the roadmap;
  `startDate` is `"YYYY-MM-DD"`. Only pins that one transition — everything later
  still auto-computes its own gap, chained from wherever the pinned item lands. The
  scraper warns (doesn't fail) if an override's `pairKey` is never matched — usually
  because the item already became confirmed, or a typo.
- `manualNotes` — free-text space for tracking known irregular items to fix by hand.

## Local development

```bash
npm ci
node scraper/index.mjs   # writes public/data/schedule.json from live wiki data
npx ng serve              # http://localhost:4200
```

## Deployment

`.github/workflows/deploy.yml` runs the scraper, builds, and deploys to GitHub Pages
on every push to `main`, once daily on a schedule, and on manual dispatch. One-time
setup: repo Settings → Pages → **Source: GitHub Actions**.

If this repo isn't deployed as a standard project page
(`https://<user>.github.io/<repo>/`) — e.g. a custom domain or a user/org root page —
change the `--base-href` flag in the workflow to `"/"`.