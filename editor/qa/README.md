# editor/qa: the checks for the Story Editor

Everything that tests the editor lives here. Written for two readers: an AI session picking this up cold, and a person who does
not program. The short version for both: **run one line, read one summary.**

```
cd qa
node qa.js quick     about 1 minute   after any change: the suites that catch most breakage, on Firefox
node qa.js smart     quick, plus every suite whose watched files changed since the last all-green run
node qa.js full      about 4 minutes  the check before a file is delivered: everything on Firefox and, side by side, on Chromium
node qa.js full --only lite     only suites with "lite" in the name        --verbose  also print each suite's own output
node qa.js full --reset-counts  accept a smaller number of checks on purpose (see "lost checks" below)
```

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
| `top5-safe`, `top5-new` | Save safety (the spare copy, a place kept across reloads), short ids, fingerprinted saves, the Map |
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

The full check was 14 to 30+ minutes (mostly `top10-lite`, which sent one command per click from outside the browser). Now: the lite suite
runs its whole 30-step walk inside the page (14 min to 50 s), waits are for the page's timers, not fixed sleeps, a click is one call, screenshots
are off, output goes to files, and the Firefox and Chromium lanes run side by side. Quick 52 s; full about 4 minutes.
