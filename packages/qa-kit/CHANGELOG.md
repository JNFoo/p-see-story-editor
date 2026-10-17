# qa-kit changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers. Figures not measured say "about" or "not measured".

## 0.1.0 · 2026-10-12
**New:** two small things cut out of the Story Editor's own test setup so other projects can use them (642 lines in all, no build step). (1) A test runner that runs your suites in three tiers, retries a failure once, keeps one log per suite and ends with a one-paragraph summary. (2) A Playwright-style call surface over Puppeteer's WebDriver BiDi, so a test written for Playwright (`page.click('text=Save')` and similar) runs unchanged on stock Firefox, not only on Playwright's patched build. Also a seeded generator of random stories that use every feature of the story format, and a loader that runs the editor's sources without a browser. The same day, an audit of the editor's own test suites, which run on this kit, took the full check from 677 s to 331 s and the quick check from 149 s to about 100 s (measured then; several changes together, listed in the main changelog, so not all of it is the runner).

**Tested in:** the runner's package tests on Node (version not recorded for this release); the Firefox test is skipped unless `FIREFOX_PATH` is set. In the latest run (Node 22.22.0) it was skipped, so no browser was used. The editor's suites that use the kit ran on Firefox 158 and Chromium (version not recorded) then.
