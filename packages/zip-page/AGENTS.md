# zip-page: notes for AI agents

- Use it on a **finished** page only; always open the result in a browser (or the editor's `editor/qa` suites) before shipping.
- If a page is under about 6 KB, do not zip it: the wrapper costs more than it saves.
- For the smallest result, compress with Zopfli yourself and call `zippedPage(base64, title)`; see `editor/build.py` for the exact recipe the editor uses.
- Do not edit `src/generated.js` or `dist/` (generated from `../../editor/core.js`). `bin/zip-page.mjs` and `src/index.js` are hand-written.
