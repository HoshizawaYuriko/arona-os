// Resolves Cargo's raw `Image` filenames (e.g. "Lobby_Banner_EN_20230411_01.png") to
// actual hosted URLs via MediaWiki's file API. The Cargo tables only ever give a
// filename, not a URL — this is the one extra round-trip needed to make it usable in
// an <img src>. Verified live: resolves to https://static.wikitide.net/bluearchivewiki/...,
// which the deployed site hotlinks directly rather than downloading/rehosting.

const API = 'https://bluearchive.wiki/w/api.php';
const USER_AGENT = 'ba-roadmap-bot/1.0 (github.com/<you>/ba-roadmap; scrapes public Cargo tables for a fan schedule predictor)';
const BATCH_SIZE = 50; // MediaWiki's default max titles per query for unauthenticated requests

/**
 * @param {string[]} filenames - raw values of the `Image` field, underscores intact
 * @returns {Promise<Map<string, string>>} filename -> resolved image URL (entries
 *   missing here mean the file couldn't be resolved — treat as "no image available")
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

    for (const page of Object.values(pages)) {
      const url = page.imageinfo?.[0]?.url;
      if (!url) continue; // "missing" pages (deleted/renamed files) have no imageinfo
      // MediaWiki normalizes the title's underscores to spaces in its response;
      // convert back so the map's keys match our original (underscored) filenames.
      const filename = page.title.replace(/^File:/, '').replace(/ /g, '_');
      urlByFilename.set(filename, url);
    }
  }

  return urlByFilename;
}