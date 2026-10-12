# story-format: notes for AI agents

Writing a story as JSON for this model:

1. Give every page a short unique `id` (letters, digits, `_`, `-`) and every item too. Use readable ids ("shore", "key"); `normalizeProject` keeps valid ones.
2. Every non-ending page needs at least one choice, and every choice needs a `to` that is a real page id. A page with `"ending": true` shows no choices. The first page is `start`; it cannot be an ending.
3. Conditions are item ids in `needs`/`forbid` (on choices and on paragraphs). A number test is the string `t:<statId>:<n>` ("n or more").
4. A dice check is `check: { stat, target, fail }` on a choice: two dice plus the number must reach `target`; otherwise the player goes to `fail`. Always give `fail` a page that lets the story continue.
5. Run `normalizeProject(json)` and then `../story-check`'s `analyze` and fix every problem before you hand the story to a human.
6. Prose goes in `blocks[].text`. Keep paragraphs short; a block with `orPrev: true` is an "otherwise" for the block above it.

Tips: for a quick draft, use the plain-text format with `parseLegacy` (see README). To read a story, `storyManuscript(project)` gives Markdown. To change wording everywhere, `storyReplace`.

Do not edit `src/generated.js` or `dist/` (generated from `../../editor/core.js`). If the model must change, change `editor/core.js`, update `story.schema.json` (a test fails if they drift apart), rebuild with `npm run build`.
