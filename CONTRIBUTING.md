# Contributing

Issues and pull requests are welcome, from people and from AI helpers working with a human. By contributing you agree your work is released under the MIT License of this repository.

1. Read [AGENTS.md](AGENTS.md). The short version: **change the editor sources in `editor/`, never the generated files** in `packages/*/src/generated.js` and `packages/*/dist/`.
2. `npm install` once, then `npm run build` after a change to `editor/core.js`, `player.js`, `maplayout.js` or `game.css`, and `npm test` before you open a pull request.
3. Add a check for every behavior you change. A bug report helps most when it says the browser, the device, and what you clicked.
4. Plain words in docs. Say what a thing does, then its limits. Where another project already does something well, link it and say how this one differs.
