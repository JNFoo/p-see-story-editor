# Notices

**Story Editor and the packages in this repository**: Copyright (c) 2026 JNFoo, MIT License (see [LICENSE](LICENSE)).

**Provenance.** The code was written for the Story Editor by JNFoo with AI assistance (Claude, by Anthropic). The packages under `packages/` are cut from the editor's own sources by `tools/extract-packages.mjs`; they contain no third-party source code.

**Font.** The Inter Tight typeface in `editor/fonts/` is © 2016 The Inter Project Authors (https://github.com/rsms/inter), used under the SIL Open Font License 1.1 (text in `editor/fonts/InterTight-OFL.txt`). The font files are not covered by the MIT License; they keep the OFL. The built editor (`index.html`) and games exported with the font embedded carry subsets of it.

**Sample story.** `editor/keepers-light.project.json` ("The Keeper's Light") is an original story by JNFoo that ships as the editor's built-in example. It is included under the same MIT License as the code, and is used by the tests as a sample.

**Not included.** Tools you install yourself keep their own licenses and are not part of this repository: esbuild and Prettier (build and format), Zopfli (optional, smaller output), Puppeteer, Playwright and a browser (the test suites).
