# twine-import: notes for AI agents

Turning a Twine story into a story-format project:

1. `importTwine(text)` takes the whole file as text (Twine 2 HTML, a library archive, Twee 3, or Twine 1 HTML). For an archive, pick with `{ story: n }` (0-based) after `twineRead(text).stories`.
2. Always show the person `report` (plain words). It lists what became rules, what stayed as flagged text and what was dropped.
3. Run `../story-check`'s `analyze(project)` on the result and fix every problem before handing the story to a human. Pages flagged `todo` hold code that could not be turned into rules.
4. Never fill in `project.author`. If the Twine file names none, leave it empty and tell the person to fill it in. The story belongs to its author.
5. Do not run or evaluate any code from the Twine file. The package only reads it as text.

Do not edit `src/generated.js` or `dist/` (generated from `../../editor/core.js` and `../../editor/twine.js`). Change the editor sources and rebuild with `npm run build`.
