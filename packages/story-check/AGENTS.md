# story-check: notes for AI agents

Use this to verify a story you (or a human) wrote, before saying it is finished.

1. Get a story as JSON (read a file, or build one with `makeProject`/`makePassage`/`makeChoice`/`makeItem`; see `../story-format/story.schema.json`).
2. `const p = normalizeProject(raw)`. It throws `This file is not a story backup.` if there is no `passages` array; otherwise it repairs everything (and drops references to ids that do not exist, so check the ids you wrote).
3. `const r = analyze(p)`. Treat every entry of `r.problems` as a bug to fix, read `r.warnings`, and look at `r.endings`: an ending with `reachable: false` can never happen.
4. For each page you expected to be reachable but is not, `r.why(pageId).incoming` says which choice is blocked and by what.
5. If `r.truncated` is true, say so: the answer is incomplete. Do not report the story as verified.

Rules of the model you must not get wrong:
- A **choice** can `needs`/`forbid` item ids; a `needs` of `t:<statId>:<n>` means "that number is n or more".
- A page marked `ending: true` shows no choices; the start page cannot be an ending.
- A dice check is `choice.check = { stat, target, fail }`: two dice plus the stat must reach `target`, else the player goes to page `fail`. Give every check a `fail` page that moves the story on.
- Items are given or taken by pages (`gives`, `takes`) and choices (`gives`, `takes`).

Do not edit `src/generated.js` or `dist/`: they are generated from `../../editor/core.js` by `npm run build` at the repository root. Change the editor source, rebuild, run `npm test`.
