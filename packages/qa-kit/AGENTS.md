# qa-kit: notes for AI agents

This folder is a small test runner (`src/runner.js`) plus a Playwright-style shim over Puppeteer for stock Firefox (`src/bidi.js`). Read `README.md` first
for what it is and is not. Do not describe the shim as a new browser driver.

## Run it

- `node --test test/` : this package's own tests (the Firefox test skips itself unless `FIREFOX_PATH` is set).
- For the story editor's suites see `editor/qa/README.md`: `node editor/qa/qa.js quick` after any change, `full` before you call work done.
- The runner prints `pass`, `pass*` (failed once, passed on retry) or `FAIL`, and keeps each suite's whole output in `logs/<suite>.log`.
  Read the log; do not paste a whole browser run into a chat.

## Add a suite

1. Write `suites/<name>.js` (CommonJS). Take the engine from `process.argv[2]` (`firefox` or `chromium`), launch it, and print one line per check:
   `console.log((ok ? 'PASS ' : 'FAIL ') + 'what was checked')`. Print a `FAIL ` line (or exit non-zero) on any problem; end the process.
2. Add `{ name, file, watch, quick, engines }` to the config's `suites`. `watch` lists the source files whose change makes `smart` re-run it.
   Mark it `quick: true` only if it is fast and catches common breakage. Use `engines: ['chromium']` for anything Firefox cannot do (device emulation, native drag).
3. Run it alone first (`node suites/<name>.js firefox`), then through the runner (`--only <name>`).

## Waiting and flakes

- **Wait on conditions, never on fixed sleeps.** Use `page.waitForSelector`, `page.waitForFunction`, or `waitFor(() => ...)` from `src/wait.js`.
  A fixed `waitForTimeout(500)` is a guess: too short on a slow machine (flaky), too long on a fast one (slow). In `bidi.js`, `waitForTimeout` stops early once
  the page has settled, but it is still a guess; `nap` is real time and for the rare moment when nothing can be observed.
- **A flake is a bug in the check, not a fact of life.** The runner retries a failing suite once and shows `pass*` so the flake is visible; when you see
  `pass*`, read `logs/<suite>.first-try.log` and fix the cause. Do not raise timeouts or add retries to hide it.
- Common causes: a click that lands while the page redraws (click again until the next screen is there), reading saved state before it is saved
  (wait for it), a drag released before the list is ready, and Firefox dropping visually hidden text from `innerText`.
- Never delete a check to get a green run. The runner compares each suite's PASS count to the last green `full` run and fails if it shrinks; use
  `--reset-counts` only when you removed a check on purpose.
