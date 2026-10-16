# Building a single-file, offline tool with an AI assistant

Written at the end of a long build of the Story Editor (an offline tool for writing interactive stories), for **an AI session starting a new project** and for **the person it works with**, who may not be a programmer. Everything here was done and measured, not guessed; where something was not re-checked it says so.

If you read only one section, read "The ten habits" and "Pitfalls we hit".

---

## 1. What this project produced (so you know what to reuse)

| Thing | Where | What it is |
|---|---|---|
| The editor | `editor/` | About 20 source files that `build.py` joins into **one** HTML file that makes no network requests. |
| The checks | `editor/qa/` | One command runs the suites on Firefox and Chromium: `node qa.js quick` (about 1 to 2 minutes) or `node qa.js full` (about 4 to 6 minutes). |
| The reusable packages | `packages/` | The story model, checker, game builder, map layout and zipped-page code, cut from the editor's own sources. |
| The change log | `docs/CHANGELOG.md` | Every change, why, and how it was tested. |

The product, in one line: the author writes pages and choices; the editor checks every path; **Export** makes one small HTML game file anyone can play, online or off.

---

## 2. The ten habits that made this work

1. **One file, no network.** The finished product is one `.html` file that works by double-clicking. A Content-Security-Policy in the page forbids network use, and text is only ever put into the page as text, never as HTML. This makes it private, easy to hand to a friend, and nothing to host.
2. **Edit parts, build the whole.** Sources are separate files (rules, screens, styles); `build.py` joins them. Never edit the built file. The build fails loudly on mistakes (size over budget, a missing rule, a stray `</script`).
3. **Write the rules once, copy them by machine.** The game rules are plain functions. The editor runs them; the exported game gets a copy made with `Function.prototype.toString`; the story checker re-implements them differently (fast bit masks). A **contract test** (`editor/contract.mjs`) plays 400 random stories both ways on every build and fails if they ever disagree. The same idea works for any project with "the app" and "the exported thing", or "the slow-but-obvious version" and "the fast version": keep both and make a test compare them.
4. **List every field and say what it does.** `FIELD_CONTRACT` in `core.js` says, for each field of a story, whether it changes what a player can do or only how things look. A new field that is not listed fails the build. Forgetting to handle a field is the most common way a feature rots; this makes forgetting impossible.
5. **Size budgets with ceilings.** After every build a table shows each output's size, its ceiling and the change since last time. Ceilings were set at "current size plus about 5%". Raising one needs a stated reason. Numbers must repeat exactly (seed random numbers and the clock in the measuring script) or a one-byte wobble looks like a change.
6. **Safe saves.** Never write a save the program could not read back; keep a spare copy; if the newest save is unreadable, keep it aside, open the spare and tell the person. Games save their place the same way, and also when the page is hidden or closed.
7. **Measure first, change second, prove third.** For any speed work: profile (the browser can list which functions spent the time), change the biggest thing, then run a script that compares the old and new code on hundreds of inputs and requires **identical output**. See section 5.
8. **Test in the browser your people use.** Firefox shows performance regressions most plainly, so it was the main test browser; Chromium ran in the full check (it can also do phone shapes and native drag-and-drop).
9. **Fix flaky checks; never just retry them.** A check that sometimes fails is a bug in the check. The runner retries once and marks a recovery `pass*` so it is visible. Wait for the thing you expect, never for a fixed time.
10. **Make failure readable.** One line per suite on screen, full output in a log file, a summary naming the slowest suites. Nothing needs pasting into a chat.

---

## 3. Working agreement between a person and an AI session

Write your own version of these into `AGENTS.md` (a template is in `templates/`). These worked:

- **Plain words first.** If the person is not a programmer, say what a change means for them before how it works. Explain a term in a clause or avoid it.
- **Ask before larger features, not before small reversible ones.** Offer short multiple-choice questions with a recommended option first. Small, clearly asked changes: just do them.
- **A status line when asked.** Long runs are silent; when the person asks "what are you doing?", reply in a few words and keep going.
- **Report real elapsed time and approximate compute** at the end of a request (read the clock; do not guess).
- **Hold the heavy checks until the design is final.** While options are still being discarded, do not benchmark them.
- **Hand over something usable.** A file the person can open and a short summary, not an account of effort.
- **A shared task board** when more than one session works in a repository: claim a row before starting, update it when you finish, rebase before you push, never force-push, and say in the commit message if you touch another session's files.
- **Provenance.** Say where an idea came from; do not paste code you cannot license.

---

## 4. The checking kit

It lives in `editor/qa/` (the editor's suites) and `packages/qa-kit/` (the Firefox shim and the random-story generator).

**Run it:** `cd editor/qa; node qa.js quick | smart | full`. `smart` = quick plus any suite whose watched source files changed since the last all-green run. `--only lite` runs one suite family; `--verbose` prints suite output; `--reset-counts` accepts fewer checks on purpose.

**Stock Firefox with Playwright-style tests.** Playwright drives its own patched Firefox, which can lag behind the real one. `packages/qa-kit/src/bidi.js` gives test code Playwright-style calls (`click('text=Save')`, `locator(...).first()`, `fill`, `keyboard.press('Control+z')`) on top of **Puppeteer over WebDriver BiDi**, which drives stock Firefox. Limits: no phone emulation, no native drag-and-drop (it sends the same events), no file pickers; those stay on Chromium.

**What the runner decides is a failure** (`editor/qa/lines.js`, with a 20-line self-test): the suite exits with an error; or prints a line that *starts* with `FAIL `, `FAILED`, `N FAILED`, `FAILURES n`, `STOPPED`, `SCRIPT ERROR`, `SomethingError: ` or `Node.js v`; or prints an `errors` line that is not empty; or prints **fewer `PASS ` lines than the last all-green full run** (`counts.json`: a suite that quietly skips tests fails). Start-of-line only, so a passing check whose name contains "error" is not a failure.

**Speed recipe** (the full check went from over 30 minutes to about 4):

| Cause of slowness | Fix |
|---|---|
| One command sent from outside the browser per click (one suite took 14 minutes) | Run the whole walk inside the page in one call (50 s) |
| Fixed sleeps | Wait for the page's own timers or for the expected element |
| Screenshots on every step | Off unless `SHOTS=1` |
| Test output pasted to the screen | Logs to files; one line per suite |
| Firefox and Chromium one after the other | Two lanes side by side (two processor cores) |
| Chromium runs for every small change | Chromium only in the full tier |
| A stale web server on a fixed port answering for a deleted folder | Each run picks a random port |

---

## 5. How the Map got fast (and how to do the same elsewhere)

Test: a 300-page story, script time of the first Map visit and of later visits, median of 3 fresh page loads.

| | Chromium first | Chromium later | Firefox first | Firefox later |
|---|---|---|---|---|
| At the start | 511 ms | 165 ms | 797 ms | 280 ms |
| After the scoring/counting round | 430 ms | 72 ms | 527 ms | 70-100 ms |
| After the simulation round | 353 ms | about 70 ms | about 490 ms | about 65 ms |
| After deferring the simulation | 245 ms | about 70 ms | 253 ms | 90 ms |

**The method, which transfers to any slow screen:**

1. **Profile, do not guess.** The browser's sampling profiler lists the functions that spent the time. The first round showed every redraw re-scoring the whole picture (each page compared with every other, up to four times) for numbers the toolbar does not even show.
2. **Do less work, then do it once.** Ask only for what is shown; work out the full score once per picture and keep it; find nearest neighbors with a short sorted list instead of sorting everything.
3. **Cache what does not change between steps.** 2,000 simulated players take up to 400 steps each, and every step asked the game's rules the same questions. Per page, once: which choices lead anywhere; whether any choice has a condition; whether any paragraph has a condition; whether arriving changes anything. The rules themselves are untouched, so exported games behave exactly as before.
4. **Prove it is the same.** Load the old and new code side by side and require identical output on the built-in stories plus hundreds of random ones. (`packages/qa-kit/src/editor-vm.mjs` and `genstory.mjs` do exactly this for the packages: every package test compares against the editor's own sources.)
5. **Test the test.** Deliberately break the new code in several ways (one per shortcut condition) and confirm the proof notices. This found a real flaw in the first version of a shortcut: a cleaned-up story stores "no number changes" as an empty object `{}`, which is truthy, so the shortcut never fired.
6. **Ask who really needs the expensive thing.** The simulated players were not needed for the first picture at all: only one score, one view and two colorings read them. They are now computed the first time something asks. That beat reusing the simulation between edits (it would change displayed percentages) and a background worker (it would not fit the page's rules). Before making slow work faster, check whether it can wait.
7. **Check old and new builds side by side in the real browser.** Open the same views in an old and a new build and require the same scores.

---

## 6. Pitfalls we hit (so the next project skips them)

**Page and build**
- A script placed in an HTML page must never contain `</script` (any letter case) nor a `<!--` followed by `<script` before a `-->`; the browser then ends or hides the script early. The build checks both.
- fontTools stamps the time into a subset font; two rebuilds differ by up to about 120 bytes unless `SOURCE_DATE_EPOCH` is set. The build sets it.
- Page ids made at random move a size by a byte from build to build; seed them when measuring.
- A "does this character fit the small font?" check that reads source text misses capital hex digits and typed-in characters; ask the rule itself about every character instead.
- A name-scan test must strip comments first, and rules must be tested in a context holding **only** what an exported game holds, or a rule that depends on an editor-only helper passes the test and breaks in the export.

**Zipped files** (the editor and the games unzip themselves)
- Raw deflate (Zopfli at build time, the browser's `CompressionStream` for exports) is stored as base64 in a `<script type="text/plain">` and unpacked with `DecompressionStream('deflate-raw')`, falling back to a small built-in inflater (`zipInflate`, see `packages/zip-page`) when the browser has none. The fallback is tested against zlib at every level.
- Measured cost: the editor opens about 30 ms slower, games 3 to 11 ms. Gain: the editor 462 KB to 219 KB; games about 28% (less, because an embedded font is already compressed). The saved file is no longer readable in a text editor.

**Testing in Firefox**
- Firefox's `innerText` can silently drop visually hidden text (a screen-reader live region). Compare that text separately.
- Clicks and timers can be lost while the editor redraws: click again until the next screen exists.
- Parallel browser contexts sometimes fail at start ("no such frame"): retry the creation up to three times.
- A test that clears storage and then reloads must first neuter the page's save-on-close, or the page writes the old state back.
- A scripted find-and-replace that is too broad deleted lines of a test file once; after any scripted edit, diff it.
- Never `cd ..` inside a clean-up command; use absolute paths.

**Data**
- Cleaned-up stories store "nothing" as empty arrays and empty objects. Both are truthy in JavaScript. Test for `.length` or `Object.keys(...).length`, never for presence.
- Numbers equal to 0 and missing numbers behave the same in every rule; shortcuts may rely on that, but write down why.

---

## 7. Starting a new project from this (checklist)

1. Ask the person the three things that decide the shape: what the output file is, who opens it (browser, device), and what must never be lost (saves). Offer multiple-choice answers.
2. Copy `editor/qa/` and the build pattern. Start with `build.py` (join parts, check, budget), `core.js` (data model plus rules, no screen code), a contract test, and `qa.js quick` before any feature.
3. Put every rule in a plain function; decide up front what the "second implementation" or exported copy is and how a test compares them.
4. Keep a change log with one row per change: number, title, what changed and why, how it was tested. Rows are cheap and make the next session's start fast. Mark old facts as history instead of deleting them.
5. Before delivering: build, run the full check, send the built file with a short note and the real elapsed time and compute.
6. If asked to speed something up: section 5, in order.
7. When you find something reusable, cut it out **from the real sources** with a script and a drift check (`tools/extract-packages.mjs` here), so there is still only one copy to maintain.

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
