# Foundation: what building the Story Editor taught us

**Purpose.** A hand-off for a new conversation, session or project. It collects what was learned while building the Story Editor, what was invented here that the owner's other repositories do not have, the traps we fell into, the decisions already made, and what is still open. Paste it, or point a new session at it, before anything else.

**Status when written:** Tuesday 2026-10-13, late evening Eastern. Last editor build `2026.10.12.1455`. Everything below is on GitHub at https://github.com/lfcfoundry/story-editor (Pages: https://lfcfoundry.github.io/story-editor/). Copyright (c) 2026 LFC Foundry, MIT License.

**How much to trust it.** Numbers come from this repository's own change log, chart and README files, which record what was measured at the time. They are notes from one project on one cloud machine, not benchmarks. Where a fact was not re-checked for this file it says so. The sources win over this file: when they disagree, fix this file.

---

## 1. The project in one minute

A single-file, offline editor for interactive (choose-your-own-adventure) stories. An author writes pages and choices, the editor checks that every path works, and **Export** makes one small HTML game that anyone can play in a browser, online or off. The owner is not a programmer; every decision has to be explainable in plain words.

| Output | Size now (bytes) | Notes |
|---|---|---|
| `editor/story-editor.html` (delivered) | about 224,000 | The whole editor, LZMA-packed (see 4.9). Also copied to the repo-root `index.html`, which is what Pages serves. |
| `editor/story-editor.plain.html` | about 537,000 | Same editor, readable. Size budgets and text-reading checks use this one. |
| Exported game, "Standard 25-page" | about 48,700 | Embedded typeface is a large share (about 17 KB, or about 12.9 KB for plain-English stories). |
| Same, Place code on | about 51,900 | |

Source of truth (never edit the built files): `editor/core.js` (model, game rules, checker, export, no DOM), `editor/player.js` (the game), `editor/maplayout.js` (map layout and simulated players, no DOM), `editor/ui1-state.js` through `ui5-app.js` (editor screens), `editor/ui.css` and `game.css`, `editor/build.py` (joins everything and enforces budgets). `packages/*` are generated from those sources.

Related repositories: `JS-modules` (now at https://github.com/lfcfoundry/JS-modules; small reusable browser modules and tools, with a task board), `fancy-banana`, `apple-press`, `pineapple-defense` (games, under JNFoo). Local clones in the working container: `/home/claude/story-editor`, `/home/claude/js-modules`, `/home/claude/fancy-banana`; the earlier working folder `/home/claude/twine` holds the pre-GitHub history, the starter guide and loose exports.

---

## 2. Architecture in one page

```
core.js ──┐                                   ┌─> story-editor.plain.html ─┐ lzma_pack ─> story-editor.html
maplayout.js ─┤  build.py (+ esbuild, fonts)  │                            │
player.js ────┼──────────────────────────────>├─> story-editor.artifact.html
ui*.js, *.css ┘                               └─> budget table (stops the build when over a ceiling)

core.js + player.js + game.css ──(build-game.mjs, esbuild)──> game pieces ──(Export / buildGameHtml)──> one zipped game page
core.js / player.js / maplayout.js ──(tools/extract-packages.mjs)──> packages/*/src/generated.js + dist/*   (checked by npm test)
```

Three ideas carry the design:

1. **One set of rules, copied by machine.** The game rules are plain functions (`kl…`, listed in `KL_RULES`). The editor's Play tab calls them; an exported game carries a minified copy made from the same functions; the checker re-implements them on bit masks for speed. Nothing is written twice by hand.
2. **A contract test ties the copies together.** `editor/contract.mjs` runs inside every build (6 s in the QA timings) and stops it on a disagreement (details in 4.1).
3. **Optional features are modules.** A game carries only the features its story uses (4.5).

---

## 3. What is new here (not in the other repositories), and what overlaps

Honest comparison against `JS-modules` and the games, as of 2026-10-13. "Reuse" means copied from there; "overlap" means similar work exists and the difference is stated.

| Thing | Where | Status versus the other repos |
|---|---|---|
| **Exact story checker** (items, numbers, dice, locked choices, Given answers; bit masks, BigInt above 30 tracked items, honest "not checked" at a work limit, trap loops, why-unreachable) | `core.js` `analyze`; package `story-check` | New. No counterpart in JS-modules. |
| **Contract test + field table** (`FIELD_CONTRACT`, `KL_RULES`, 400 random stories played two ways) | `editor/contract.mjs`, `core.js`; the generic guide and helper are `packages/contract-kit` (2026-10-17) | New as a pattern. JS-modules tests check modules; nothing there compares two implementations of one rule set. |
| **Story model, cleaner, exporter** | `core.js`; package `story-format` | New. |
| **Outline reader** (indented outline to pages and choices, or a whole story) | `helpers.js`; package `story-outline` (2026-10-17) | New. |
| **Plain-words edit labels** ("Add page “The Cellar”") | `changes.js`; package `story-diff` (2026-10-17) | New. |
| **Twine importer** (links plus SugarCube/Harlowe code turned into rules, with a plain-words report) | `twine.js`; package `twine-import` (split out of story-format 2026-10-17) | New. |
| **Lite export** (core player plus feature modules, `@part` styles, only the chosen palette and font) | `player.js` `klFeat…`, `game.css`, `build-game.mjs`, `klFeatures()` | New. |
| **Map layout engine** (layered, crossing reduction with stable seeding, exact least-squares placement, choke points, arc/matrix/shape/river views, simulated players, layout metrics) | `maplayout.js`; package `story-map` | New. |
| **Self-unzipping page with a pure-JS inflate fallback**, zipped in the browser with `CompressionStream` | `core.js` `zipPage`/`zipInflate`; package `zip-page` | Partly overlaps `JS-modules/tools/single-file-tools` (a Zopfli packer run at build time) and `lzma-pack`/`lzma-decode`. Difference: this one compresses **in the browser at export time**, which neither build-time tool can do. |
| **LZMA-packed editor** | `editor/lzma/`, `build.py` | Reuse: packer and decoder copied from JS-modules (commit d750784). Only changes: the decoder path and `tune` may be a list of `(lc, lp, pb)` tries. Added here: base64-only (see 4.9), esbuild-minified loader, hash check. |
| **Stock-Firefox test driver with Playwright-style calls** (over Puppeteer + WebDriver BiDi) | `packages/qa-kit/src/bidi.js` | Overlaps `marionette-lite` (Python, standard library only, drives Firefox) in goal. Difference: Node, and it speaks Playwright's call and selector surface so existing Playwright suites run unchanged on stock Firefox. |
| **Tiered test runner** (quick/smart/full, retry-once marked `pass*`, worker pool, lost-check detection) | `editor/qa/qa.js`; generic `packages/qa-kit/src/runner.js` | New. |
| **Fuzzers** (random clicks, random games, damaged files, damaged saves) | `editor/qa/fuzz1–4` | Overlaps `fuzz-kit` / `fuzz-play` in method (seeded random play with invariants). The fuzz-play README already compares the two. These are product-specific suites; they were written before fuzz-kit and have not been moved onto it. Open decision (section 9). |
| **Safe saves** (whole-story check before write, spare copy, damaged copy kept aside, game save with fallback, save-failure notice) | `ui1-state.js`, `player.js` | Overlaps `save-kit` (checksummed codes, backup slot). Difference: save-kit works on small flat schemas; this keeps a whole project document and has to cope with undo/open/import ordering. Not merged. |
| **Place code** (short code = story fingerprint + route; pasting replays the route with the game's own rules, so it cannot be forged to reach an impossible place) | `player.js` `klFeatPlace` | Overlaps save-kit's exportCode in purpose; different mechanism (replay instead of serialize state). |
| **Story fingerprint for saved places** (shape changes reset, typo fixes keep) | `klFingerprint` | New. |
| **Env probe for storage** | game start-up probe write (`saveFailed`) | Uses the same idea as `env-probes` but a smaller, game-specific probe. `env-probes` was named as a candidate and not wired in. |
| **ai-collab-kit** (written process: ten habits, templates for AGENTS.md, task board, session brief) | `packages/ai-collab-kit/` | New. JS-modules has `AGENTS.md` and `TASKS.md` in the same spirit; this packages the reusable version. |
| **Extraction by script with a drift check** (cut packages out of real sources; `npm test` fails if a generated file is stale) | `tools/slice.mjs`, `tools/extract-packages.mjs`, `tools/docs.mjs` | New. README code blocks are copied from `examples/*.mjs` so docs cannot rot. |
| **Size budgets that stop the build** with seeded randomness and clock so numbers repeat | `build.py`, `budget.mjs` | New in this form. |
| **Speed report** (always-on timings, frame recorder, error log; no story text, nothing sent) | `ui4-speed.js` | Related to `frame-kit`/`fx-governor` in goal (they act on slowness; this reports it). Not shared. |

Things that exist in the other repos and were **not** used here (so a new context does not assume they were): `idle-core`, `sticker-text`, `stage-curtains`, `sprite-baker`, `pad-nav`, `hold-press`, `fx-governor`, `frame-kit`, `fly-to-mini`, `cartoon-3d-kit`, `fuzz-kit`, `env-probes`, `save-kit`.

---

## 4. Technical lessons, by area

### 4.1 Keep two implementations honest (the biggest lesson)

- `FIELD_CONTRACT` in `core.js` names every field of a project, passage, block, choice and item as **rules** (changes what a player can do or see) or **display**. A field that is not listed fails the build. A rules field must be read by the checker (the test watches which fields the checker touches) and kept on export.
- `contract.mjs` then plays 400 random stories two ways, with the real game functions (isolated, holding only what an exported game holds) and with the checker. It requires the same pages reached, endings, stuck pages, usable choices, roll outcomes and situation counts. It also checks that every `kl…` helper is copied into games, the starting stories come out clean, each color preset reaches WCAG 4.5:1, and the zipped-page unzipper matches zlib.
- **Test in the exported context.** Rules were tested holding only what an exported game holds, because a rule that quietly depends on an editor-only helper passes in the editor and breaks in the export.
- **Test the test.** After writing a proof, break the code on purpose in each way it is meant to catch and confirm the proof notices. Doing this found a real flaw once (4.3).
- A name-scan test must strip comments first.

### 4.2 The checker

- Explores every reachable situation (page plus the items and numbers that can change what a player sees), breadth first, so shortest paths are real.
- Items are bits in one number; above 30 tracked items it switches to BigInt (1.4 to 2.3 times slower on the same situations). Before the switch existed, 31 items quietly turned reachability off and a story with an unreachable ending reported no problems. **Lesson: a silent size limit that turns a check off is a bug; keep the check on, slower, or say "not checked".**
- Work limit 200,000 situations (and 512 Given combinations), then an honest "not checked". It never calls something impossible when it merely stopped.
- Numbers are grouped by how finely the story can tell values apart (`klGroupValues`: a number tested only against 6 costs 7 situations, not 11). Dead numbers (nothing ahead can read them) are reset so equal situations merge; applied only when an unpruned run would pass 20,000 situations; proven identical on 1,500 random stories.
- Still expensive: several wide numbers across many pages can reach the limit. Documented as an open issue.

### 4.3 Making the Map fast without changing its pictures

Test: a 300-page story, script time, median of 3 fresh loads. First visit went from 511 ms to about 245 ms in Chromium and from 797 ms to about 253 ms in Firefox; later visits 165 ms to about 70 ms (Chromium) and 280 ms to about 70-100 ms (Firefox). A dense story (300 pages, 6 to 8 choices each) went from 26-56 s to 0.4 s with identical drawings (198 layouts compared).

Method that transfers: profile with the browser's sampling profiler; ask only for what is displayed; compute once and keep; cache per page what does not change between simulation steps; **prove identical output** with side-by-side runs of the old and new code (1,002 simulations for the simulated players, 12 stories for the Compare table). Those proof scripts (`map-equiv`, `count-equiv`, `playtest-equiv`, `compare-equiv`) were scratch files and are **not kept in this repository**; the editor README and chart still name them. Rebuild the pattern with `packages/qa-kit/src/editor-vm.mjs` and `genstory.mjs` when the Map functions change again; **break each shortcut deliberately** to confirm the proof catches it; and ask whether the expensive thing is needed at all before making it faster (the 2,000 simulated players are now computed only when a score, view or coloring reads them).

The flaw the break-it step found: a cleaned-up story stores "no changes" as `{}`, which is truthy, so a shortcut never fired. **Cleaned-up data stores nothing as empty arrays and objects, both truthy: test `.length` or `Object.keys(...).length`, never presence.**

### 4.4 Sizes

- Typeface: Inter Tight, weights 400-700, only kerning and tabular numbers kept, plus an ASCII-only subset for games whose characters allow it (`KL_LITE_FONT`, checked against the font at build time). Font subsets are not byte-repeatable unless `SOURCE_DATE_EPOCH` is set; the build sets it.
- Game code and styles are minified by esbuild from the very functions the Play tab runs; exported story data leaves out editor-only fields and anything equal to its default (the player treats a missing field as its default; every new field needs one).
- `klShortIds` swaps page, item and Given ids for short codes **in exports only**; `contract.mjs` plays both versions and requires identical results.
- Size ceilings: "current size plus about 5%"; raising one needs a reason written next to it in `BUDGETS`. Measurements must be repeatable: seed random numbers and the clock in the measuring script, because page ids made at random move a size by a byte.
- Each added feature costs bytes in every game (the save-failure notice: 487 bytes in every game). The ceiling for the Standard 25-page game is 49,000; it stands at 48,706. **The next feature will need either trimming or a deliberate ceiling raise.**

### 4.5 Lite export (feature modules)

A new optional game feature is `klFeat<Name>(P)` in `player.js` (adds itself through hooks, registers in `KL_FEATS`), named in `KL_FEATURE_ORDER`, chosen by `klFeatures()` in `core.js`, with styles in a `/*@part name*/` section of `game.css`. The core never calls a module directly. `contract.mjs` fails the build if any piece is missing or inconsistent, or if a story that needs a feature would be exported without it. `top10-lite` plays lite and full games side by side on 19 stories before shipping a module.

### 4.6 One table for options

`GAME_OPTIONS` in `core.js` lists every reader option once (key, kind, default, validity, which game module it needs, checkbox text). Defaults, cleaning of loaded files, the contract's field list, export (non-default values only), module picking and the options box all read it, and `contract.mjs` checks the table against the player, the exporter and the box.

### 4.7 Saves that cannot make things worse

- Before writing an autosave, check the text is a whole story; the previous save becomes a spare copy (`story-editor-v1-backup`, renewed at most every ten minutes and at the first save of a session). If the newest save cannot be read at start-up, keep the unreadable text aside (`-damaged`), open the spare and tell the person.
- A remembered file belongs to an undo epoch; opening or importing clears it so Save never writes one story into another's file.
- Bug review of 2026-10-12 found write races (two Ctrl+S, edits during a write marked saved), a stale "saved" label after reload, replacements overwriting the autosave, a full disk with the spare taking room, and silent loss in a private window (now the browser asks before closing). All fixed with one check each (`qa/bugs12.js`).
- Games do the same with their place: never write a state the story cannot use, keep the save from one move earlier under `story-editor-bak:`, save when the page is hidden or closed, and (new) say so on the page when the browser will not keep the save at all (`saveFailed`, probe write at start; note element `p.kl-nosave`).
- A damaged Place code is refused with the message showing (the page was being redrawn and hid it).

### 4.8 Editor behaviors worth copying

- One ARIA combobox page picker (`pagePicker`) used everywhere a page is chosen; drag grips as the only reorder control (pointer events, auto-scroll at the edge, Alt+Arrow keyboard fallback); split page and paste a scene as single undo steps; first-time tour built from a box-shadow hole around one area; the Map toolbar as icon toggle buttons with names and tooltips.
- Typing stays cheap: autosave 300 ms after the last edit, top bar redrawn once per frame, undo steps merged inside 1.2 s, undo memory capped (150 steps / 24 million characters), checker runs 500 ms after typing stops and is reused until the text changes.
- Map zoom by CSS transform while changing; panning is the browser's own scrolling.
- Calculate instead of asking the browser to measure: the opening brush stroke asked the browser for its path length (about 150 ms); it is now computed from the numbers that draw it (within 0.3 px).
- Autosize all text boxes with one layout instead of one each (read, then write, never interleaved).
- Animations: transform and opacity only, every one under `prefers-reduced-motion`, never more than three flashes a second over a large area.
- Class names collide silently: a new class reusing an old name inherits its style (`.keys`, `.swatch` once squashed new rows). Search `ui.css` before adding one. Changing a menu label breaks tests; update the test strings in the same change.

### 4.9 Packing: zip, then LZMA, and the charset trap

- Exports are zipped in the browser (`CompressionStream('deflate-raw')`, base64 inside `<script type="text/plain">`, unpacked with `DecompressionStream`, falling back to the built-in inflater `zipInflate` where it is missing). Costs 3-11 ms to open a game, gains about 28%.
- The editor file was Zopfli-zipped (462 KB to 219 KB), then LZMA-packed: 249,190 to 224,251 bytes (-10%).
- **Games cannot use LZMA**: browsers can decompress gzip and deflate natively and have no LZMA compressor, so a game would have to ship an LZMA compressor to pack itself. A "safe LZMA for both" option was offered to the owner before this was checked; it was disclosed and the owner agreed to editor-only. **Check feasibility before offering a choice.**
- **The raw-bytes form of the LZMA packer (173 KB) fails on servers that send `charset=utf-8`** (GitHub Pages does). The page must be base64. The packed file checks a hash of the unpacked page on open and shows a plain message if it was changed (`qa/packed-check.js` flips a payload byte to prove it).
- A script inside an HTML page must never contain `</script` (any case) nor `<!--` followed by `<script` before `-->`. The build checks both.

### 4.10 Game accessibility and compatibility

- Browser floor: editor Chrome/Edge 98, Firefox 98, Safari 15.4; exported game Chrome/Edge 80, Firefox 74, iOS 13.4. No `:has()`, `inset` or other newer CSS in `game.css`. Newer niceties only as extras that switch off quietly.
- CSP `default-src 'none'` in the editor and every game; text is only inserted as text, never HTML; embedded data escapes `<`, `</script` and the two line-separator characters.
- The Aa comfort panel, 6 color presets checked at 4.5:1, reduced motion honored.
- Nothing has run on a real iPhone, Android phone or Firefox on Windows beyond reports the owner sent; phone behavior was checked in Chromium emulation.

---

## 5. Testing lessons

### 5.1 Driving stock Firefox
Playwright drives only its own patched Firefox, which trails real releases. `packages/qa-kit/src/bidi.js` gives suites Playwright-style calls on top of Puppeteer over WebDriver BiDi, which drives stock Firefox. Limits: no phone emulation, no native drag and drop (it sends the same events), no file pickers or downloads, main frame only. Those stay on Chromium. A headless Firefox shares one window between pages, so the shim brings a page to the front before clicking.

Shim facts that cost time: `waitForTimeout` settles early unless `FIXED_WAITS=1`; `waitForFunction` strips the opening splash when its source contains `getElementById('splash')` (so a motion test must use `querySelector('#splash')`); the first-time tour fires 4.6 s after load unless the toured flag or `settings.chosen` is set, and it intercepts clicks; parallel browser contexts sometimes fail to start ("no such frame"), so retry creation up to three times.

### 5.2 Rules that kept the suite honest
- A suite fails on a non-zero exit; a line that **starts** with `FAIL `, `FAILED`, `N FAILED`, `FAILURES n`, `STOPPED`, `SCRIPT ERROR`, `SomethingError: ` or `Node.js v`; a non-empty `errors` line; or **fewer `PASS ` lines than the last all-green full run** (`counts.json`). The last rule catches a suite that quietly skips tests. `lines.js` has a 20-line self-test. `--reset-counts` accepts fewer checks on purpose.
- The runner retries a failure once and marks recovery `pass*`. A flake is a bug in the check: wait for the thing you expect, never for a fixed time; click again until the next screen exists; wait for the saved state before reading it; neuter the page's save-on-close before clearing storage and reloading.
- Firefox's `innerText` can silently drop visually hidden text (a screen-reader live region): compare that text separately.
- Never trust a stale web server on a fixed port; each run picks a random port. The first suite needing the server must wait until it is listening (it used to fail once and pass on retry in every full run).
- A scripted find-and-replace that was too broad once deleted lines of a test file. Diff after any scripted edit.
- Test output goes to `logs/<suite>.log`, one line per suite on screen, nothing pasted into chat.

### 5.3 Speed of the checks
The full check was 14 to 30+ minutes, then about 3.5-4 minutes (Oct 8: run the whole walk inside the page; one command per click from outside had made `top10-lite` take 14 minutes). After more suites it grew to 677 s; the 2026-10-12 audit brought it to about 331 s:

| | before | after |
|---|---|---|
| quick, real / CPU | 149 s / 134 s | about 100 s / 114 s |
| full, real | 677 s | about 331 s |
| `build.py` | 5.9 s | 3.6 s |
| `npm test` | 19 s | 13.6 s |

What did it: a worker pool of three (suites mostly wait on the page; two lanes used about 40% of two cores), longest suite first from `times.json`, reduced motion for every test browser (the opening splash is painted on the CPU; saved 15% CPU), no wait for the splash in Chromium, waiting for the server. Four workers were faster (90 s quick) but slowed single suites up to 40%, which risks timing checks. Decisions left open for the owner: Chromium repeats every suite (about half the full time), about 45 s of fixed waits remain in quick, `smart` re-runs nearly everything because most suites watch every file, and the generic qa-kit runner has no pool yet.

### 5.4 Fuzzing paid for itself
Four fuzzers plus three read-only code reviews produced 23 fixes in one round (`docs/BUG-REVIEW-2026.10.12.md`): random clicks/keys/resizes/reloads (after every step: no errors, screen not blank, story whole; Undo-all then Redo-all must give the identical story and the autosave must match), random stories played as real games including Place code copy / clear the device / paste, 13,500 damaged story files, 320 damaged saved places. Policy used: fix clear bugs, report the rest.

---

## 6. Build and release lessons

- Version stamp `YYYY.MM.DD.HHMM`, US Eastern, 24-hour; shown on the opening screen and in the Quick guide; suite `round3` checks the format.
- Edit parts, run `python3 build.py`, test the **built** file. `STORY_READABLE=1` builds unshrunk code with real line numbers for chasing browser errors (rebuild normally before delivering).
- Run Prettier on changed parts before the final build; it grows the file a little.
- After building, compare the size table to the ceilings. Do not "fix" a failing budget by editing the number without a reason.
- Spelling: American English everywhere users see it (a case-insensitive scan for `colour|grey|centre|neighbour|behaviour|favour|organis|recognis|cancelled|labelled` caught the strays; `aria-labelledby` is correct).
- Do not commit generated byproducts (`__pycache__` was committed once and removed).
- Packages are never edited by hand: add a name to a package's `roots` in `tools/extract-packages.mjs`, run `npm run build`, and `npm test` fails if anything is stale. Package tests compare against the editor's own sources (`packages/qa-kit/src/editor-vm.mjs`), so equivalence is tested, not assumed.

---

## 7. Working with the owner and with AI sessions

### 7.1 Standing agreements (from the owner's own instructions)
- The owner is **not a programmer**. Plain words first; say what a change means before how it works. Final messages are short: the outcome, the file, one real next step, sources if any. Do not recap the steps.
- **Ask questions only through the interactive multiple-choice pop-up**, every time; never as text, not even a closing "want me to..." line. Put the recommended option first. Small, clear, reversible changes: just do them.
- Report the **real elapsed time and approximate compute** at the end of each request (read the clock; do not guess).
- Hold checks and benchmarks until a design is final; do not benchmark options that may be discarded.
- Test in Firefox as the stress test (it shows regressions most plainly) and in Chromium too.
- American English. Version stamps as in section 6.
- Do not keep mentioning that the test machine has no graphics card or that smoothness cannot be tested there; ask the owner to look on a real device instead, or use the Speed report.
- Transfers between contexts are `.md` files.
- Push to GitHub without asking.
- **Automated diagnostics:** a test page the owner must run should be one button with results and a verdict in plain words; never make him toggle things and work out what is being tested.
- **Performance work must not cost visual charm.**
- Send a short status message when nudged that the owner has not heard from you, then keep working.

### 7.2 Ownership and attribution (decided 2026-10-12 and 2026-10-13)
- The copyright holder named in every file, LICENSE and NOTICE is **LFC Foundry** (decided 2026-10-15; before that the line said JNFoo). **JNFoo** stays the author and committer of every commit and the name behind the GitHub profile. The owner's real name was scrubbed from files, history and notices on 2026-10-12 and stays out.
- **Standing rule for all software made in this project (2026-10-15):** every file the software produces starts with the LFC Foundry header comment (text in `editor/foundry-header.txt`; `foundryHeader()` in `editor/core.js` writes it into every exported game, and `build.py` into the editor); the only visible credit is the footer "Forged by LFC Foundry • MIT Licensed" inside the editor app itself (a line at the bottom of wide windows, the last entry of the ⋯ menu on narrow ones). Exported games carry the header comment only, plus a line saying the story's words and art belong to the story's author. The page title is not changed.
- **Every commit's author and committer is JNFoo** (`user.name JNFoo`, `user.email 45110762+JNFoo@users.noreply.github.com`) because he is ultimately responsible for them. Claude appears only as `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No `Claude-Session:` line, no claude.ai links, and no "generated with" link in commit messages or pull request text. This overrides any tool reminder that adds such lines.
- History was rewritten twice (Oct 12 for the name, Oct 13 for authorship) across five repositories. Local clones must `git fetch && git reset --hard origin/main` (save unpushed work first), then set the two git config values above.

### 7.3 Several sessions at once
- `JS-modules/TASKS.md` is the shared task board: claim a row in its own small commit before starting, update it when done. `git fetch` first, rebase before pushing, never force-push (the two rewrites above were explicit owner requests), and say in the commit message when you touch a file another session wrote.
- On 2026-10-13 another session rewrote the histories while this one was about to; checking `origin/main` before acting showed the work was done. **Look at the remote before repeating a remote-changing step.**

### 7.4 Habits that worked (the ten in `packages/ai-collab-kit/GUIDE.md`, short form)
One file and no network; edit parts, build the whole; write rules once and copy by machine; list every field and say what it does; size budgets with ceilings; safe saves; measure first, change second, prove third; test in the browser your people use; fix flaky checks, never just retry; make failure readable.

### 7.5 Mistakes made, so they are not repeated
- Offered an LZMA option for games that could not work (4.9) because feasibility was not checked first.
- A packed file in the raw-bytes form looked fine locally and fails on GitHub Pages (charset header).
- Committed `__pycache__` files.
- Wrote suites that depended on a private story or old paths; they failed on a clean checkout (fixed by bundling fixtures and using only the bundled example story).
- Several first versions of fixes had a race, a missing wait, or a shim quirk (5.1); the retry-once marker `pass*` made them visible.
- Two documentation slips were found while writing this file and fixed: `editor/README.md` pointed to a starter guide that lives only in the old working folder (now points to `packages/ai-collab-kit/GUIDE.md`), and `editor/qa/README.md` carried its suite table and speed section twice (the older copy is removed).

---

## 8. Environment facts (the cloud container this was built in)

- Linux, 2 cores, 8 GB, no graphics chip. HTTPS goes through an agent proxy; the shell can reach only package registries and GitHub. Other sites fail from curl or scripts; use WebFetch/WebSearch for reading pages.
- The proxy refuses repository settings/topics writes and account-wide `gh api` calls; the owner pastes a repo description into the About box himself.
- Test Firefox rejects the proxy's certificate (`SEC_ERROR_UNKNOWN_ISSUER`), so live GitHub Pages checks use Chromium, which trusts it.
- Browser suites: `cd editor/qa` with `NODE_PATH=/opt/npm-tools/node_modules FIREFOX_PATH=/tmp/claude-0/ff158/firefox/firefox`. `/tmp` can be cleared; reinstall instructions are in `docs/OPTIMIZATION-CHART.md` ("Test tooling") and the qa README.
- `pip` needs `--break-system-packages`. esbuild comes from `editor/node_modules/.bin/esbuild` (set `ESBUILD`).
- Use absolute paths in clean-up commands; never `cd ..` inside one. Save new screenshots under new names (a viewer once showed a cached file).
- Files the owner uploads are originals: work on a copy and send results back.

---

## 9. Decisions already made, and open decisions

**Made (do not reopen without a reason):**
- Lite export is the default for every save (owner, 2026-10-07).
- Images opt-in only, as `data:` pictures; no audio. A fourth Advanced switch, "Game". Numbers and dice go under Items.
- Games are zipped, not LZMA-packed; the editor is LZMA-packed.
- MIT license, copyright LFC Foundry; test stories in the repo are the bundled example and generated ones only (no private or other people's text).
- Fix clear bugs, report the rest (policy for the bug review).
- Up/down arrows removed; drag grips are the only reorder control.

**Open (for the owner):**
1. Run Chromium for every suite or only some (about half of full-check time).
2. Replace the ~45 s of fixed waits in the quick tier.
3. Give `smart` per-suite watch lists so it re-runs less.
4. Give the generic runner in qa-kit the worker pool.
5. Whether the product fuzzers should move onto `fuzz-kit`.
6. Whether to wire `env-probes` into the save-failure check.
7. Reported-not-changed bugs: the Place code fingerprint ignores choices (a fix invalidates codes already handed out); the same story open in two tabs can overwrite each other's autosave with no warning; the Back recap lists at most 400 steps; `m:` conditions are not renamed if page ids are replaced on loading; the checker's "stuck" message does not name the Given answer that led there; changing the Given list in the Play tab forgets test items; split page with an "Otherwise" paragraph at the cut is not exhaustively tested.
8. A locked choice with two unmet conditions shows only the first as its reason unless the author types one.
9. Real-device checks never done: Android dark drop-downs and folded warnings, the Aa panel / Back / dice banner / presets on phones, zoom and Place code on phones, splash speed in Firefox and on phones.
10. Wide numbers across many pages can still hit the 200,001-situation limit.
11. Features from the research list not built (images and the ranked ideas after the first ten): see the research list in `docs/OPTIMIZATION-CHART.md` in the old working folder.

---

## 10. Starting a new context from this file

1. Read sections 1, 2, 7 and 9. Skim 3 so you know what already exists before writing anything.
2. `cd story-editor && git fetch && git status`, then `git log -5`. Check `JS-modules/TASKS.md` for claimed work.
3. Confirm the git identity (7.2) before the first commit.
4. `npm install && npm test` (13.6 s, no browser). For browser suites set the environment in section 8 and run `cd editor/qa && node qa.js quick`.
5. Before building anything, ask (pop-up only) the questions that decide shape: what the output file is, who opens it and on what device, and what must never be lost.
6. For a different project, copy the pattern, not the code: `build.py` (join, check, budget), a no-DOM `core`, a contract test, `qa.js quick` before any feature, and the templates in `packages/ai-collab-kit/templates/`.

**Suggested first message for a new session:** "Read `docs/FOUNDATION.md` in lfcfoundry/story-editor first. Work as JNFoo (author and committer) with Claude as co-author only, no session links. Ask questions only through the multiple-choice pop-up. Report real elapsed time and approximate compute at the end."

---

## 11. Where to read more

| File | What it holds |
|---|---|
| `AGENTS.md`, `llms.txt`, `packages/index.json` | How an AI should use and change this repository; package list |
| `docs/CHANGELOG.md` | Every change, newest first, with how it was tested |
| `docs/OPTIMIZATION-CHART.md` | Every size and speed change with measurements; the older "Instructions for an AI assistant" section (some paths in it point to the old working folder) |
| `docs/BUG-REVIEW-2026.10.12.md` | The 23 fixes, the reported-not-changed list, what was found clean |
| `editor/README.md` | Parts, build, design notes (including the Map and Write-tab details) |
| `editor/qa/README.md` | The suites, runner rules, speed audit |
| `packages/*/README.md` | Each package's use and limits |
| `packages/ai-collab-kit/GUIDE.md` | Ten habits, speed recipes, pitfalls, new-project checklist |

---
Copyright (c) 2026 LFC Foundry. MIT License.
