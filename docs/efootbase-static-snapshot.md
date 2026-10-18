# efootbase static snapshot (skills + picker managers)

> Written 2026-10-19 (openspec change `efootbase-static-data`). Snapshot taken 2026-10-18 with a browser survey of efootbase.com. **Best effort and fragile**: it depends on how efootbase builds its pages today and will go stale. No part of it is automated in this repository.

The seeder (`pnpm db:seed`, `packages/db/src/seed-efootbase-full.ts`) reads two optional files from the git-ignored dump area. Images go to R2. **None of the third-party content (descriptions, activation text, icons, manager art, the JSON itself) is committed.** The repository holds only code, fact-only fixtures (ids, names, numbers) and this description.

```
dump/efootbase/static/            (git-ignored: dump/ is in .gitignore)
  skills.json                     72 skills (67 released + 5 unreleased)
  managers.json                   69 picker managers
  skill-icons/Skill_<Name>.webp   67 icons in two sizes: 58 × 576×346, 9 × 576×324 (+ _manifest.json: source URL, bytes, sha256)
  manager-images/<id>.webp        69 manager images, 256×256 (+ _manifest.json)
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

`managers.json` is an array of 69 `{ id, name, rating, booster_1, booster_2, image }`. `id` is a 14-digit string. `booster_1`/`booster_2` are efootbase **snake_case** stat keys (`lofted_pass`, `tackling`); `booster_2` may be `null`. `image` says `.png`, but the files are WebP.

Stat names on both sides go through one explicit table, `EFOOTBASE_STAT_MAP` in `@eflab/shared` (`packages/shared/src/constants.ts`, both spellings → `BASE_STATS`, unit-tested; `scripts/verify-seed.py` mirrors it). An unknown key aborts the seed before the transaction opens.

## How the snapshot was produced (regeneration, by hand)

Load efootbase.com in a real browser (the site is a Next.js app; plain `curl` gets only the shell). Then:

1. **Manager list**: the JS chunk that renders the manager picker on a player page contains a literal array of objects with `booster_1`, `booster_2`, `rating`, `name` and `id`. Find it by searching the loaded chunks for `booster_1`, then copy the array into `managers.json` (keep the keys).
2. **Manager images**: `https://efootbase.com/images/managers/{id}.webp`, one per id.
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

## What the seed does with it

- **Skills**: the fixture slug stays the join key (`s_x_y → x-y` plus the 4 aliases). Each snapshot skill must match a fixture slug, or the seed aborts. A matched skill gets `efbKey`, `group` (`SHOWTIME`/`CLASSIC`), `sortOrder`, `iconKey` (`skills/<icon_file>`, only when the icon file exists), `effects` (`[{ stat, value }]` with eFootLab stat names), `activation`, plus efootbase's `name` and `description`.
- **Unreleased skills**: the 5 are fixture rows 85–89 with `released: false`. They are stored with efootbase's name, description, group (Showtime), `efbKey` and `sortOrder`, but without an icon key (the icon file does not exist), stat effects or activation, and no card holds them. They are hidden from `skill.list` / `skill.byId`.
- **Non-skill entries**: the 17 fixture entries efootbase does not treat as skills keep their rows and fixture text, with no group ("Other" on the skills page).
- **Managers**: every snapshot manager must exist in `packages/db/fixtures/managers.json` with the same name, rating and pills, or the seed aborts. `inPicker` is set for exactly the snapshot ids. Cross-fill columns (tactics, age, country …) are never written. The pills (`booster1Stat`/`booster2Stat`) are stored as eFootLab stat names; for the 65 managers that existed before, this changed the stored values from the fixture's raw snake_case (`lofted_pass`) to camelCase (`loftedPass`) on the 2026-10-19 seed. Nothing reads these two columns today.
- **Manager tactics of the 4 new picker cards** come from the next `pnpm db:crossfill`, not from the snapshot. Makino Tomoaki and R. Rodríguez are eFHUB ids and get their own numbers. The new Jürgen Klopp and Cristian Chivu cards are not in the eFHUB file: the cross-fill's name merge gives them the tactics of the other Klopp / Chivu card (eFHUB has one Klopp entry and two Chivu entries with different ratings, and the better-valued one is picked). These are the same coach's numbers, but not verified for these cards.
