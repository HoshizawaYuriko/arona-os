# bluearchive.wiki Cargo API schema

Reference for the raw data behind `scraper/index.mjs`. Verified directly against the
live API via Cargo's own introspection endpoints, plus
targeted sample pulls to check real data shapes:

- `action=cargotables` — lists every Cargo table on the wiki
- `action=cargofields&table=<name>` — lists a table's columns and declared types
- `action=cargoquery&tables=<name>&fields=...` — actual row data
- `action=cargoquery&tables=<name>&fields=<col>&group_by=<col>` — distinct values of one column

All tables on the wiki (only `events` and `banners` are used by the roadmap today):

```
banners, characters, club_names, emblems, events, furniture, items, media, raids,
sprites, tracks, unique_gear, world_raids
```

## Gotchas that apply to every table

- **Query field names use underscores, response keys use spaces.** You ask for
  `Start_date` in the query string; the JSON response keys that value as
  `"Start date"` (space). Same for every other underscored field name.
- **Every datetime field has a companion `<Field>__precision` key** in the response
  (e.g. `"Start date__precision": "0"`). Not currently used anywhere in the scraper —
  meaning of nonzero precision values hasn't been investigated.
- **Page-name fields can't be aliased starting with `_`**, so `_pageName` must be
  requested as `_pageName=Page` to come back under the key `Page`.
- Cargo paginates at 500 rows per request (handled internally in `scraper/lib/cargo.mjs`).

---

## `events` table

| Column | Type | We query it? | Description |
|---|---|---|---|
| `Uid` | String | ✅ (fetched, unused) | Synthetic composite key, e.g. `"GL_836_-ive aLIVE!_2024-10-22T11:00+09"` — server + Id + name + start time. |
| `Id` | Integer | ✅ | This specific run's ID. Reruns get their own `Id` distinct from the original. |
| `OriginalId` | Integer | ✅ | The *first-ever* run's `Id` — reruns point back to it. This is our JP↔GL pairing key. |
| `Server` | String | ✅ | `"JP"` or `"GL"`. |
| `Category` | String | ✅ | We filter to `"Event"` only (excludes recurring generic campaigns like `Rewards`). |
| `NameJP` | Wikitext string | ✅ (fetched, unused) | Japanese name. |
| `NameEN` | Wikitext string | ✅ | English display name. |
| `Promo` | File | ✅ | **The event's own distinct promotional key art.** Confirmed by inspection this is what we want for the roadmap card — it visually reads as a unique event illustration, not a UI chrome element. Empty on 18/197 checked event rows, so `Image` is still queried as a fallback. |
| `Image` | File | ✅ (fallback only) | Confirmed by inspection this is actually an in-game hotlink-style banner image (used to jump straight to the event's screen) — it visually resembles actual *gacha banner* artwork closely enough to undermine the roadmap's event-vs-banner visual distinction. We prefer `Promo`, falling back to `Image` only when `Promo` is empty. |
| `Start_date` | Start datetime | ✅ | `"YYYY-MM-DD HH:MM:SS"`, UTC. JP's 11:00 JST reset appears as `02:00:00` UTC. |
| `End_date` | End datetime | ✅ | Same format. Follows a "-1 minute before the actual reset" convention — an end of `01:59:00` frees that same day's `02:00:00` slot for the next item. |
| `Reward_exchange_start` | Datetime | ✅ (fetched, unused) | Event Shop Opening Time |
| `Reward_exchange_end` | Datetime | ✅ (fetched, unused) | Event Shop Closing Time, usually later than the Event End Date as a grace period to exchange remaining Shop Currency. |
| `Notes` | Wikitext | ✅ | Free text, empty in the samples checked so far. |
| `Description` | Wikitext | ✅ (fetched, unused) | Real prose synopsis on JP rows (e.g. "Let's make a band!..."); empty on the one corresponding GL row checked — unclear if GL rows ever get their own description or always inherit/omit it. |

### Example rows (`OriginalId 836`, JP + its GL counterpart)

```json
{
  "Page": "-ive aLIVE!", "Uid": "GL_836_-ive aLIVE!_2024-10-22T11:00+09", "Id": "836",
  "OriginalId": "836", "Server": "GL", "Category": "Event", "NameJP": "", "NameEN": "-ive aLIVE!",
  "Promo": "Event_-ive_aLIVE!.png", "Image": "Event_Banner_836_Jp.png",
  "Start date": "2024-10-22 02:00:00", "End date": "2024-11-05 01:59:00",
  "Reward exchange start": "2024-10-22 02:00:00", "Reward exchange end": "2024-11-12 01:59:00",
  "Notes": "", "Description": ""
}
```

```json
{
  "Page": "-ive aLIVE!", "Uid": "JP_836_-ive aLIVE!_2024-04-24T11:00+09", "Id": "836",
  "OriginalId": "836", "Server": "JP", "Category": "Event", "NameJP": "-ive aLIVE!", "NameEN": "-ive aLIVE!",
  "Promo": "Event_-ive_aLIVE!.png", "Image": "Event_Banner_836_Jp.png",
  "Start date": "2024-04-24 02:00:00", "End date": "2024-05-08 01:59:00",
  "Reward exchange start": "2024-04-24 02:00:00", "Reward exchange end": "2024-05-15 01:59:00",
  "Notes": "",
  "Description": "\"Let's make a band!\" To secure their access to Fredericka Semla, the Queen of Desserts, after-school sweets club decides to form a band for the school festival. Will they be able to assemble the band in the pursuit of a dessert worth dying for!?"
}
```

Promo vs. Image resolved (both go through the same `imageinfo` lookup):
- `Promo: "Event_-ive_aLIVE!.png"` → `https://static.wikitide.net/bluearchivewiki/9/9e/Event_-ive_aLIVE%21.png`
- `Image: "Event_Banner_836_Jp.png"` → `https://static.wikitide.net/bluearchivewiki/f/f5/Event_Banner_836_Jp.png`

---

## `banners` table

`Type` has exactly 6 real values on the wiki today (confirmed via `group_by=Type`), corresponding to Blue Archive's actual banner categories:

| `Type` value | In-game meaning | Roadmap-tracked? |
|---|---|---|
| `PickupGacha` | **Standard Banner.** Current rate-up characters are also in the Standard Pool (pullable off-rate). | ✅ |
| `LimitedGacha` | **Limited Banner.** Rate-up characters are permanently limited — never join the Standard Pool, only obtainable here and on reruns. | ✅ |
| `FesGacha` | **Fest Banner.** Runs on Anniversaries/Half-Anniversaries. Has its own Fest Pool separate from the Standard Pool; rate-ups are the current Fest characters; off-rates can come from either the Fest Pool or the Standard Pool. | ✅ |
| `SelectPickupGacha` | **Archive Banner.** Older characters removed from the Standard Pool. Runs at all times with no real end (confirmed: `End_date` of `2099-12-30`). | ❌ **deliberately skipped** — always available, so there's nothing for a roadmap to predict; everyone already knows it's there. |
| `SelectPickupFesGacha` | **Fest Archive Banner.** Same idea as the Archive Banner, but for old Fest characters removed from the Fest Pool. Unlike the plain Archive Banner, this one runs on an actual schedule (confirmed: real, non-`2099` `End_date`s). | ✅ (with one exception below) |
| `SelectPickupLimitedGacha` | **Limited Archive Banner.** Same idea, for old limiteds. Also runs on a real schedule (confirmed the same way). | ✅ |

### `Type` is not a reliable standalone "does this run forever" signal

A JP-only row surfaced (`Code: "Limited_Dash_release"`, `Id: 2100`) filed under
`Type: SelectPickupFesGacha` — one of the types we track as a real rotating banner —
but with `End_date: "2099-12-30 18:59:00"`, the same far-future sentinel as the plain
(excluded) Archive Banner. It's not a real Fest Archive rotation: it's a permanent
"Limited Dash" banner offered to new players for their first 28 days, letting them
catch up on `Wakamo, Hoshino (Swimsuit), Mika` outside the normal schedule. Since it
never ends, there's nothing to predict from it — same reasoning as excluding the plain
Archive Banner.

**Because of this, the scraper no longer excludes standing banners by `Type` alone.**
`scraper/index.mjs` now also drops any banner row (regardless of `Type`) whose
`End_date` year is `>= 2090` — catching both the plain Archive Banner and this Limited
Dash case, plus any future one-off shaped the same way, without needing to know its
`Code` or `Type` in advance.

```json
{
  "Page": "Banner List/Banners of 2026", "Uid": "JP_Limited_Dash_release", "Id": "2100", "Server": "JP",
  "Code": "Limited_Dash_release", "Type": "SelectPickupFesGacha", "CrossregionId": "0",
  "NameJP": "Limited Dash Recruitment", "NameEN": "Limited Dash Recruitment",
  "Rateup character": "Wakamo, Hoshino (Swimsuit), Mika", "Rerun": "0", "Limited": "1",
  "Start date": "2026-06-24 02:00:00", "End date": "2099-12-30 18:59:00",
  "Notes": "selectable rate-up character, students removed from Anniversary pool"
}
```

| Column | Type | We query it? | Description |
|---|---|---|---|
| `Uid` | String | ✅ (fetched, unused) | Synthetic key. **Not consistently shaped** — short on single-character banners (`"GL_Arisu_release"`), but embeds the *entire* comma-joined character list on multi-character Archive banners (`"GL_Wakamo,Hoshino_(Swimsuit),Mika_release"`). |
| `Id` | Integer | ✅ | This run's ID. |
| `Server` | String | ✅ | `"JP"` or `"GL"`. |
| `Code` | String | ✅ (fetched, unused) | Same inconsistency as `Uid` — short slug on single-character banners, full embedded character list on multi-character ones. Not reliable as a clean identifier on its own. |
| `Type` | String | ✅ | See the table above. Drives the roadmap's banner-type chip directly — no separate mapping stored in the data, just the raw Cargo value. |
| `CrossregionId` | Integer | ✅ | **Unreliable as a JP↔GL pairing key** — matched pairs can have different values, unpaired rows share a sentinel `"0"`, and this holds even for the Archive types: one checked `SelectPickupFesGacha` pair had `CrossregionId "7000"` on the GL row but `"0"` on its JP counterpart. We pair on `Rateup_character` instead. |
| `NameJP` | String | ✅ (fetched, unused) | Japanese name. Not always populated even where you'd expect it — one checked JP row had it empty. |
| `NameEN` | String | ✅ | **Flavor text, not the character name** (e.g. `"BUM BUM BUM! ARIS HAS JOINED THE PARTY!"`). Also not always populated (empty on a checked JP `SelectPickupFesGacha` row). |
| `Image` | File | ✅ | Bare filename, same resolution process as events. No `Promo`-equivalent exists on this table. |
| `Rateup_character` | Page, **isList**, delimiter `,` | ✅ | The actual pairing key we use. **Confirmed as a real comma-delimited list** — single character on `PickupGacha`/`LimitedGacha`/`FesGacha`, 2–3 on `SelectPickupFesGacha`, up to 10 on `SelectPickupLimitedGacha`, and as many as 38 on the (skipped) plain `SelectPickupGacha`. Checked that the full combo string stays identically ordered across a matched JP/GL pair (e.g. `"Wakamo, Hoshino (Swimsuit), Mika"` appears character-for-character the same on both sides) — so it's used as one opaque pairing string rather than exploded per-character. Not stress-tested beyond the handful of pairs checked. |
| `Rerun` | Boolean | ✅ | `"0"`/`"1"` in the raw response. |
| `Limited` | Boolean | ✅ (fetched, unused) | **Relationship to `Type` is inconsistent** — `"1"` on the `FesGacha`/`LimitedGacha` rows checked, but `"0"` on a `SelectPickupLimitedGacha` row despite the name. Meaning still unclear; not used for anything. |
| `Start_date` | Start datetime | ✅ | Same format/convention as events. |
| `End_date` | End datetime | ✅ | Same "-1 minute before reset" convention as events. |
| `Notes` | Text | ✅ | **Not always empty** — carries real mechanical detail on Fest/Archive-Fest banners, e.g. `"1-year anniversary — 3★ characters rate is doubled"`, `"selectable rate-up character, students removed from Anniversary pool"`. |

### Example rows, one per `Type`

**`PickupGacha`** (Standard Banner):
```json
{"Uid":"GL_Arisu_release","Id":"24","Server":"GL","Code":"Arisu_release","Type":"PickupGacha","CrossregionId":"21","NameJP":"","NameEN":"BUM BUM BUM! ARIS HAS JOINED THE PARTY!","Image":"Lobby_Banner_EN_20211228_01.png","Rateup character":"Arisu","Rerun":"0","Limited":"0","Start date":"2021-12-28 03:30:00","End date":"2022-01-11 03:00:00","Notes":""}
```

**`LimitedGacha`** (Limited Banner):
```json
{"Uid":"GL_Aru_(New_Year)_release","Id":"101","Server":"GL","Code":"Aru_(New_Year)_release","Type":"LimitedGacha","CrossregionId":"111","NameJP":"","NameEN":"I've been waiting. Now, I'll be escorting you, Sensei","Image":"Lobby_Banner_EN_20220809_01.png","Rateup character":"Aru (New Year)","Rerun":"0","Limited":"1","Start date":"2022-08-09 03:00:00","End date":"2022-08-23 03:00:00","Notes":""}
```

**`FesGacha`** (Fest Banner):
```json
{"Uid":"GL_Wakamo_release","Id":"111","Server":"GL","Code":"Wakamo_release","Type":"FesGacha","CrossregionId":"121","NameJP":"","NameEN":"My heart, my soul, everything. They're all yours.","Image":"Lobby_Banner_EN_20220906_01.png","Rateup character":"Wakamo","Rerun":"0","Limited":"1","Start date":"2022-09-06 02:00:00","End date":"2022-09-10 01:59:00","Notes":"1-year anniversary — 3★ characters rate is doubled"}
```

**`SelectPickupGacha`** (Archive Banner — skipped, shown only for reference):
```json
{"Uid":"GL_Archive_release","Id":"6000","Server":"GL","Code":"Archive_release","Type":"SelectPickupGacha","CrossregionId":"6000","NameEN":"Archive Recruitment","Image":"Archive_Banner_EN.png","Rateup character":"Aru, Eimi, Haruna, Hifumi, Hina, Iori, Maki, Neru, Izumi, Shun, Sumire, Tsurugi, Hibiki, Karin, Saya, Hoshino, Shiroko, Mashiro, Izuna, Arisu, Midori, Cherino, Yuzu, Azusa, Koharu, Hifumi (Swimsuit), Shiroko (Riding), Shun (Kid), Saya (Casual), Asuna (Bunny Girl), Natsu, Ako, Cherino (Hot Spring), Chinatsu (Hot Spring), Nodoka (Hot Spring), Serika (New Year), Sena, Chihiro","Rerun":"0","Limited":"0","Start date":"2025-09-23 02:00:00","End date":"2099-12-30 18:59:00","Notes":""}
```

**`SelectPickupFesGacha`** (Fest Archive Banner):
```json
{"Uid":"GL_Wakamo,Hoshino_(Swimsuit),Mika_release","Id":"7000","Server":"GL","Code":"Wakamo,Hoshino_(Swimsuit),Mika_release","Type":"SelectPickupFesGacha","CrossregionId":"7000","NameEN":"Anniversary Archive Recruitment","Image":"Lobby_Banner_EN_20260505_01.png","Rateup character":"Wakamo, Hoshino (Swimsuit), Mika","Rerun":"0","Limited":"1","Start date":"2026-05-05 02:00:00","End date":"2026-05-12 01:59:00","Notes":"selectable rate-up character, students removed from Anniversary pool"}
```

**`SelectPickupLimitedGacha`** (Limited Archive Banner):
```json
{"Uid":"GL_Azusa_(Swimsuit),Mashiro_(Swimsuit),Hina_(Swimsuit),Iori_(Swimsuit),Neru_(Bunny_Girl),Karin_(Bunny_Girl),Aru_(New_Year),Mutsuki_(New_Year),Izuna_(Swimsuit),Chise_(Swimsuit)_release","Id":"8000","Server":"GL","Type":"SelectPickupLimitedGacha","CrossregionId":"8000","NameEN":"Encore Recruitment","Image":"Lobby_Banner_EN_20260707_01.png","Rateup character":"Azusa (Swimsuit), Mashiro (Swimsuit), Hina (Swimsuit), Iori (Swimsuit), Neru (Bunny Girl), Karin (Bunny Girl), Aru (New Year), Mutsuki (New Year), Izuna (Swimsuit), Chise (Swimsuit)","Rerun":"0","Limited":"0","Start date":"2026-07-07 02:00:00","End date":"2026-07-14 01:59:00","Notes":""}
```

---

## Open questions (unclear from what's been checked so far)

- `Description` on events — empty on the one GL row checked. Does GL ever get its own description, or is it JP-only / consistently omitted?
- `Limited` on banners — genuinely unclear what it tracks separately from `Type`, given the inconsistency spotted above.
- `Code`/`Uid` on banners — usable for anything, or just wiki-internal bookkeeping? The embedded-character-list inconsistency makes them unappealing as identifiers either way.
- `Rateup_character` ordering stability — confirmed consistent on the handful of pairs checked, not proven in general. Worth revisiting if a JP/GL pairing mismatch ever shows up for a multi-character banner.