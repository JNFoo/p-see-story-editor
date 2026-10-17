# story-diff

Says **in plain words what one edit did to a story**, for a story in [story-format](../story-format/README.md): `Add page “The Cellar”`, `Rename page “Start” to “The shore”`, `Delete a choice on “Hall”`, `Change the start page`. Made for Undo buttons ("Undo: Delete page “The Cellar”"), history lists, autosave logs, and AI helpers that need to explain what they just changed. Zero dependencies; Node 18+ or browsers. About 4 KB minified.

It is the one-line label the Story Editor shows on its Undo and Redo buttons, cut out so other tools can use it.

## Install

Copy `dist/story-diff.mjs` (ES module) or `dist/story-diff.global.js` (`<script>`, defines `StoryDiff`), or the smaller `dist/story-diff.min.mjs` / `dist/story-diff.min.global.js`, or:

```js
import { describeChange } from 'https://cdn.jsdelivr.net/gh/lfcfoundry/story-editor@main/packages/story-diff/dist/story-diff.mjs';
```

## Quick start

<!-- include: examples/quickstart.mjs -->
```js
import { describeChange } from '../dist/story-diff.mjs';

// Two copies of a story, as objects or as JSON text. Only the parts that matter to a story are compared.
const before = {
  id: 'lantern',
  passages: [{ id: 'shore', name: 'The shore', blocks: [{ text: 'A lantern glows.' }], choices: [] }]
};
const after = JSON.parse(JSON.stringify(before));
after.passages.push({ id: 'rocks', name: 'The rocks', blocks: [], choices: [] });

console.log(describeChange(before, after)); // { text: 'Add page “The rocks”', pid: 'rocks' }
console.log(describeChange(after, before)); // { text: 'Delete page “The rocks”', pid: 'rocks' }

// A page that changed: the label says what kind of change, and pid says where.
const edited = JSON.parse(JSON.stringify(before));
edited.passages[0].choices.push({ label: 'Wade out', to: '' });
console.log(describeChange(before, edited)); // { text: 'Add a choice on “The shore”', pid: 'shore' }

// Text that is not a story never throws.
console.log(describeChange('not json', '{}')); // { text: 'Edit the story', pid: '' }
```
<!-- /include -->

## API

| Call | What it does |
|---|---|
| `describeChange(before, after)` | `before` and `after` are two copies of a story, as JSON text or as objects. Returns `{ text, pid }`: `text` is the label, `pid` is the id of the page most worth showing (the one added, deleted or changed), or `''` when no single page is involved. |

Types: [index.d.ts](index.d.ts).

## What it says, and what it does not

- It gives **one label per edit**: the first kind of change it finds, in this order: pages added or deleted, pages moved, items, Given questions, start page, title, author, game options, translations, then what changed inside one page (renamed, choice or paragraph added or deleted, ending setting, color or note, what it gives or takes, a choice edited). Several pages changed at once give "Change 3 pages".
- It is **not a full diff**. Two different edits made between the two copies give one label. For undo steps, which are one edit each, that is what you want; for a long history, compare each step with the one before.
- It never throws. Text that is not a story, or two different stories, give "Edit the story" or "Open another story".
- Page names longer than 30 letters are shortened with "…". American English.

## How it differs from what exists

General JSON diff libraries (for example jsondiffpatch) give a structural list of changed paths and values, as I understand them. This gives a sentence a writer can read, but only for this story model. It does not produce patches and cannot apply or undo anything; keep your own copies for that.

## Tests

`npm test`: every kind of label above, copies given as text and as objects, and unreadable input.

**Browsers:** none. These tests run in Node (22.22.0 for the latest release run, earlier releases not recorded); the code is cut from the editor, whose browser runs are listed in [docs/CHANGELOG.md](../../docs/CHANGELOG.md).

## For AI agents

See [AGENTS.md](AGENTS.md).

## Changelog

[CHANGELOG.md](CHANGELOG.md): what changed in each version, in plain words.

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
