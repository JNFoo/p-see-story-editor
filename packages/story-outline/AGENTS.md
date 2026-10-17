# story-outline: notes for AI agents

Starting a story from a list of pages:

1. Write one page name per line at the left edge. Put its choices under it, indented, as `Choice words → Page name`. Any other indented line is a paragraph.
2. Mark endings with `(ending)`, `(good ending)` or `(bad ending)` after the page name, on the page's own line, not inside a choice.
3. Call `outlineToProject(text, title)` and show the person `issues` in plain words. A choice whose page is not written yet creates an empty page; fill it in or make it an ending.
4. Run `../story-check`'s `analyze(project)` and fix every problem before handing the story to a human.
5. To add pages to a story that already exists, use `parseOutline` then `outlinePlan(parsed, project)` and add `plan.pages` and `plan.empties` to `project.passages` yourself. If `plan.blank` is set, remove that page and start the story at `plan.pages[0].id`.

Do not edit `src/generated.js` or `dist/` (generated from `../../editor/core.js` and `../../editor/helpers.js`). Change the editor sources and rebuild with `npm run build`.
