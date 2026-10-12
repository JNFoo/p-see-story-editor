# qa-kit

Two small things the story editor's own test suites are built on, cut out so other projects can use them:

1. **A tiered test runner** (`src/runner.js`). You describe your suites in a config file; it runs them in three tiers, retries a failure once,
   keeps one log per suite, and ends with a one-paragraph summary.
2. **A Playwright-style call surface over Puppeteer's WebDriver BiDi** (`src/bidi.js`), so a suite written for Playwright runs on **stock Firefox**.

Both are plain CommonJS, a few hundred lines, no build step. MIT license.

## What the Firefox part is, and is not

Be clear about what you are getting: this is **not a new browser driver**.

- Puppeteer has driven Firefox through WebDriver BiDi since v23. All the real work (launching Firefox, talking to it, evaluating code, sending
  input) is Puppeteer's.
- Playwright drives only its own patched Firefox build, which is not the Firefox your users run and which trails the stock releases.
- What `bidi.js` adds is the **Playwright call surface and selector syntax** on top of Puppeteer: `page.click('text=Save')`,
  `page.locator('li >> nth=1')`, `button:has-text("Play")`, `$$eval`, `fill`, `keyboard.press('Control+z')`, `waitForSelector`, and so on.
  A suite written for Playwright can then run, unchanged, against stock Firefox (through `bidi.js`) and against Chromium (through Playwright itself).

If you are starting a new project and do not already have Playwright-style suites, plain Puppeteer is simpler.

### Limits (what it does not do)

- No phone or device emulation (`devices['iPhone 13']`); keep those suites on Chromium.
- No browser-native HTML5 drag and drop: `dragTo` / `dragAndDrop` send the same `dragstart` / `dragover` / `drop` / `dragend` events at the real
  positions, which tests your handlers but not Firefox's own drag.
- No file pickers, downloads, network interception, or frames other than the main one.
- Only the part of Playwright's API the editor's suites use. If a call is missing it throws "is not a function"; adding one is usually a few lines.
- One quirk worth knowing: a headless Firefox shares one window between pages, so `bidi.js` brings a page to the front before it clicks or types.

Selectors understood: CSS, `text=Foo`, `text="Foo"`, `text=/re/i`, `css:has-text("Foo")`, `css:text-is("Foo")`, `a >> b` (search inside), `>> nth=0`
(`nth=-1` is the last). The matching runs inside the page (`src/bidi-engine.js`), one call to find, filter and count.

## Using the browser part

```js
const { firefox } = require('qa-kit/src/bidi.js');   // or a relative path into this folder
const browser = await firefox.launch();               // headless unless launch({ headless: false })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto('file:///path/to/app.html');
await page.click('text=Save');
console.log(await page.locator('#status').innerText());
await browser.close();
```

Environment:

| Variable | Meaning |
|---|---|
| `FIREFOX_PATH` | Path to a stock Firefox binary (required to launch). `FIREFOX_158` is accepted as an alias. |
| `QA_NODE_MODULES` | Extra `node_modules` folder searched for `puppeteer` / `playwright` if a normal `require` does not find them (`NODE_PATH` works too). |
| `QA_FIREFOX_PREFS` | JSON of extra Firefox preferences for every browser the Firefox engine launches, for example `{"ui.prefersReducedMotion":1}` to skip animation work in tests. |
| `PROFILE=1` | At exit, print where the time went per kind of call. |
| `FIXED_WAITS=1` | Make `waitForTimeout` wait the full time instead of stopping early once the page has settled. |
| `SHOTS=1` | Take screenshots (`page.screenshot` does nothing otherwise, because nobody looks at them in a routine run). |

`peerDependencies` are `puppeteer` (for Firefox) and `playwright` (for Chromium); both are optional, install what you use.

## Using the runner

Write a config (default name `qa.config.cjs`):

```js
module.exports = {
  root: '.',                         // sources and the built file are relative to this
  sources: ['app.js', 'app.css'],    // files whose modification time decides what "smart" re-runs
  build: { cmd: ['npm', 'run', 'build'], output: 'dist/app.html' },   // optional: rebuild first if a source is newer than the output
  serve: 'work',                                                      // optional: serve this folder on 127.0.0.1; suites read the port from QA_PORT
  engines: ['firefox', 'chromium'],  // the first runs in every tier, the rest only in "full"
  suites: [
    { name: 'basics', file: 'suites/basics.js', watch: ['app.js'], quick: true },
    { name: 'phone',  file: 'suites/phone.js',  watch: ['app.css'], quick: true, engines: ['chromium'] }
  ],
  extra: [{ name: 'unit', cmd: ['node', '--test'], watch: ['app.js'], quick: true }]   // any other command
};
```

A suite is a node script run as `node <file> <engine>` (`firefox` or `chromium`). It prints `PASS <check>` or `FAIL <check>` lines and ends. Then:

```
node qa-kit/src/runner.js qa.config.cjs quick     # the quick suites on the first engine
node qa-kit/src/runner.js qa.config.cjs smart     # quick, plus every suite whose watched files changed since the last all-green run
node qa-kit/src/runner.js qa.config.cjs full      # everything, on every engine (the other engines run side by side with the first)
node qa-kit/src/runner.js --help
```

Output is one line per suite (`pass`, `pass*` for failed-then-passed-on-retry, `FAIL`), the first failing lines of any failure, and a summary
that names the slowest suites. Each suite's complete output is in `logs/<suite>.log` (and `.first-try.log` when a retry happened). Exit code is 1 if any suite failed.

How a suite is judged (`src/lines.js`, with a self-test): it fails if it exits non-zero, **or** prints a line that *starts* with `FAIL `, `FAILED`,
`N FAILED`, `FAILURES n`, `SCRIPT ERROR`, `STOPPED`, `SomethingError: ` or `Node.js v`, **or** prints `errors` / `page errors` followed by anything
but empty brackets, **or** prints fewer `PASS ` lines than the last all-green `full` run (`counts.json`, so a suite that quietly skips checks is a
failure). Patterns match only at the start of a line, so a passing check whose *name* contains "error" is never mistaken for a failure.

`wait.js` has two helpers for suites: `nap(ms)` and `waitFor(condition, { timeout, every, what })`.

`genstory.mjs` (a seeded generator of random stories using every feature of the story format) and `editor-vm.mjs` (loads the editor's sources into a
sandbox) are specific to the story editor and are used by its tests; they are not needed for the runner or `bidi.js`.

## Tests

```
node --test test/
```

`runner.test.mjs` runs the runner on a fake project (a passing suite, a flaky one and a failing one). `bidi.test.mjs` opens a page in real Firefox; it is
**skipped** unless `FIREFOX_PATH` (or `FIREFOX_158`) names a binary and puppeteer is installed.

Copyright (c) 2026 JNFoo. MIT License.
