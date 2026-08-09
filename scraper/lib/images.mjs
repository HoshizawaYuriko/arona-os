// Resolves Cargo's raw file-reference filenames (e.g. "Lobby_Banner_EN_20230411_01.png",
// or events' "Event Code BOX Shadow Looming Over Millennium ～One Question and Two
// Answers～.png") to actual hosted URLs via MediaWiki's file API. The Cargo tables only
// ever give a filename, not a URL — this is the one extra round-trip needed to make it
// usable in an <img src>. Verified live: resolves to
// https://static.wikitide.net/bluearchivewiki/..., which the deployed site hotlinks
// directly rather than downloading/rehosting.

const API = 'https://bluearchive.wiki/w/api.php';
const USER_AGENT = 'ba-roadmap-bot/1.0 (github.com/<you>/ba-roadmap; scrapes public Cargo tables for a fan schedule predictor)';
const BATCH_SIZE = 50; // MediaWiki's default max titles per query for unauthenticated requests

/**
 * @param {string[]} filenames - raw values of a file-reference field. NOT assumed to
 *   share one space/underscore convention — `Image` always comes underscored, but
 *   `Promo` (events) comes with real spaces intact, and the two get mixed into the same
 *   call site's filename list. See the reverse-lookup below for how each is preserved.
 * @returns {Promise<Map<string, string>>} filename -> resolved image URL, keyed by
 *   exactly the string you passed in (entries missing here mean the file couldn't be
 *   resolved — treat as "no image available")
 */
export async function resolveImageUrls(filenames) {
  const unique = [...new Set(filenames.filter(Boolean))];
  const urlByFilename = new Map();

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const params = new URLSearchParams({
      action: 'query',
      titles: batch.map((f) => `File:${f}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
    });

    const res = await fetch(`${API}?${params.toString()}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      throw new Error(`Image resolution failed: HTTP ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    const pages = json.query?.pages ?? {};
    // MediaWiki reports title normalizations it applied (space<->underscore, and
    // others) as { from, to } pairs — build the reverse lookup so each result maps
    // back to whichever *original* filename we actually requested, whatever convention
    // it used, instead of assuming every input is underscored. That assumption held
    // for `Image` (always underscored) but broke silently for `Promo`, whose values
    // come with real spaces (e.g. "Event Code BOX Shadow Looming Over Millennium
    // ～One Question and Two Answers～.png") — force-normalizing the response to
    // underscores produced a map key that never matched the space-separated filename
    // callers were actually looking up, even though the file itself resolved fine.
    const requestedTitleByNormalized = new Map((json.query?.normalized ?? []).map((n) => [n.to, n.from]));

    for (const page of Object.values(pages)) {
      const url = page.imageinfo?.[0]?.url;
      if (!url) continue; // "missing" pages (deleted/renamed files) have no imageinfo
      const requestedTitle = requestedTitleByNormalized.get(page.title) ?? page.title;
      const filename = requestedTitle.replace(/^File:/, '');
      urlByFilename.set(filename, url);
    }
  }

  return urlByFilename;
}