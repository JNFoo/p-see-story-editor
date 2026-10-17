# story-format

The **data model and file format** for branching interactive stories (choose-your-own-adventure, gamebooks, quests), as plain JSON, with the functions to create, clean, import, export, search and measure them. Zero dependencies; Node 18+ or browsers.

A story is pages with choices. On top of that, it can have **things the player carries** (a key), **conditions** (sick, brave), **numbers** (Courage 0 to 10), **dice checks** (two dice plus Courage must reach 9), text and choices that appear only under a condition, and **questions asked before page one** ("Who are you?") that change the whole story. That is the whole model: small enough to hold in your head, rich enough for real games, and fully checkable by [story-check](../story-check/README.md).

It is the model inside a single-file story editor, cut out so that **people and AI helpers can read and write stories as JSON** and use the same tools the editor uses.

## Install

Copy `dist/story-format.mjs` (ES module) or `dist/story-format.global.js` (`<script>`, defines `StoryFormat`), or the smaller `dist/story-format.min.mjs` / `dist/story-format.min.global.js` (the same code with the names shortened: about 40% smaller, about 20% smaller gzipped), or:

```js
import { normalizeProject } from 'https://cdn.jsdelivr.net/gh/lfcfoundry/story-editor@main/packages/story-format/dist/story-format.mjs';
```

## The shape of a story

[`story.schema.json`](story.schema.json) is a JSON Schema (draft 2020-12) of the file. In short:

```jsonc
{
  "title": "The Lantern",
  "start": "shore",
  "items":   [{ "id": "key", "name": "Brass key", "kind": "object" },          // or "state", or "stat" (with lo, hi, start)
              { "id": "grit", "name": "Grit", "kind": "stat", "lo": 0, "hi": 6, "start": 2 }],
  "givens":  [],                                                               // questions asked before page one
  "passages": [{
      "id": "shore", "name": "The shore",
      "blocks":  [{ "text": "A lantern glows on the far rocks." },
                  { "text": "The lock is cold in your hand.", "needs": ["key"] }],   // shown only with the key
      "gives": ["key"],                                                        // picked up on arrival
      "choices": [{ "label": "Wade out", "to": "rocks",
                    "check": { "stat": "grit", "target": 8, "fail": "washed" } }]       // 2 dice + Grit must reach 8
  }, { "id": "rocks", "ending": true, "valence": "good", "blocks": [{ "text": "You reach it." }] },
     { "id": "washed", "ending": true, "valence": "bad", "blocks": [{ "text": "The tide wins." }] }]
}
```

Only `passages` is required. `normalizeProject` fills in everything else and removes anything that cannot work. Conditions (`needs`, `forbid`) name item ids; a number test is written `t:<statId>:<n>` and means "the number is n or more".

## Quick start

<!-- include: examples/quickstart.mjs -->
```js
import { writeFileSync } from 'node:fs';
import { makeProject, makeChoice, makePassage, normalizeProject, storyFind, storyReplace, storyStats, storyManuscript, storyOrder, exportStory } from '../dist/story-format.mjs';

// Build a story in code ...
const story = makeProject('The Lantern');
const [shore] = story.passages;
shore.name = 'The shore';
shore.blocks[0].text = 'A lantern glows on the far rocks. The tide is coming in.';
const rocks = makePassage('The rocks');
rocks.ending = true;
rocks.valence = 'good';
rocks.blocks[0].text = 'You reach the lantern as the first wave breaks behind you.';
shore.choices.push(makeChoice('Wade out to the lantern', rocks.id));
story.passages.push(rocks);

// ... clean anything (hand-written, AI-written, old, damaged) into a safe project ...
const project = normalizeProject(story);

// ... and work with it.
console.log(storyStats(project)); // { pages, items, givens, choices, words, good, bad }
console.log(storyFind(project, 'lantern')); // every place the word occurs
storyReplace(project, 'lantern', 'lighthouse'); // replace all, in place
console.log(storyOrder(project).map(o => '  '.repeat(o.depth) + o.id)); // pages in reading order
console.log(storyManuscript(project)); // the whole story as plain text (Markdown)

// The compact form a game ships with: no editor-only fields, ids shortened by buildGameHtml
writeFileSync(new URL('lantern.story.json', import.meta.url), JSON.stringify(project, null, 2));
console.log(JSON.stringify(exportStory(project)).length, 'bytes of game data');
```
<!-- /include -->

## A plain-text way to write stories

For writing by hand (or by an AI in a chat window), `parseLegacy(text)` reads a very small text format and returns `{ project, notes }`:

```
title: The Cellar
[[start]]
# The cellar
It is dark.
(if lamp) A warm light fills the room.
-> Take the lamp => hall | gives: lamp
-> Go up => hall | unless: lamp

[[hall]]
The end of the road.
```

`[[name]]` starts a page; plain lines are paragraphs; `(if item)` / `(unless item)` at the start of a line make a paragraph conditional; `-> words => page | needs: item | unless: item | gives: item` is a choice; a page with no choices is an ending; `# Heading` sets a heading; `//` starts a comment. `notes` lists anything that had to be changed (a choice to a page that does not exist, an item given on a choice, which becomes a small page after it). The format is intentionally less capable than the JSON (no numbers or dice); use it to draft, then edit.

## API

| Call | What it does |
|---|---|
| `makeProject`, `makePassage`, `makeChoice`, `makeBlock`, `makeItem(name, kind)` | New, valid pieces with every field present. |
| `normalizeProject(raw)` | Repairs and validates any input: wrong types become empty, bad or duplicate ids get fresh ones, references to things that do not exist are dropped, the start page is made valid. Throws `This file is not a story backup.` if there is no `passages` list. Running it twice changes nothing. |
| `parseLegacy(text)` | The plain-text format above. |
| `exportStory(project)` | The compact data a game needs (no editor-only fields: page names, unfinished flags). |
| `storyFind(project, text, { matchCase, whole })`, `storyReplace(project, text, replacement, opts, only?)` | Search and replace across names, headings, paragraphs, choice labels and reasons; `only` replaces one match. |
| `storyOrder`, `storyManuscript`, `storyStats` | Reading order, the story as Markdown, counts. |
| *(Twine import)* | Moved to its own package, [twine-import](../twine-import/README.md), on 2026-10-17 (story-format 2.0.0). It returns a project this package reads. |
| `STARTERS` | Six small starter stories (time cave, branch and bottleneck, sorting hat, hub and spokes, gauntlet, quest with dice) that show common shapes. Each has `make()`. |
| `GAME_OPTIONS`, `GAME_DEFAULTS`, `PALETTES`, `BACK_MODES`, `FIELD_CONTRACT` | The reader options table, color sets, and the contract of which fields change play. |

Types: [index.d.ts](index.d.ts).

## How it differs from what exists

Twine's Twee and Twison, Ink's JSON, Yarn and ChoiceScript are formats for their own tools and, mostly, for their own scripting languages. This format has **no scripting**: every rule is data (conditions, gives and takes, number changes, dice checks), which is what lets [story-check](../story-check/README.md) explore every possibility exactly and lets AI helpers write stories without writing programs. It ships a JSON Schema and a sanitizer that accepts old, hand-edited and hostile files safely. It does read Twine files (see `importTwine`); the other formats are not read.

### At a glance

A longer comparison, including the editors people use for each format, is in [docs/FORMAT-COMPARISON.md](../../docs/FORMAT-COMPARISON.md).

A summary of each format's public design, written from its documentation as I understand it; not a benchmark, and the other tools do many things this one does not.

| | This format | Twine 2 (HTML / Twee) | Ink | Yarn Spinner | ChoiceScript |
|---|---|---|---|---|---|
| File | JSON | HTML page with the story inside, or plain-text Twee | Text (`.ink`), compiled to JSON | Text (`.yarn`) | Plain-text scene files |
| Scripting | None: every rule is data (items, numbers, conditions, dice checks) | Whatever the chosen story format offers (Harlowe, SugarCube and others are languages) | Its own logic plus calls to the game | Variables, commands, functions | Its own small language |
| Checks "can this ending ever happen?" over items, numbers and dice | Yes, exhaustively (`story-check`) | Shows links; no rule analysis | Not as far as I know | Not as far as I know | Has test tools that play through by trying choices and random runs |
| Checked file shape | JSON Schema and a sanitizer for old or damaged files | HTML/Twee specifications | Compiler errors | Compiler errors | Interpreter errors |
| Made for | People and AI helpers writing stories as data | Writers who may use code | Games with a code engine | Games with a code engine | Text-choice games |
| Reads Twine files | Yes (the [twine-import](../twine-import/README.md) package) | Is the source | No | No | No |
| Writes a stand-alone game | Yes, one offline HTML file | Yes (publish) | Through a game engine or web player | Through a game engine | Yes |

## Limits

- No scripting, loops, text variables inside sentences, or inventory with quantities (objects are held or not; numbers are bounded integers).
- American English messages in the helper functions.
- The format name in files is `story-editor`, from the editor it came from.

## Tests

`npm test`: the schema accepts every starter and 150 random stories and rejects broken ones; the schema stays in step with the code (palettes, options); `normalizeProject` survives hostile input; and `normalizeProject`, `exportStory`, short ids, fingerprint, manuscript and stats equal the editor's own results on 100 random stories.

## For AI agents

See [AGENTS.md](AGENTS.md).

## Changelog

[CHANGELOG.md](CHANGELOG.md): what changed in each version, in plain words.

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
