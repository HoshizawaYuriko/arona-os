// Thin client for bluearchive.wiki's Cargo API (MediaWiki extension).
// Docs: https://bluearchive.wiki/w/api.php?action=help&modules=cargoquery
// No API key, no CORS support (checked) — this must run server-side (CI), never from the browser.

const API = 'https://bluearchive.wiki/w/api.php';
const USER_AGENT = 'ba-roadmap-bot/1.0 (github.com/<you>/ba-roadmap; scrapes public Cargo tables for a fan schedule predictor)';
const PAGE_LIMIT = 500; // Cargo's practical max per request; we paginate past it.

/**
 * Runs a Cargo query, transparently paginating until all matching rows are collected.
 * @param {string} table
 * @param {string[]} fields - Cargo field names, optionally aliased as "Field=Alias".
 *   NOTE: Cargo rejects an alias that itself starts with "_" (e.g. bare `_pageName`),
 *   so the page-name pseudo-field must always be aliased: `_pageName=Page`.
 * @param {{ where?: string, orderBy?: string }} [opts]
 */
export async function cargoQuery(table, fields, { where, orderBy } = {}) {
  const rows = [];
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      action: 'cargoquery',
      tables: table,
      fields: fields.join(','),
      format: 'json',
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    if (where) params.set('where', where);
    if (orderBy) params.set('order by', orderBy);

    const res = await fetch(`${API}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`Cargo query on "${table}" failed: HTTP ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    if (json.error) {
      throw new Error(`Cargo query on "${table}" returned an error: ${json.error.info}`);
    }

    const page = (json.cargoquery ?? []).map((r) => r.title);
    rows.push(...page);

    if (page.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return rows;
}
