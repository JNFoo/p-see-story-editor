# Story Editor

A single-file, offline editor for interactive (choose-your-own-adventure) stories. Authors write pages and
choices, check that every path works, and export each story as one small HTML file that anyone can play in a
browser, online or off.

`build.py` puts the parts below together into **`story-editor.html`**. That file is *zipped*: the whole editor is stored
compressed (Zopfli) inside a tiny page that unzips itself when it is opened, so it is about half the size on disk and opens about
30 ms slower. Two companions are written beside it: `story-editor.plain.html` (the same editor, readable; the size budgets and
the checks that read the text use it) and `story-editor.artifact.html` (the same page without its `<html>`/`<head>`, for hosts that
wrap it). Edit the parts, never the built files.

Exported games are zipped the same way by the Export button (`zipPage` in `core.js`; the browser's own `CompressionStream`, a
little less tight than Zopfli). A browser without `DecompressionStream` still opens them: the page carries a small unzipper
(`zipInflate`), which `contract.mjs` checks against zlib's output on every build. "Show the code" in the Export box shows the
readable page; the downloaded file is the zipped one.

## Building

Needs Python 3.9+ and Node.js 18+.

```
npm install        # once: esbuild (minifies game code) and prettier (formats sources)
python3 build.py   # or: npm run build
```

The build stamps the file with its date and time (Eastern), shown on the opening screen and in the Quick guide.

After building, `build.py` prints a **size budget**: the finished editor (plain, and as delivered, zipped) and three exported games (the built-in example, a standard
25-page story, and the same with the Place code on), each with its ceiling, how much of it is used and the change since the last
build. `budget.mjs` makes the numbers with the same `buildGameHtml` the Export button uses, with a fixed random sequence and clock so
the numbers repeat exactly (page ids are random and used to move them by a byte). A file over its ceiling stops the
build; raise the ceiling in `BUDGETS` (build.py) on purpose, with a reason, or trim something.

## The parts

| File | What it is |
|---|---|
| `core.js` | Part 1. Story model and clean-up of loaded files, the game rules (`kl…` functions), the checker (`analyze`), "where things went" records, import of the old text format, export of a game. No DOM. |
| `maplayout.js` | Part 1b. Everything the Map computes: which boxes and arrows to draw, choke points and traffic, the layered layout engine, arc, matrix and story-shape views, simulated players (`playtest`) and layout scores (`mapMetrics`). No DOM. |
| `player.js` | Part 2. Plays a story. Used by the Play tab and by every exported game. |
| `ui1-state.js` … `ui5-app.js` | Part 3, the editor screens, wrapped in one function: state and undo; widgets; Write; Map; Items, Check and Play; the speed report (`ui4-speed.js`); File menu, guide and start-up. |
| `ui.css`, `game.css` | Editor styles; game styles (used by the Play tab and exports). All colors are tokens with light and dark values. |
| `contract.mjs` | The test that ties the checker to the game. `build.py` runs it before every build and stops if it fails (see Design notes). |
| `build-game.mjs` | Builds the pieces exported games are made from: the rules and core player, one code piece and one style piece per optional feature, each minified by esbuild from the very functions the Play tab runs. |
| `minify.mjs` | Shrinks the editor's own script and styles (comments and spacing only) for the finished file. |
| `zipwrap.mjs` | Wraps the zipped editor in its self-unzipping page, with the same `zippedPage` the Export button uses. |
| `budget.mjs` | Measures the size budget (see Building). |
| `keepers-light.project.json` | The built-in example story. |
| `fonts/` | Inter Tight (SIL Open Font License): the full subset and a smaller one for games whose story uses only plain English characters; recipes in `build.py`. |

## Design notes

- **Offline and private.** The editor and every game carry a Content-Security-Policy that forbids network access.
  Text is only ever inserted as text, never as HTML. Loaded files are cleaned and their ids validated.
- **One set of rules.** The game rules are plain functions. The editor's Play tab runs them directly; exports carry
  a minified copy made at build time; the checker re-implements them on bit masks and is tested against them.
- **The editor, the game and the checker cannot drift apart.** `core.js` has `FIELD_CONTRACT`, a list that says, for
  every field of a story, whether it changes what a player can do (a "rules" field) or only how things look. Every
  new field must be listed. `contract.mjs` then plays 400 random stories (numbers, dice checks, locked choices and
  all) two ways, with the real game functions and with the checker, and requires the same answers: pages reached,
  endings, stuck pages, usable choices, roll outcomes and the number of situations. It also checks that every rules
  field is read by the checker and kept on export, that every `kl…` helper is copied into games, that the starting
  stories come out clean, and that each color palette is readable (WCAG 4.5:1). Run it alone with
  `node contract.mjs [stories] [seed]`.
- **The checker** explores every reachable situation (page plus the items that can change what a player sees),
  breadth first, so its shortest paths are real. It switches from numbers to BigInt above 30 tracked items, and
  never calls something impossible when it had to stop early.
- **The Map** treats layout as a multi-objective problem. The layered engine reduces crossings (barycenter sweeps
  plus adjacent swaps, seeded with the previous order so the picture stays put between edits) and places boxes by
  exact least-squares under order constraints (pool-adjacent-violators). Choke points can be held on a line
  (spine) and pages kept in bands (Given lanes). *Compare views* scores each drawing on crossings, neighborhood
  preservation, group separation, stability, flow, compactness and speed, weighted by task.
- **Numbers and dice.** A number (stat) has its own lowest and highest value; a choice can roll two dice, add a
  number and compare with a target, sending a failed roll to its own page. The checker follows a number's values only as finely as the story can tell them apart
  (`klGroupValues` in `core.js`: a number tested only against 6 costs 7 situations, not 11), which is why it still warns about wide ranges.
- **Small games.** Exports leave out editor-only data and default values, and carry minified code and styles; a
  25-page story is about 44 KB, of which the embedded typeface is about 17 KB (about 28 KB when the story uses accented letters).
- **Lite exports.** A game carries only the features its story uses. The player is a small core plus one module per
  optional feature (Given questions, Back, dice checks, greyed-out choices, number bars, endings count, the Aa panel;
  `klFeat…` in `player.js`), with matching styles in sections of `game.css`. `klFeatures()` in `core.js` picks the modules from
  the story, `build-game.mjs` minifies each piece on its own, and `buildGameHtml` writes only the chosen ones, the chosen color
  preset, and the small typeface when the story's characters allow it. `contract.mjs` checks that the modules, styles and
  picking rule agree. The finished editor file is shrunk too (comments and spacing only, `minify.mjs`); set
  `STORY_READABLE=1` to build it unshrunk.

- **Shorter ids and saved places.** `klShortIds` swaps every page, item and Given id for a short code in exported games only (the
  editor and checker keep the real ids); `contract.mjs` plays both versions and requires identical results. A game also carries
  `klFingerprint` of the story's shape, and a player's place is saved under it, so a story with pages added or removed starts
  fresh instead of landing a player on the wrong page, while fixing a typo keeps everyone's place.
- **Place code (optional game feature).** `klFeatPlace` in `player.js`: a short code (fingerprint plus the route taken) that a
  player copies and pastes on another device. Pasting replays the route with the game's own rules, so nothing can be forged.
- **One table for game options.** `GAME_OPTIONS` in `core.js` lists every reader option once (key, kind, default, validity, which
  game module it switches on, and the check box text). The defaults, the cleaning of loaded files, the contract's field list,
  the export (non-default values only), module picking and the options box all read it. `contract.mjs` checks the table against
  the player (each option must be read there), the exporter and the options box.
- **Safe saves.** Before the editor writes its autosave it checks the text is a whole story, and the save before becomes a spare
  copy (`story-editor-v1-backup`, renewed at most every ten minutes and at the first save of a session). If the latest save cannot
  be read at start-up, the unreadable text is kept aside (`-damaged`), the spare is opened and the person is told. A game does
  the same with its place: it never writes a state its story cannot use, keeps the save from one move earlier under
  `story-editor-bak:` and falls back to it, and also saves when the page is hidden or closed.
- **Error log.** `logError(where, err)` (ui1-state.js) keeps the last five errors (where, the message, the function names it was
  inside; line numbers mean little in a packed file). Every `catch` that carries on instead of telling the person calls it, and
  uncaught errors and unhandled promises are logged too. The Speed report lists them.
- **Speed report.** `ui4-speed.js`: Options → Speed report, or `#report` on the address. Timings of tab switches, the checker
  and map zoom are always kept in memory; a frame recorder with an "It stuttered!" button starts on request. The report holds
  timings and device details, never story text, and nothing is sent anywhere.
- **Map speed (Oct 8).** Two rounds, each proved to give identical output. (1) Scoring and counting: `mapMetrics` takes a `quick` flag (the toolbar
  asks only for what it shows), keeps the full scores per layout (`L._centers`, `L._metrics`), finds neighbours with a short sorted list, and
  `playtestCount` counts by page number and builds the name strings once. (2) The simulated players (`playtest`): per page, once, it works out
  which choices lead anywhere, whether any choice or paragraph has a condition, and whether arriving changes anything, and skips the game's
  rule only when that is certain; the rules themselves are untouched. A cleaned-up story stores "no changes" as `{}` (truthy), so the checks
  use `Object.keys(...).length`. First visit on a 300-page story (script time): Chromium 511 to 353 ms, Firefox 158 797 to about 490 ms after (1) and (2); later visits about 65-90 ms.
  (3) The simulated players are no longer run for an ordinary first draw: only the Compare table's "Groups" score (via `mapGroups(G).cls`, now
  worked out the first time it is read), the River view and the odds/heat coloring need them, and `mapScore(L, prevPos, true)` no longer touches
  them. First visit then drops to about 250 ms in Firefox 158 and Chromium. Proofs: `qa/map-equiv.mjs`, `qa/count-equiv.mjs`,
  `qa/playtest-equiv.mjs` (1,002 simulations, and each shortcut deliberately broken to confirm the proof notices) and `qa/compare-equiv.js` (the
  Compare table of an old and a new build for 12 stories). Run them on any change to those functions.
- **Measured before changing (Oct 7).** On a 300-page test story the editor does 1 to 5 layouts per tab switch, so reading and
  writing the page were not interleaved anywhere that mattered (the one batch fix: `autosizeAll`, which sizes every text box with
  one layout instead of one each). The big start-up cost was the opening brush stroke asking the browser to measure its own
  path (about 150 ms): its length is now worked out from the numbers that draw it (`brushStroke` in ui2-widgets.js, within 0.3
  px of the browser's own measure). Parsing the script is a small part of start-up, so moving fixed text out of code would not pay.

**Starting a similar project?** `../STARTER-GUIDE.md` collects the habits, the checking kit, the speed method and the pitfalls from this build.

## Writing aids and checker reports (Oct 8 2026, second batch)

- **Write-tab navigation and speed (Oct 8 2026).**
  - *One page picker* (`pagePicker` in `ui2-widgets.js`): an ARIA combobox (input keeps focus, `aria-activedescendant`) used for a choice's destination (`destButton`), the failed-roll page,
    Ctrl+K (`goToPage`) and the phone page switch. Enter picks, Ctrl+Enter makes a new page named from what was typed, Esc closes; the highlighted page is previewed at the bottom.
  - *History* (`hist`, `histVisit`, `histTarget` in `ui1-state.js`): ‹ › buttons only; kept while the editor is open.
  - *Side lists*: `prefs.pagesOpen` / `prefs.itemsOpen`, `toggleSide`, `applySides` (body classes `hide-pages` / `hide-items`); a reveal button sits beside the page name while a list is hidden.
  - *Page list order*: written order by default, Sort menu for Story order (`storyOrder` in `core.js`, a breadth-first walk from the first page) and A to Z. `prefs.sort`.
  - *Item chips*: click gives (`giveToPage` calls the open page's Gets box `_drop`), Shift+click takes, numbers go to the Numbers row.
  - *Split page* (`splitPage`): rest of the paragraph, later paragraphs and all choices move to a new page; the old page ends with a "Continue" choice; one `refresh()`, so one Undo. Ctrl+Shift+Enter, or the ⋯ menu (uses `lastCaret`).
  - *Paste a scene* (`pasteScene`): lines starting `- `, `• ` or `> ` become choices; other lines become paragraphs. Only when at least one choice line is found.
  - *Grips* (`rowGrip` in `ui2-widgets.js`, pointer events): the only reorder control for choices and paragraphs (no up/down buttons any more); shown only when a list has more than one row. Alt+↑/↓ in a field is a hidden keyboard fallback (`rowKeys`). Index-based (no ids on those rows). Saved a one-paragraph page 75 px of height at 1,280 px wide (block 141 → 66 px).
  - *Options*: smart quotes (`smartTyping`, a capture-phase `input` listener; off by default) and writing text size (`wsize` body classes). `prefs.quotes`, `prefs.wsize`.
  - *Wide layout*: a `ResizeObserver` on `#main` sets `mainWide` (kept in a variable because `renderMain` resets the class list); `#main.wide` puts text and choices side by side at 1,100 px and up. Not a container query, so it works in Firefox 98 and Chrome 98.
  - *Phones* (max-width 820 px): `.pinbar` pinned at the bottom (+ Choice, Next to write, Play); the stats line is hidden while writing (`body[data-view=write]`, 600 px and under).
  - Tests: `qa/write1.js` (picker, Ctrl+K, history, From, toggles, sort, template, item click, Next) and `qa/write2.js` (grips, split, paste, smart quotes, text size, wide). `qa/effort.js` counts actions and scrolling against `qa/work/baseline-write.html`.
- **Oct 8 night round.**
  - *Start page is never an ending.* `normalizeProject` un-ends it and sets `startFixNote` (shown as a toast at start-up or after Open; the legacy importer does the same). In the Write tab the Ending/Good/Bad radios are disabled on the start page, "Make this the first page" and "Start the story here" refuse an ending page, and deleting the start page picks a non-ending page. The checker also reports it if one ever slips through.
  - *Map toolbar is icons only* (`mapBtn`, `viewGroup`, `colorGroup`, `asBtn`, `mergeBtn`, `sizeBtn` in `ui4-map.js`; `mv-*` and `mc-*` icons in `ui2-widgets.js`). Each is a toggle button with `aria-pressed`, a name and a tooltip. Track and As open a `ctxMenu`. The one-row width went from about 1,300 px to about 1,250 px; the row is 46 px tall either way.
  - *Floating key above Start* (`autoKey`, `key.auto`): on screens wider than 700 px, with at most 300 pages, no live zoom and a key nobody has dragged, the key sits above the Start page (two columns, then one if there is not room) and goes back to the corner when it does not fit.
  - *Game tab icon* is the dice.
  - *First-time tour* (`TOUR`, `startTour`, `maybeTour` in `ui5-app.js`; section 15 of `ui.css`): a dimmed screen with a hole (a huge box-shadow) around one area at a time and a card with Back, Next and Skip tour. Starts by itself once, 4.6 s after load, only while the Advanced choices have not been made (`settings.chosen` false) and nothing in `story-editor-v1-toured` says it was seen. Options, Take the tour starts it any time. Esc skips, arrow keys move, Tab stays in the card, the editor's shortcuts are held back. On phones it slides the two lists open as drawers, and the card sits at the top or bottom, away from the lit area. Areas that are hidden (a collapsed list) are skipped.
  - *More checker rules* (`analyzeRun`, "housekeeping" block): start page is an ending (problem); duplicate page names, duplicate choice labels on one page, a need and a hide on the same item, an "otherwise" on the first paragraph, an empty paragraph, a leftover TODO/TBD/lorem word, an item given and taken on the same page, two items with the same name (warnings); no real story title, "Untitled page" names, repeated words, pages over 350 words, more than 7 choices, choices over 120 letters, mixed straight and curly quotes (notes).
  - *Version stamp* (`STAMP` in `build.py`): `YYYY.MM.DD.HHMM` in US Eastern, 24-hour clock (for example `2026.10.08.2320`), shown on the opening screen and at the top of the Quick guide. Use this form for every new version and changelog date from Oct 8 2026 on.
  - Tests: `qa/round3.js` (arrows gone, Alt+arrows, dice icon, start-page rules, new checker rules, map icons and key, tour on desktop and phone).
- **Bug-fix round (Oct 12 2026, version 2026.10.12.xxxx).** Three read-only reviews, then random-click, random-player and damaged-file fuzzers, found these; each has a check in `qa/bugs12.js`.
  - *Player*: a dice roll remembered by Back is kept only for the same step (`rolls[key] = { p, h }` with the history length); a Place code with a roll digit that is not 0 to a is refused (`P.forceRoll` was set from garbage) and its refusal message is now shown (the failed replay no longer redraws the page, which used to close the box and lose the message); Start over also shows on a page where no choice can be taken, even before the first choice; "Test from here" zeroes numbers the tester did not list; the Aa panel closes with Esc or a click elsewhere and opens downward when there is no room above it (on a short page the top rows, Text size included, could be out of reach).
  - *Editor lost work*: Save while a save is under way is ignored (`saving`), and what was written (`at`) is what is marked saved, so an edit made during the write still shows as unsaved; a remembered file after a reload is "saved" only if its fingerprint (`sigOf`) matches the autosave; replacing a whole story (New, Example, Open, Import) first stores the story being left and keeps it as the spare copy at once (`persistNow(true)`); a full disk drops the spare and tries once more; the "cannot save" warning goes away when saving works again, and closing the tab asks first while nothing is being kept (`beforeunload`); an unreadable autosave with no spare says so; Extra large writing text comes back after a reload (saved as `x`, loaded as `xl` before).
  - *Editor crashes and edges*: `normalizeProject` accepts non-list `items/options/list/blocks/choices` and non-object passages; Ctrl+Z and Ctrl+Y do nothing while a dialog, menu or picker is open; deleting or duplicating a page twice quickly no longer acts on the wrong page; a change event that redraws (leaving a box, Enter) first lets the browser move the focus and then puts it back (`refresh` defers the redraw one turn, `focusMark`/`focusBack`); menus and the page picker close on a resize only when the width changed (a phone keyboard no longer closes them); a drag that loses its pointer ends cleanly (`lostpointercapture`, and the autoscroll stops if the row is gone); the tour waits while a box has the focus, follows a rotated or resized window, and holds back Ctrl+S and Ctrl+P; the map key follows a resized window; the map layout cache is keyed by a fingerprint, not the whole story text, and holds 16 entries.
  - *Map speed on dense stories*: `mapCrossPairs` counts crossings with a Fenwick tree (n log n) and `transpose` counts only the swapped pair's links; same drawings (`qa/layer-equiv.mjs`: 198 layouts identical), 300 pages with 6 to 8 choices each went from 26 to 56 s to 0.4 s. The old code is kept in `qa/fixtures/maplayout.before-fenwick.js`.
  - Fuzzers (`qa/fuzz1.js` editor clicks, `fuzz2.js` exported games, `fuzz3.mjs` damaged stories, `fuzz4.js` damaged saved places) are run by hand and before a delivery, not in the quick tier.
  - Reported, not changed: the Place code fingerprint ignores choices (a story edited in choices only still accepts old codes and may land on a different page); the 400-step trail limit versus the Back recap; `m:` conditions are not remapped when ids are replaced; the checker's stuck-page message leaves out which Given answer led there; the Play tab's Given list restarts and drops test items chosen earlier; the same story open in two tabs can overwrite each other's autosave (no warning).
- **Find and replace** (`findPattern`, `storyFind`, `storyReplace` in `core.js`; `findDialog` in `ui3-write.js`; Ctrl+Shift+F). Plain text, escaped,
  optional Match case and Whole words (letter/number boundaries by Unicode property). Replacements are literal (no `$1` tricks), a heading is kept to
  120 characters, and Replace on one match only works if it still matches. One Undo step per replace.
- **Unfinished flag** (`todo`). A display field in `FIELD_CONTRACT`, so it changes nothing about play and is left out of exported games by construction
  (`exportStory` copies field by field). Bookmark button on the page bar, marker in the page list, section on the Check tab.
- **Why can't players reach this page?** (`why(pid)` in the analysis; `whyDialog` and the "Pages nobody reached" card in `ui4-views.js`). Names the choices
  that lead to the page and, for each, what blocks it (needs / forbid / together, or a roll that can never win or fail).
- **Manuscript** (`storyManuscript`; File menu). Markdown of all words with choices under each page; no rules.
- **Dead numbers in the checker** (`analyzeRun`). A number is dead at a page when nothing the player can still reach reads it; such numbers are reset
  to one value so equal situations merge. Verdicts are identical (`contract.mjs` compares pruned and unpruned runs on 1,500 random stories, and six
  deliberate breaks of the pruning are all caught). Applied automatically only when an unpruned run would pass `PRUNE_AFTER` (20,000) situations; explanations then leave out dead numbers and the Check tab says so.
  Measured: 5 numbers over 8 sections went from truncated at 200,001 situations (493 ms) to complete at 441 (4 ms).

- **Game tab** (`renderGame` in `ui4-views.js`; options drawn by `gameOptions` in `ui5-app.js`). Shown between Check and Play only while the Game
  switch in Options, Advanced is on, so a switch left on is visible at a glance. The options sit beside the real game player (`klPlayer`) running the
  story's first page. `gameOptions(after, preview)`: hover, focus or arrow keys over a color call `preview(key)`, which only sets `data-pal` on the
  preview's `.kl` and on the player's own `story.game.pal` (so pages opened next match); a click keeps it (`commit('game')`, no restart). Any other
  option restarts the preview. The Options menu no longer has a Game entry and the Copy game code window carries no options.

## Checking it

The checks live outside this folder (in the session's `qa/` kit; its README explains them in plain words). In short: `node qa.js quick`
(about 1 minute, Firefox 158) after a change, `node qa.js full` (about 4 minutes, Firefox 158 then Chromium side by side) before a file
is delivered. The build itself already runs the contract test, the font check, the script-tag checks and the size budget.

- **Matching rules, audited Oct 8 2026.** Every place that decides by reading text was tried with lines made to fool it. Fixed:
  the contract's name scan flagged a *comment* that mentioned an unknown `kl…` name, and could not see a rule using a helper with another
  name (the rules are now played in a context that holds only `KL_RULES`, as an exported game has them); the build's font check read
  `KL_LITE_FONT` as text and missed capital hex digits and typed-in characters (it now asks the rule itself about every character);
  `</script` was only caught in lower case; and a `<!--` that is not closed before a later `<script` (which hides the real end of a
  script from the browser) is now a build error. The checks' runner (`qa/lines.js`) judges only lines that *start* a failure, and also
  fails a suite that prints a non-empty `errors [...]` line or runs fewer checks than its last all-green run.
- **Fonts are not byte-repeatable by default.** fontTools stamps the time into the font, so two rebuilds differ by up to ~120 bytes.
  With `SOURCE_DATE_EPOCH` set they are identical (recipe in `build.py`; `qa/font-determinism.sh` shows both). The committed files are used as they are.

## Saving

Stories autosave in the browser. Save (Ctrl+S) writes a `.story.json` file; in Chrome and Edge the editor
remembers that file and writes straight to it afterwards. Firefox and Safari download a copy instead.
