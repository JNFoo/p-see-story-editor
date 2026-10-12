# story-player: notes for AI agents

- To **ship** a story: `buildGame(project)` and write the string to `something.html`. Check the story first with `../story-check` (`analyze(project).problems` must be empty).
- To **test** a story by playing it: `createSession(project, { rng })` with a seeded `rng`, loop `while (!s.ended)`: pick from `s.choices.filter(c => !c.locked)` and call `s.choose(c.index)`. Indexes count all shown choices, locked ones included.
- Never concatenate story text into HTML yourself; `buildGame` escapes it (`<` and the JSON line separators) so text can never close the script tag.
- Exported games are made from `GAME_PARTS` (generated). Do not edit `src/generated.js` or `dist/`; they come from `../../editor/core.js`, `player.js` and `game.css` via `npm run build` at the repository root.
- Fonts are optional; leave `fonts` out unless the human supplied a font file you are allowed to embed.
- The browser game's behavior is covered by `editor/qa` (needs Firefox or Chromium); the Node tests here cannot see rendering.
