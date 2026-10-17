# story-outline

Turns a plain **indented outline** into pages and choices, or into a whole branching story for [story-format](../story-format/README.md). Write page names at the left edge, put each page's choices under it as `Choice words → Page name`, and any other indented line becomes a paragraph. No syntax to learn beyond that. Zero dependencies; Node 18+ or browsers.

It is the reader behind **File → Paste an outline…** in the Story Editor, cut out so other tools, chat helpers and scripts can start a story from a list.

```
Start
  The ferry leaves you on the rock. Fog is coming in.
  Walk to the lighthouse → Lighthouse door
  Wait for the next ferry → Cold night
Lighthouse door
  Go in → Hall
Cold night (bad ending)
Hall (good ending)
```

## Install

Copy `dist/story-outline.mjs` (ES module) or `dist/story-outline.global.js` (`<script>`, defines `StoryOutline`), or the smaller `dist/story-outline.min.mjs` / `dist/story-outline.min.global.js`, or:

```js
import { outlineToProject } from 'https://cdn.jsdelivr.net/gh/lfcfoundry/story-editor@main/packages/story-outline/dist/story-outline.mjs';
```

The package carries its own copy of the small piece of story-format it needs (`normalizeProject` and the `make…` builders).

## Quick start

<!-- include: examples/quickstart.mjs -->
```js
import { parseOutline, outlineToProject } from '../dist/story-outline.mjs';

// Page names at the left edge. Indented lines with an arrow are choices; other indented lines are paragraphs.
// "(ending)", "(good ending)" or "(bad ending)" after a page name makes it an ending.
const outline = `Start
  The ferry leaves you on the rock. Fog is coming in.
  Walk to the lighthouse → Lighthouse door
  Wait for the next ferry → Cold night
Lighthouse door
  The door is open a hand's width.
  Go in → Hall
Cold night (bad ending)
  The ferry never comes.
Hall (good ending)
  A lamp burns at the top of the stairs.`;

// Just read it: pages, choices and a list of anything that could not be used.
const parsed = parseOutline(outline);
console.log(parsed.pages.map(p => `${p.name}: ${p.choices.length} choices`), parsed.issues);

// Or make a whole story at once. The first page becomes the start page.
const { project, issues } = outlineToProject(outline, 'The Rock');
console.log(project.title, project.passages.length, 'pages, start is', project.passages.find(p => p.id === project.start).name, issues);
```
<!-- /include -->

## The outline

- A line at the left edge is a **page**. End it with `(ending)`, `(good ending)` or `(bad ending)` to make it an ending.
- An indented line with an arrow (`→`, `->` or `=>`) is a **choice**: the words before the arrow, then the page it leads to. A choice with nothing after the arrow leads nowhere yet.
- Any other indented line is a **paragraph** of that page.
- Bullets and numbers in front of a line (`- `, `* `, `1. `) are ignored; tabs count as four spaces; blank lines and lines starting with `#` are skipped.
- A page named only in a choice is added **empty**, so nothing points at nothing. The ending marker belongs to page lines only: in a choice, `Cold night (bad ending)` is the page's whole name.
- Endings have no choices; any written under one are left out and reported.

## API

| Call | What it does |
|---|---|
| `parseOutline(text)` | Reads the text. Returns `{ pages, issues, lines }`; each page is `{ name, ending, valence, texts, choices: [{ label, to }] }` with `to` a page name. Never throws; `issues` lists anything that could not be used, in plain words. Reads at most 3,000 lines. |
| `outlinePlan(parsed, project)` | Turns what was read into real pages for `project` (names made unique, choices pointed at page ids, endings given no choices). Returns `{ pages, empties, blank, issues }` and changes nothing in `project`. |
| `outlineToProject(text, title)` | Both steps on a new story. Returns `{ project, issues }`; the first page is the start page and the project has been through `normalizeProject`. `project` is `null` if the outline holds no pages. |
| `makeProject`, `makePassage`, `makeChoice`, `makeBlock`, `makeItem`, `normalizeProject`, `cleanGame`, `kindOf` | The story-format builders and cleaner. |

Types: [index.d.ts](index.d.ts).

## How it differs from what exists

Twine's Twee 3 and Ink are also plain text, but each has its own syntax for links and logic to learn, as I understand them. An outline has none: it is how people already list a branching plot. It makes pages and choices only. Items, numbers, dice and conditions are added afterwards in the editor or in the data.

## Limits

- Names are matched ignoring upper and lower case.
- Page names over 80 letters are shortened and reported.
- American English messages.

## Tests

`npm test`: arrows, bullets, tabs, endings, repeated names, empty and huge input; `outlineToProject` makes stories that `normalizeProject` leaves unchanged and that the checker can read.

## For AI agents

See [AGENTS.md](AGENTS.md).

## Changelog

[CHANGELOG.md](CHANGELOG.md): what changed in each version, in plain words.

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
