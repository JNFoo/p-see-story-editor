# story-map: notes for AI agents

- To show a human the structure of a story: `writeFileSync('map.svg', toSvg(layoutStory(project), project))`, then open the SVG (any browser). Use `view: 'down'` for tall stories on narrow screens.
- To find where a story is weak without a human: `playtest(project, { runs: 2000 })`. `outcome.stuck > 0` means some runs hit a dead end or wandered more than 400 moves; `visits` shows pages almost nobody sees. `mapImportance(...)` lists choke points: a page every route must pass.
- Pass projects through `normalizeProject` first.
- The simulated players are seeded: the same story and settings give the same numbers, so you can compare before and after an edit.
- Do not edit `src/generated.js` or `dist/` (generated from `../../editor/maplayout.js` and `core.js` by `npm run build`). `src/draw.js` (`layoutStory`, `toSvg`) is hand-written.
