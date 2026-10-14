# zip-page

Shrinks **one HTML file** into a page that **unzips itself** when opened. No server, no build step for the reader, works from `file://` and offline.

- `node bin/zip-page.mjs in.html out.html` (Node 18+, uses zlib level 9).
- `zipPage(html)` in a browser or Node: the same thing with the platform's `CompressionStream`.
- `zipInflate(bytes)`: a **plain, readable RFC 1951 inflater in about 100 lines** (stored, fixed and dynamic blocks) that the zipped page falls back on in browsers without `DecompressionStream`. It is also useful on its own.

Zero dependencies.

```
$ node bin/zip-page.mjs game.html game.zip.html
22,219 bytes -> 15,774 bytes (71%)
```

## How a zipped page works

The output is a tiny page: the zipped original as a block of base64 text, and a short script that decodes it, inflates it with `DecompressionStream('deflate-raw')` (or the built-in inflater), and replaces the document with the original. Opening costs a few milliseconds.

## Install

Copy `dist/zip-page.mjs` or `dist/zip-page.global.js` (`ZipPage`), or use the command line tool in `bin/`.

## API

| Call | What it does |
|---|---|
| `zipPage(html)` | `async`, returns the zipped page. Returns the input unchanged where `CompressionStream` is missing. |
| `zippedPage(base64OfRawDeflate, title)` | Builds the wrapper page around bytes you compressed yourself (for example with Zopfli, which squeezes about 4% more than zlib). `title` is used as given; escape it. |
| `zipInflate(uint8array)` | Raw-deflate bytes to text. |

Types: [index.d.ts](index.d.ts).

## How it differs from what exists

This repository's sibling [JS-modules](https://github.com/JNFoo/JS-modules) already has the Zopfli packer in its `tools/single-file-tools` folder (Zopfli, Python) and `tools/lzma-pack` (LZMA, a smaller result with a bigger decoder). Use those for the very smallest files. `zip-page` is the Node/JavaScript route with **no install** and adds the readable inflater for browsers without `DecompressionStream` (browsers from before about 2023).

## Limits

- The page needs JavaScript. View-source shows base64, not your markup.
- Pages under about 6 KB can come out **larger**, more for text that does not compress well (the unzipping wrapper and inflater cost about 4.5 KB); the tool prints the ratio, so check.
- The page is rewritten with `document.write`, so it behaves like the original except that `document.currentScript` and a few load-order details differ. Test the result.
- Keep a normal copy for old browsers or archives.

## Tests

`npm test`: the inflater matches zlib on 120 inputs at three compression levels (empty, tiny, repetitive, Unicode, stored/fixed/dynamic blocks); same answers as the editor's own code; the wrapper keeps the title; the command line tool round-trips a real page. The editor's browser suites open zipped pages in Firefox and Chromium.

## For AI agents

See [AGENTS.md](AGENTS.md).

---
Part of [p-see-story-editor](../../README.md) · MIT License · Copyright (c) 2026 JNFoo
