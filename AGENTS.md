# Notes for AI assistants (and the people working with them)

This repository holds a single-file offline story editor (`editor/`) and small packages cut from its sources (`packages/`). It is meant to be read, copied from and extended by people and AI helpers together.

## Using a package in someone else's project
1. Open `packages/index.json` (or `llms.txt`), pick the package, read its `README.md` (the "Limits" section matters) and `AGENTS.md`.
2. Copy `dist/<name>.mjs` (ES module) or `dist/<name>.global.js` (a `<script>`) into the project. No install step, no dependencies. Or import from `https://cdn.jsdelivr.net/gh/lfcfoundry/story-editor@main/packages/<name>/dist/<name>.mjs`.
3. Run the package's `examples/quickstart.mjs` to see it work (`node examples/quickstart.mjs`).

## Changing this repository
- **One source of truth.** The logic lives in `editor/core.js` (model, rules, checker, export), `editor/player.js` (the game), `editor/maplayout.js` (map layout and simulated players) and `editor/game.css`. `packages/*/src/generated.js` and `packages/*/dist/*` are **generated** by `npm run build` (`tools/extract-packages.mjs`, using `tools/slice.mjs`). Never edit them by hand; `npm test` fails if they are out of date.
- Hand-written package files: `src/index.js`, `src/session.js`, `src/build.js`, `src/draw.js`, `bin/*`, `index.d.ts`, `story.schema.json`, READMEs, examples, tests. To make a new function public, add its name to the package's `roots` in `tools/extract-packages.mjs`.
- README code samples are copied from `examples/*.mjs` by `npm run build` (`tools/docs.mjs`); edit the example, not the README block.
- Every behavior you change gets a check. Package tests compare against the editor's own sources (`packages/qa-kit/src/editor-vm.mjs`), so equivalence is tested, not assumed.
- Plain words in docs. Say what a thing does, then its limits. Name the closest existing projects and say honestly how this differs; do not claim a benchmark you did not run.
- Keep the header `Copyright (c) 2026 LFC Foundry. MIT License` in new source files. Every HTML file the software makes (the editor, exported games, any new single-file app) starts with the LFC Foundry header comment in `editor/foundry-header.txt` (application or game name filled in); the only visible credit is the footer "Forged by LFC Foundry • MIT Licensed" inside the app itself. Commits are still authored by JNFoo. Do not add code you cannot license under MIT, personal data, or other people's stories or text. Tests use the bundled sample story and generated stories only.
- Never change a story's author. Imports (Twine and others) keep the author the file names, word for word; if none is named the field stays empty. Never put JNFoo, Claude or any other name there on someone's behalf. Do not add other people's stories as test files; write original fixtures.
- Every package keeps a plain-words `CHANGELOG.md`, newest first. Each entry says what is new, or how much better something got, with numbers (size, speed) that were measured; say "about" or "estimated" for anything that was not. No jargon.
- **Test browsers.** Test only with the browsers on the `browsers` branch of the owner's private knowledge base (Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6 as of 2026-10-17), one at a time, never two together. Re-read that branch's README before each test run, because versions can change and browsers can be added or removed. Write down the exact versions you used.
- **Every release lists its browsers.** Each changelog entry (this repository's `docs/CHANGELOG.md` rows and each package `CHANGELOG.md`) ends with "Tested in: ..." naming the browsers with versions that tested that build, or "not recorded" if you do not know. Package READMEs say the same under "Tests". Never guess a version, and never rerun old tests just to fill one in.
- American English in anything a user sees.

## Run the tests
```
npm install
npm test                          # no browser needed
cd editor/qa && FIREFOX_PATH=/path/to/firefox node qa.js quick     # browser suites; see editor/qa/README.md
```

## Working with other sessions
Several AI sessions and people may work on these repositories (see also [JS-modules](https://github.com/lfcfoundry/JS-modules), whose `TASKS.md` is a task board). Before you start, `git fetch`; rebase on the latest `main` before you push; never force-push; say in the commit message when you touch a file another session wrote.

## House-rule hooks

Run `sh tools/hooks/install.sh` once per clone. The hooks reject a `Claude-Session:` line, a claude.ai link and any author or committer other than JNFoo, so the rules in this file are checked by a machine (see `tools/hooks/README.md`).
