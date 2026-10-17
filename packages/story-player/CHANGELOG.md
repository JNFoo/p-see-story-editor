# story-player changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers. Figures not measured say "about" or "not measured".

## 1.0.1 · 2026-10-17
**Changed:** the policy line every page this package builds carries now has `'wasm-unsafe-eval'` in its script rule, so a game can start a WebAssembly module (owner's rule for all our pages). Nothing else in the policy changed. Each built game grows 19 bytes (a standard 25-page game 51,742 to 51,761). No game uses WebAssembly yet, so nothing behaves differently today.

**Tested in:** Node package tests; Firefox 158.0b5, ungoogled Chromium 155.0.8059.39-1 and WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5 compile a tiny WebAssembly module inside a built game (the editor's `csp` check; without the change the browser refuses it).

## 1.0.0 · 2026-10-16
**Smaller download:** a minified build, `dist/story-player.min.mjs`, is 56.5 KB (21.3 KB gzipped) against 71.3 KB for the readable file, about 21% less. The readable file is still there. The games it makes are unchanged.

**Safer:** `normalizeProject` (used when a story is loaded) no longer writes onto the pages you hand it, so frozen (read-only) stories work.

**Tested in:** Node 22.22.0 package tests, no browser; selected editor suites on Chromium 141.0.7390.37 (Playwright's bundled build). No Firefox run: Firefox could not be installed in the container then.

## 1.0.0 as first published · 2026-10-12
**New:** a builder that turns a story into one offline HTML page that plays in any browser, with no server, no internet and no tracking (`buildGame`); the same page that unzips itself when opened, about a quarter smaller (`buildZippedGame`); a way to play a story from code with exactly the game's rules, for bots, tests and AI helpers (`createSession`); and a command line for building and playing in a terminal. A game carries only the features its story uses, so there is no dice code without dice checks. The example game is about 20 KB. The readable file was 71.3 KB.

**Tested in:** not recorded for this build. Standing practice then: the quick tier on Firefox 158 and the full tier on Firefox 158 and then Chromium (Chromium version not recorded).
