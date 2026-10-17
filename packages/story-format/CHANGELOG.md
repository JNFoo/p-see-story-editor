# story-format changelog

What changed in each version, newest first, in plain words.

## 2.0.0 · 2026-10-17
The Twine importer moved to its own package, [twine-import](../twine-import/README.md). `importTwine`, `twineRead`, `twineConvert` and the `twine-to-story` command are no longer here; they work the same there. Anyone who used them must switch packages, which is why this is a new major version. The smaller file is about 59% smaller (71.7 KB to 29.5 KB minified).

## 1.0.0 · 2026-10-12
First version: the story data model, the cleaner, the plain-text story syntax, find and replace, the Markdown manuscript, the Twine importer, and a JSON Schema.
