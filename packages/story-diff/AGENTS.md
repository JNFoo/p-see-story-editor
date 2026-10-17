# story-diff: notes for AI agents

Use `describeChange(before, after)` to tell a person what you just changed in a story, in the same words the Story Editor uses.

1. Pass the story as it was and as it is now (objects or JSON text). Keep the `before` copy yourself; the package keeps nothing.
2. The result is one label for the first kind of change found. If you made several edits, call it once per edit, or say "Change N pages" yourself.
3. `pid` tells you which page to show or open next. It is `''` when no single page is involved.
4. Do not parse `text` to learn what happened; it is for people. Compare the data if you need facts.

Do not edit `src/generated.js` or `dist/` (generated from `../../editor/changes.js`). Change the editor source and rebuild with `npm run build`.
