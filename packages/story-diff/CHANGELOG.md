# story-diff changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers.

## 1.0.0 · 2026-10-17
**New:** a package that says in plain words what one edit did to a story, such as “Add page “The Cellar””, “Delete a choice on “Start””, “Rename page “Start” to “The shore”” or “Change the start page”. It knows about twenty kinds of change (pages, choices, paragraphs, endings, items, the start page, title, author, game options and translations), names the page worth showing, and never fails on unreadable input. It is the label on the Undo and Redo buttons in the Story Editor. New since then: it accepts story objects as well as JSON text.

**Size:** 3.7 KB minified, 1.4 KB gzipped.

**Tested in:** Node 22.22.0 package tests, no browser. The editor's `helpers` and `undohist` suites ran on Chromium 141.0.7390.37, Chromium 153.0.8010.0 (not ungoogled) and Firefox 157.0.1, and the Firefox 157.0.1 quick tier passed 28 of 28.
