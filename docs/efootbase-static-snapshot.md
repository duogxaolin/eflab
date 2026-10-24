# efootbase static snapshot (skills + picker managers)

> Written 2026-10-19 (openspec change `efootbase-static-data`). Snapshot taken 2026-10-18 with a browser survey of efootbase.com; the manager list was refreshed on 2026-10-24 by reading the manager drawer's rendered rows (change `efootbase-data-refresh-1024`, see "Refresh procedure (2026-10-24)"), and the skills index read the same day matched `skills.json` (no skill change). **Best effort and fragile**: it depends on how efootbase builds its pages today and will go stale. No part of it is automated in this repository.

The seeder (`pnpm db:seed`, `packages/db/src/seed-efootbase-full.ts`) reads two optional files from the git-ignored dump area. Images go to R2. **None of the third-party content (descriptions, activation text, icons, manager art, the JSON itself) is committed.** The repository holds only code, fact-only fixtures (ids, names, numbers) and this description.

```
dump/efootbase/static/            (git-ignored: dump/ is in .gitignore)
  skills.json                     72 skills (67 released + 5 unreleased)
  managers.json                   70 picker managers in the drawer's order (2026-10-24)
  managers-2026-10-18.json        the previous file (69), kept for diffing
  skill-icons/Skill_<Name>.webp   67 icons in two sizes: 58 × 576×346, 9 × 576×324 (+ _manifest.json: source URL, bytes, sha256)
  manager-images/<id>.webp        70 manager images, 256×256 (+ _manifest.json)
```

If a file is missing, the seed prints a `⚠` warning and continues. The two files behave differently:

- **`skills.json` missing → skill metadata is erased.** The seed rebuilds the Skill table from the fixture inside its transaction, so efootbase names, descriptions, group, order, `efbKey`, icon key, effects and activation loaded by an earlier run are gone; skills keep only their fixture names and descriptions until a seed runs with the snapshot again. A fresh clone therefore seeds, but its skills page lists every skill under "Other".
- **`managers.json` missing → `Manager.inPicker` is left as it is.** The flag is written only by a dedicated UPDATE that runs when the file is present; the fixture upsert never touches it.

## File shapes (actual key names)

`skills.json` is an array of 72 objects, each with:

| key | meaning |
|---|---|
| `key` | efootbase skill flag, e.g. `s_one_touch_pass` (same as the `s_*` columns of `players.jsonl`) |
| `order` | 0–71, efootbase's wiki order |
| `slug`, `name` | efootbase's slug and display name ("One-touch Pass") |
| `group` | `"showtime"` or `"classic"` (lower case). The 5 unreleased skills are all `showtime`. |
| `on_wiki_list` | `false` for the 5 unreleased skills (`s_sharp_cut`, `s_beast_drive`, `s_decisive_pass`, `s_gk_rush_out`, `s_gk_aerial_claim`) |
| `description` | English description (third-party text: database only) |
| `icon_file` | `Skill_<Name>.webp`. The 5 unreleased skills name a file that does not exist. |
| `boost` | `null`, or `{ effects: [{ kind: "flat", attributeKey, value }], rows: [...], activation }` (28 skills) |
| `wiki_list_description`, `cards_listed`, `leader`, `icon_path` (the icon's site path, a string), `boost_observed`, `observed_on` | survey bookkeeping, not read |

The seed maps `boost.effects[].attributeKey` to an eFootLab stat. The keys are efootbase's **camelCase** names (`tackling`, `jumping`, `setPieceTaking`, `gkParrying` …). Only `kind: "flat"` exists.

`managers.json` is an array of 70 `{ id, name, rating, booster_1, booster_2, image }` (2026-10-24; 69 on 2026-10-18), **in the reference drawer's order** — the seed stores each one's 0-based index as `Manager.pickerOrder`, and `manager.picker` sorts rating DESC, `pickerOrder` ASC, id ASC. `id` is a 14-digit string. `booster_1`/`booster_2` are efootbase **snake_case** stat keys (`lofted_pass`, `tackling`); `booster_2` may be `null` (24 of the 70). `image` is the file name `<id>.webp` since 2026-10-24 (the address the drawer row loads); the 2026-10-18 file said `<id>.png`, although the files were WebP. The seed does not read the snapshot's `image`: the stored art URL (`Manager.imageUrl` = `<R2 base>/managers/<image>`) comes from the fixture's own `image` (`<id>.webp` on all 70 fixture rows).

Stat names on both sides go through one explicit table, `EFOOTBASE_STAT_MAP` in `@eflab/shared` (`packages/shared/src/constants.ts`, both spellings → `BASE_STATS`, unit-tested; `scripts/verify-seed.py` mirrors it). An unknown key aborts the seed before the transaction opens.

## Refresh procedure (2026-10-24) — the current way for the manager list

The manager list is refreshed **from the rendered page only**: no script bundle, no i18n chunk, no direct API request (change `efootbase-data-refresh-1024`, design D6; the survey record stays outside the repository).

1. **One load of a player page** in a real, headed browser with a fresh profile. Answer the cookie banner with "Reject optional". Stop at once at any challenge, 403 / 429 or HTML-instead-of-JSON answer, and do not retry for at least 6 hours.
2. Open **"Select Manager"** and wheel-scroll the drawer's list to its end so every row has rendered. Read each row **in DOM order**:
   - the **id** from the row image's address (`…/managers/<id>.webp`). Key the rows by this id, never by their text: two different cards can show identical text (both Xabi Alonso 88 rows carry the same name, rating and pill), and a text-keyed reading merges them — the 2026-10-23 "one Xabi Alonso 88" error;
   - the name, the rating badge and the one or two "+1" pills, in their order.
3. **Write `managers.json`**: the rows in drawer order (that order is the picker order inside a rating), keys `id`, `name`, `rating`, `booster_1`, `booster_2`, `image` (`<id>.webp`). Map each pill label to its stat (`statLabel`) and then to the efootbase snake_case key (`EFOOTBASE_STAT_MAP`: Tackling → `tackling`, Jumping → `jumping`, Place Kicking → `set_piece_taking`). Keep the previous file as `managers-<date>.json`.
4. **Fixture**: add a row to `packages/db/fixtures/managers.json` for each new manager (facts only: id, name, rating, pills, `image`). A manager that changed must be changed there too, or the seed aborts. A manager that left the picker may stay in the fixture: the seed flags only the snapshot ids.
5. **Art of a new manager**: take it from the image the drawer itself loaded (no extra request), stage only the `.webp` and upload it with `r2_upload.py --key-prefix managers/` in resume mode (see below). Check that a HEAD on `managers/<id>.webp` answers 200.
6. **Skills**: load the skills index **at least 97 s** after the player page and compare its tiles (slugs, names, groups, order within each group) with the `on_wiki_list` entries of `skills.json`. A new or removed skill stops the refresh. It needs its own snapshot work (description, icon, boosts).
7. Before seeding, check the snapshot against the fixture (the seed's own `loadStaticManagers` rules: every id in the fixture, same name / rating / pills, unique ids).

**Result on 2026-10-24.** 70 rows: ratings 90 ×7 · 89 ×30 · 88 ×23 · 87 ×3 · 85 ×6 · 83 ×1, 46 with two pills.
- 1 added: Niko Kovač 90, id 17610439655559, Ball Control + Defensive Engagement.
- 0 removed, 0 changed.
- Both Xabi Alonso 88 cards are listed (17593796759765, 17598897033429).
- The drawer order equals the 2026-10-18 file's order, stable-sorted by rating DESC, with Kovač last among the 90s. Rating 90 reads: Roberto Martínez, Thomas Tuchel, Antonio Conte, José Mourinho, Cristian Chivu, Jürgen Klopp, Niko Kovač.
- Skills index: 67 tiles (Showtime 23, Classic 44), identical to `skills.json`.

## How the 2026-10-18 snapshot was produced (history; skills are still regenerated this way)

Load efootbase.com in a real browser (the site is a Next.js app; plain `curl` gets only the shell). Then:

1. **Manager list** (2026-10-18 only — replaced by the drawer reading above): the JS chunk that renders the manager picker on a player page contains a literal array of objects with `booster_1`, `booster_2`, `rating`, `name` and `id`. It was found by searching the loaded chunks for `booster_1` and copied into `managers.json`. That file is not sorted by rating; stable-sorted by rating DESC it gives exactly the 2026-10-24 drawer order (Kovač aside), but nothing stored that order before `pickerOrder` (the seed sorted the ids, `manager.picker` sorted by id inside a rating).
2. **Manager images** (2026-10-18): `https://efootbase.com/images/managers/{id}.webp`, one per id.
3. **Skill titles and descriptions**: the English i18n chunk (search for a known description sentence) holds the skill title and description per `s_*` key. `/wiki/skills` gives the order, the Showtime/Classic split and which skills are listed (`on_wiki_list`).
4. **Skill boost effects and activation**: player pages embed the card's `skills` data in the page payload. A skill's stat boosts (`attributeKey`, `value`) and activation text appear only on pages of cards that carry that skill. The survey loaded about 20 cards chosen to cover every boosting skill. **Effects therefore exist only for skills seen on a loaded card.** A skill without a `boost` shows no effect text, never a guess.
5. **Skill icons**: `https://efootbase.com/icons/skills/Skill_<Name>.webp` (name as in `icon_file`).

Keep the key names above, or update the seeder's reader in the same change. After regenerating, check:

```bash
python3 -I -c "import json; d=json.load(open('dump/efootbase/static/skills.json')); print(len(d))"
```

## Upload to R2 (existing tool)

`scripts/r2_upload.py` uploads every non-dot file under `--prefix`, so stage a folder that holds **only** the `.webp` files. The `_manifest.json` files must not go to the public bucket. Credentials come from the root `.env` (`R2_*`, never printed). The script sets `Content-Type: image/webp` and `Cache-Control: public, max-age=31536000, immutable`, and in its default resume mode it skips keys that already exist. Do **not** pass `--no-resume` for `managers/`: that would overwrite the original 496×496 manager art with the 256×256 snapshot images.

```bash
mkdir -p "$STAGE/skills" "$STAGE/managers"
cp dump/efootbase/static/skill-icons/*.webp "$STAGE/skills/"
cp dump/efootbase/static/manager-images/<new id>.webp "$STAGE/managers/"   # new managers only
python3 scripts/r2_upload.py --prefix "$STAGE/skills"   --key-prefix skills/   --dry-run   # expect skills/Skill_<Name>.webp
python3 scripts/r2_upload.py --prefix "$STAGE/skills"   --key-prefix skills/
python3 scripts/r2_upload.py --prefix "$STAGE/managers" --key-prefix managers/
# verify: curl -sI "$R2_PUBLIC_BASE/skills/Skill_OneTouchPass.webp" → 200 image/webp
```

On 2026-10-19, 67 icons (`skills/Skill_<Name>.webp`) and the 4 new manager images (`managers/{id}.webp`) were uploaded, and all 71 returned 200 to a HEAD request. The icons come in two sizes (58 at 576×346, 9 at 576×324, read from the WebP headers); the web (`components/skills/SkillIcon.tsx`) draws them in a 576:346 box with `object-fit: contain`, so the shorter ones are letterboxed, never cropped.

On 2026-10-24 Niko Kovač's art was uploaded to `managers/17610439655559.webp` (10,166 bytes, 256×256, resume mode: 1 ok, 0 skipped, 0 errors). The key answered 404 before and 200 `image/webp` after. All 70 picker ids answer 200.

## What the seed does with it

- **Skills**: the fixture slug stays the join key (`s_x_y → x-y` plus the 4 aliases). Each snapshot skill must match a fixture slug, or the seed aborts. A matched skill gets `efbKey`, `group` (`SHOWTIME`/`CLASSIC`), `sortOrder`, `iconKey` (`skills/<icon_file>`, only when the icon file exists), `effects` (`[{ stat, value }]` with eFootLab stat names), `activation`, plus efootbase's `name` and `description`.
- **Unreleased skills**: the 5 are fixture rows 85–89 with `released: false`. They are stored with efootbase's name, description, group (Showtime), `efbKey` and `sortOrder`, but without an icon key (the icon file does not exist), stat effects or activation, and no card holds them. They are hidden from `skill.list` / `skill.byId`.
- **Non-skill entries**: the 17 fixture entries efootbase does not treat as skills keep their rows and fixture text, with no group ("Other" on the skills page).
- **Fixture `category`**: a free-text column no page reads (only the unused `skill.list` `category` filter). The 21 fixture entries that used to say "Premium" (ids 59–67, 73–84, all efootbase Showtime skills) now carry `"category":"Showtime"`, and their fixture descriptions lost the invented "Premium — " prefix (2026-10-19); ids, slugs and names are unchanged.
- **Managers**: every snapshot manager must exist in `packages/db/fixtures/managers.json` with the same name, rating and pills, or the seed aborts. `inPicker` is set for exactly the snapshot ids. The same UPDATE writes `pickerOrder`, the 0-based index in the file (NULL outside the picker; since change `efootbase-data-refresh-1024`). The seed then checks: n flagged, orders 0…n−1, none outside the picker. `scripts/verify-seed.py` compares `pickerOrder` with the file. Cross-fill columns (tactics, age, country …) are never written. The pills (`booster1Stat`/`booster2Stat`) are stored as eFootLab stat names; for the 65 managers that existed before, this changed the stored values from the fixture's raw snake_case (`lofted_pass`) to camelCase (`loftedPass`) on the 2026-10-19 seed. Nothing reads these two columns today.
- **Manager tactics of the 4 new picker cards** come from the next `pnpm db:crossfill`, not from the snapshot. Makino Tomoaki and R. Rodríguez are eFHUB ids and get their own numbers. The new Jürgen Klopp and Cristian Chivu cards are not in the eFHUB file, and efootbase has no manager tactic data (its picker shows only the rating and the pills). eFHUB's Klopp entry and best Chivu entry are the other Klopp / Chivu cards already in the table, so the cross-fill leaves the two new cards without tactics and warns instead of copying another card's numbers. State after the 2026-10-24 refresh:
- Makino Tomoaki and R. Rodríguez carry their own eFHUB numbers, and their no-art twins 104079 / 100528 are gone.
- Klopp and Chivu have none.
- **Niko Kovač 90** (17610439655559) is not an eFHUB id either. Its name's best eFHUB entry is coach 135 "Niko Kovac", which is no Manager row, so the skip rule does not apply: the name merge gave it coach 135's tactics (another version of the coach). This is a known limitation; tactics are displayed nowhere.
