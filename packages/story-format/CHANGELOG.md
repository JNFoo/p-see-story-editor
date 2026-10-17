# story-format changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers.

## 2.0.0 · 2026-10-17
**Smaller:** the Twine importer moved to its own package, [twine-import](../twine-import/README.md), so this one is 59% smaller: 71.7 KB to 29.5 KB minified, and 27.1 KB to 11.5 KB gzipped. Anyone who used `importTwine`, `twineRead`, `twineConvert` or the `twine-to-story` command must switch to the other package; they work the same there. That is why this is a new major version.

**Tested in:** Node 22.22.0 package tests, no browser.

## 1.0.0 · 2026-10-12
**New:** the story data model: create, clean and check any story file (it repairs wrong types, bad or duplicate ids and broken links), a plain-text way to write a story, find and replace, a Markdown manuscript, counts, the Twine importer, and a JSON Schema.

**Tested in:** not recorded.
