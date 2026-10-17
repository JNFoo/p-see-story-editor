# story-map changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers. Figures not measured say "about" or "not measured".

## 1.0.0 · 2026-10-16
**Smaller download:** a minified build, `dist/story-map.min.mjs`, is 33.2 KB (14.3 KB gzipped) against 56.5 KB for the readable file, about 41% less. The readable file is still there.

**Safer:** `normalizeProject` no longer writes onto the pages you hand it, so frozen (read-only) stories work.

**Tested in:** Node 22.22.0 package tests, no browser; selected editor suites on Chromium 141.0.7390.37 (Playwright's bundled build). No Firefox run: Firefox could not be installed in the container then.

## 1.0.0 as first published · 2026-10-12
**New:** pictures and numbers for the shape of a branching story, with no dependencies and no DOM. A layered left-to-right or top-down drawing that keeps choke points on one line, plus arc, matrix and "story shape" views (`layoutStory`, `toSvg`); the pages every route to the goal must pass and how much traffic runs through each; thousands of seeded random players using the game's own rules, so you see where players really go, which endings they reach and where they get stuck (`playtest`); and drawing measures such as crossings, reading direction, stability between edits and speed (`mapMetrics`). The readable file was 56.5 KB.

**Tested in:** not recorded for this build. Standing practice then: the quick tier on Firefox 158 and the full tier on Firefox 158 and then Chromium (Chromium version not recorded).
