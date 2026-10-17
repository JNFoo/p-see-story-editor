# story-outline changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers.

## 1.0.0 · 2026-10-17
**New:** a package that turns an indented outline into pages and choices, or into a whole story in one call (`outlineToProject`). Page names go at the left edge, choices go under them as "words → page", other lines become paragraphs, and "(good ending)" or "(bad ending)" makes an ending. It reads up to 3,000 lines, ignores bullets, numbers and tabs, tells you in plain words about anything it could not use (a page listed twice, a choice that leads nowhere), and adds an empty page for any page only named in a choice, so no choice points at nothing. It is the reader behind File → Paste an outline in the Story Editor.

**Size:** 14.7 KB minified, 6.3 KB gzipped (most of it is the story cleaner it carries so it needs nothing else).

**Tested in:** Node 22.22.0 package tests, no browser. The editor's `helpers` and `undohist` suites ran on Chromium 141.0.7390.37, Chromium 153.0.8010.0 (not ungoogled) and Firefox 157.0.1, and the Firefox 157.0.1 quick tier passed 28 of 28, because the outline code moved inside the editor.
