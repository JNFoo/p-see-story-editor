# editor/qa: the checks for the Story Editor

Everything that tests the editor lives here. Written for two readers: an AI session picking this up cold, and a person who does
not program. The short version for both: **run one line, read one summary.**

```
cd qa
node qa.js quick     about 1.5 minutes  after any change: the suites that catch most breakage, on Firefox
node qa.js smart     quick, plus every suite whose watched files changed since the last all-green run
node qa.js full      about 5.5 minutes  the check before a file is delivered: everything on Firefox and on Chromium
node qa.js full --only lite     only suites with "lite" in the name        --verbose  also print each suite's own output
node qa.js full --reset-counts  accept a smaller number of checks on purpose (see "lost checks" below)
node qa.js sample    about 1 minute  a cheap look between edits: the contract test, a rotating quarter of the quick suites and any suite whose files changed
node qa.js quick --against <rev> [--expect-fail]   run against the editor as built from an older git revision (see below)
node qa.js --history  how each suite has done over the recorded runs
```

**Three helpers added 2026-10-14.**
- **Fail first, then pass** (`--against <rev>`): builds the editor as it was at git revision `<rev>` in a temporary copy, and points the browser suites at it.
  A new regression check should FAIL there (it notices the bug the fix removed) and pass on the working tree; `--expect-fail` makes the exit code 0 only when every
  selected suite fails. Game suites still use `packages/story-player` from the working tree. Nothing is written to `.stamp`, `counts.json` or `times.json`.
- **The flake ledger** (`ledger.jsonl`, not in git): every suite result of every run. `--history` prints runs, failures, retried passes ("flaky") and the average time
  per suite. `smart` uses it: a suite is skipped for a changed file it has never failed on in 5 or more runs; until a pair has 5 recorded runs nothing is skipped.
  A full check always runs everything. The first line of a run says how many jobs and about how long, and a failure prints a `next:` line with the log to read.
- **Smallest failing case** (`fuzz3.mjs`): when a damaged story breaks something, the fuzzer undoes the damage one change at a time and prints the smallest set of
  changes that still fails ("smallest damage that still fails (1 change(s) ...)"). Checked with a planted bug: a 5,000-character junk string was found and cut down to one change.
  `fuzz1.js` (random clicks in the live page) is not wired to a shrinker; the engine for that is `tools/fuzz-kit` in JS-modules (`Fuzzer.shrink`).

It prints one line per suite (`pass`, `pass*` = failed once then passed on a retry, so look at it, or `FAIL`), the failing lines, and a
summary naming the slowest suites. Each suite's whole output is in `logs/<suite>.log` (and `.first-try.log` for a retry), so nothing
needs pasting into a chat. If a source file is newer than `story-editor.html`, the runner rebuilds first.

## Which browser

Firefox is the main test browser (it shows performance regressions most plainly) and **Chromium** runs in the full tier and for the phone/touch
checks, which Firefox cannot imitate. Playwright only drives its own patched Firefox, so `../../packages/qa-kit/src/bidi.js` gives the
suites Playwright-style calls on top of Puppeteer over WebDriver BiDi, which drives **stock Firefox** (see
[the qa-kit README](../../packages/qa-kit/README.md) for what it does and does not do).

Setup, once: `npm i puppeteer playwright` somewhere Node can find them (or set `NODE_PATH`), install Chromium for Playwright
(`npx playwright install chromium`), and point `FIREFOX_PATH` at a stock Firefox 129 or newer. Python 3 is needed for the build and for a
small local web server one suite uses. The suites open the built file `../story-editor.html`, which the runner builds (`python3 build.py`
in the parent folder) when a source is newer.

```
export FIREFOX_PATH=/path/to/firefox
node qa.js quick
```

Notes on the shim: it answers a selector like `text=Back` or `button:has-text("Play")` in the page itself (`bidi-engine.js`), waits for a page's own timers
instead of guessing (`settle`/`idle`), and fakes drag-and-drop by sending the same events (it tests the editor's handlers, not a native drag;
Chromium does the native one). `PROFILE=1 node <suite> firefox` prints where a suite's time went; screenshots are off unless `SHOTS=1`.

## The suites (`*.js`; each takes `firefox` or `chromium`)

| Suite | What it covers |
|---|---|
| `top5-safe`, `top5-new` | Save safety (the spare copy, a place kept across reloads), short ids, fingerprinted saves, the Map, the Speed report (including the "Opened in N ms" start-up line) |
| `packed` | The packed editor file opens from a file and from a web server that sends a UTF-8 header, and a damaged copy shows the plain message instead of running |
| `nosave` | A game says so when the browser will not keep its save (blocked from the start, or full later), and says nothing when saving works |
| `twowin` | One window at a time: a second editor window (or a second copy on this computer) is paused with a box; "Use this window instead" takes over and the first window saves its last edit and pauses; without Web Locks a save by another window asks which version to keep |
| `safety` | Options → Safety (what the autosave is, when the story was last saved to a file, space used, "ask the browser to keep it"), the revision number and time every file save writes (picked file and plain download), the once-a-week reminder to save a file (7 days, at most once a day, never for an almost empty story), and File → Save test script (.md) |
| `gamefeel` | The game's already-taken check mark, the ending recap's "Roads not taken" (only choices open to anyone, none that need or forbid an item), back swipe / back button / Esc doing Back (CloseWatcher) without also closing the Aa panel twice, and contrast that follows the system until the reader chooses |
| `textstress` | Every page of two sample stories at 320 px with Larger text, Roomy spacing, choice numbers and the WCAG 1.4.12 spacing values: nothing cut off, nothing scrolling sideways, the Aa panel on screen (full tier only) |
| `motion` | With real animation (every other suite asks for reduced motion), the opening splash plays its full time and leaves |
| `ffsmoke` | The editor and an exported game load without errors in Firefox |
| `top10-export`, `top10-player`, `top10-editor` | Export and Game options, the game's Back / dice / locks / bars, the editor's screens |
| `top10-lite` | Every optional feature module: a game with only the modules its story needs plays exactly like the full game (19 stories, 30 random steps, 2 seeds). The screen-reader announcement is compared on its own, because Firefox sometimes leaves visually hidden text out of `innerText` |
| `real`, `opts`, `last`, `fix2`, `dlg`, `inter` | Everyday use end to end: drag, menus, Givens, export and play offline (including without `DecompressionStream`), dialogs |
| `tools8` | Find and replace (logic, Undo, Go), unfinished flags, "why can't players reach this page" and the unreached list, the manuscript, and dead numbers (5 numbers x 8 pages must finish in a few hundred situations) |
| `write1` | Write tab, batch 1 and 2: the shared page picker (type, arrows, Enter, Ctrl+Enter, Esc, one-step Undo), Go ›, ‹ ›, From chips, Ctrl+K, hiding and showing both side lists, Sort menu, the two-choice template, click and Shift+click on item chips, the empty-page hint, Next to write, phone fit |
| `write2` | Write tab, batch 3: drag grips for choices and paragraphs, word count, split page (Ctrl+Shift+Enter and the menu, one Undo), paste a scene (and a plain paste left alone), smart quotes and dashes, text size, the wide layout (and that it survives redraws) |
| `round3` | a UI round: no up/down arrow buttons, Alt+arrow reorder, dice tab icon, start page never an ending (radios, star, opening an old file with a note), the new checker rules, map icon toolbar (views, colors, follow menu, merge/size, keyboard) and key above Start (desktop) or default (phone), first-time tour (auto on first visit, steps, Esc, replay from Options, phone drawers, not repeated) |
| `bugs12` | bug-fix round, one check per fix: Save while a save is under way and edits during it, the spare copy when a story is replaced, a full disk and "nothing can be kept" (warning, closing asks), Extra large text after reload, the tour waiting for typing, the map key following the window, the Aa panel (Esc, outside click, never cut off at four window heights), Start over on a stuck page, Place codes (a real one restores, damaged ones are refused with the message showing) |
| `touch1` | Touch reordering on an emulated phone (Chromium): grips visible and finger-sized, finger drag of choices and paragraphs, and a drag across an 8-choice list with the finger held at the edge |
| `fuzz1.js [engine] [steps] [seeds]` | Not in the quick tier. Random real clicks, typing, keys, view changes, resizes and reloads in the editor; after every step: no errors, the screen is not blank or showing undefined/NaN, the story is whole (start page exists and is not an ending, ids unique, no dangling choice). At the end Undo all then Redo all must give the same story and the autosave must match. `SEEDBASE=n` changes the sequences |
| `fuzz2.js [engine] [stories] [steps]` | Not in the quick tier. Random stories using every feature (`genstory.js`, the contract test's generator) exported as real games and played with random choices, Back, Start over, reloads, Place codes (copy, clear the device, paste: same place) and the Aa panel; always something to press, no errors |
| `fuzz3.mjs [n] [seed]` | Node only. Thousands of damaged copies of real stories (values replaced by null, text, lists, objects; fields deleted; duplicated or dangling ids) must load, normalize to a whole story (stable when run twice), check, export, simulate and draw without throwing |
| `fuzz4.js [engine] [n]` | Damaged saved places in exported games (a saved position changed to junk, cut in half, ids that do not exist): the game must start and show something to press |

Also here: `lines.js` (how the runner reads a suite's output, with a self-test), `unzip.js` (a test calls `plain(text)` to read an exported
game, which is saved zipped), `engine.js` (picks the browser), `fixtures/` (a sample story), `work/` (made files; safe to delete).

## How the rules read output (`lines.js`)

A suite fails if it exits with an error, **or** prints a line that *starts* with `FAIL `, `FAILED`, `N FAILED`, `FAILURES n`, `SCRIPT ERROR`,
`STOPPED`, `SomethingError: ` or `Node.js v`, **or** prints `errors`/`page errors` followed by anything but empty brackets, **or** prints
fewer `PASS ` lines than the last all-green full run (`counts.json`: "lost checks"; a suite that quietly skips tests is a failure).
Starts-of-lines only, so a passing check whose *name* contains the word "error" is never mistaken for a failure. `node lines.js` tries 20
made-up lines against these rules; the runner runs that too.

## Why flaky checks were fixed, not retried

The runner retries a failing suite once and marks a recovery `pass*`, but a flake is a bug in the check. Found and fixed along the way: a click
that arrives while the editor redraws is lost (tests click again until the next screen is there), a drag released before the page list is ready,
a drawer toggled twice, reading the saved state before it is saved (tests now wait for it), and Firefox's `innerText` dropping hidden text.
Rule of thumb for new checks: wait for the thing you expect, never for a fixed time.

## Speed (measured on a two-core cloud machine)

The full check was 14 to 30+ minutes (mostly `top10-lite`, which sent one command per click from outside the browser). Oct 8: the lite suite
runs its whole 30-step walk inside the page (14 min to 50 s), waits are for the page's timers, not fixed sleeps, a click is one call, screenshots
are off, output goes to files. Then more suites were added (bug-fix rounds, three fuzzers, the Write tab), which took the full check to 11 minutes
(677 s) and the quick check to 150 s. Audit of Oct 12 2026 (two cores, so the figures are real time and CPU time of the whole run):

| | before | after |
|---|---|---|
| quick, real time / CPU time | 149 s / 134 s | about 100 s / 114 s |
| full, real time | 677 s | about 320 s |
| build (`build.py`) | 5.9 s | 3.6 s |
| `npm test` | 19 s | 13.6 s |

What changed, and why:
- **A pool of three workers** replaces the fixed Firefox and Chromium lanes. A suite spends most of its time waiting for the page, so with two lanes the
  two cores were about 40% busy. Suites start longest first (`times.json` remembers how long each took), so no worker is left with one long suite.
  `QA_JOBS=n` changes the number; four was faster still (90 s quick) but slowed single suites by up to 40%, which risks timing-based checks.
- **Reduced motion for every test browser** (`engine.js`; `QA_MOTION=1` turns it off, suite `motion` always plays the real thing). The opening
  splash is painted on the CPU without a graphics card; the editor honors the setting. Saved 15% of CPU time.
- **Chromium no longer sits through the 4.4 s opening** when a suite waits for it to be gone (Firefox's engine already removed it): about 60 loads.
- **The first suite that needs the web server waits until it is listening** (it used to fail once and pass on the retry in every full run, doubling its time).
- `dlg` sets the "tour already seen" flag; before, the 4.4 s wait hid that the first-time tour pops up 4.6 s after load.

Not changed (decisions for the owner): Chromium repeats every suite (about half of full-check time; `fuzz2` alone is a minute on Chromium); fixed waits
still total about 45 s of suite time in the quick tier; `smart` re-runs nearly everything after any source change because most suites watch every file.


## Does the contract test notice a deliberate bug? (`mutants.py`)

`python3 qa/mutants.py` (about 20 seconds) puts 14 one-line bugs into the game rules, one at a time, in a copy of `core.js` and runs `contract.mjs` on each. All 14 are caught (checked 2026-10-14); two of them are changes that do not alter the game (an odds shortcut at 2, the default top limit of a number that the loader always fills in) and used to survive until the contract compared the paragraphs and choices shown with a plain-words reading. Add a line to `MUTANTS` whenever a rule changes; a "SURVIVED" line that is not marked equivalent means the contract has a gap. The contract itself now stops after `CONTRACT_TIMEOUT_S` seconds (90) instead of hanging when a rule loops.
