# Notes for AI assistants (and the people working with them)

This repository holds a single-file offline story editor (`editor/`) and small packages cut from its sources (`packages/`). It is meant to be read, copied from and extended by people and AI helpers together.

## Using a package in someone else's project
1. Open `packages/index.json` (or `llms.txt`), pick the package, read its `README.md` (the "Limits" section matters) and `AGENTS.md`.
2. Copy `dist/<name>.mjs` (ES module) or `dist/<name>.global.js` (a `<script>`) into the project. No install step, no dependencies. Or import from `https://cdn.jsdelivr.net/gh/JNFoo/p-see-story-editor@main/packages/<name>/dist/<name>.mjs`.
3. Run the package's `examples/quickstart.mjs` to see it work (`node examples/quickstart.mjs`).

## Changing this repository
- **One source of truth.** The logic lives in `editor/core.js` (model, rules, checker, export), `editor/player.js` (the game), `editor/maplayout.js` (map layout and simulated players) and `editor/game.css`. `packages/*/src/generated.js` and `packages/*/dist/*` are **generated** by `npm run build` (`tools/extract-packages.mjs`, using `tools/slice.mjs`). Never edit them by hand; `npm test` fails if they are out of date.
- Hand-written package files: `src/index.js`, `src/session.js`, `src/build.js`, `src/draw.js`, `bin/*`, `index.d.ts`, `story.schema.json`, READMEs, examples, tests. To make a new function public, add its name to the package's `roots` in `tools/extract-packages.mjs`.
- README code samples are copied from `examples/*.mjs` by `npm run build` (`tools/docs.mjs`); edit the example, not the README block.
- Every behavior you change gets a check. Package tests compare against the editor's own sources (`packages/qa-kit/src/editor-vm.mjs`), so equivalence is tested, not assumed.
- Plain words in docs. Say what a thing does, then its limits. Name the closest existing projects and say honestly how this differs; do not claim a benchmark you did not run.
- Keep the header `Copyright (c) 2026 JNFoo. MIT License` in new source files. Do not add code you cannot license under MIT, personal data, or other people's stories or text. Tests use the bundled sample story and generated stories only.
- American English in anything a user sees.

## Run the tests
```
npm install
npm test                          # no browser needed
cd editor/qa && FIREFOX_PATH=/path/to/firefox node qa.js quick     # browser suites; see editor/qa/README.md
```

## Working with other sessions
Several AI sessions and people may work on these repositories (see also [JS-modules](https://github.com/JNFoo/JS-modules), whose `TASKS.md` is a task board). Before you start, `git fetch`; rebase on the latest `main` before you push; never force-push; say in the commit message when you touch a file another session wrote.
