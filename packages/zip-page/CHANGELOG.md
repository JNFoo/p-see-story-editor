# zip-page changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers. Figures not measured say "about" or "not measured".

## 1.0.0 · 2026-10-16
**Smaller download:** a minified build, `dist/zip-page.min.mjs`, is 3.6 KB (2.0 KB gzipped) against 5.4 KB for the readable file, about 33% less. The readable file is still there.

**Tested in:** Node 22.22.0 package tests, no browser; selected editor suites on Chromium 141.0.7390.37 (Playwright's bundled build). No Firefox run: Firefox could not be installed in the container then.

## 1.0.0 as first published · 2026-10-12
**New:** a tool that shrinks one HTML file into a page that unzips itself when opened. It needs no server and works offline and from a saved file. The README's example takes a 22,219-byte game to 15,774 bytes (71% of the original, about 29% smaller). It includes a plain, readable inflater of about 100 lines (`zipInflate`) for browsers without built-in decompression, which is also useful on its own. The readable file was 5.4 KB.

**Tested in:** not recorded for this build. Standing practice then: the quick tier on Firefox 158 and the full tier on Firefox 158 and then Chromium (Chromium version not recorded).
