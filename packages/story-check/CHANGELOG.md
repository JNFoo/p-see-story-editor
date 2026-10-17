# story-check changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers. Figures not measured say "about" or "not measured".

## 1.0.0 · 2026-10-16
**Faster:** the note "a player who arrives without it can never come back for it" now uses one flat table of backward moves and stops as soon as every missing situation has been reached. A finished check of a 48,000-situation story went from 679 ms to 294 ms (2.3 times faster). The answers are identical on 156 test stories.

**Smaller:** a minified build, `dist/story-check.min.mjs`, is 41.5 KB (16.5 KB gzipped) against 68.8 KB for the readable file, about 40% less to download. The readable file is still there.

**Safer:** `normalizeProject` no longer writes anything onto the pages you hand it, so frozen (read-only) stories work. It takes two new options, `ids: 'sequential'` for repeatable ids and `notes` to collect what the author should be told. The editor behaves the same.

**Tested in:** Node 22.22.0 package tests (the package tests compare the checker with the editor's own on 150 random stories, no browser); selected editor suites on Chromium 141.0.7390.37 (Playwright's bundled build). No Firefox run: Firefox could not be installed in the container then.

## 1.0.0 as first published · 2026-10-12
**New:** the checker from the Story Editor, taken out as one file with no dependencies. It answers three questions for stories with items, conditions, numbers and dice checks: is there a dead end or a choice that goes nowhere, can any player ever reach a page or an ending (a real way, given the key to pick up first and the number that must be high enough), and for a page nobody can reach, why not and how close anyone gets. It runs in Node 18 and newer and in browsers, and it is tested to give the editor's own answers. The readable file was 68.8 KB.

**Tested in:** not recorded for this build. Standing practice then: the quick tier on Firefox 158 and the full tier on Firefox 158 and then Chromium (Chromium version not recorded).
