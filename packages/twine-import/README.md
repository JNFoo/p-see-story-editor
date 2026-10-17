# twine-import

Reads a **Twine story** and turns it into a story for [story-format](../story-format/README.md): Twine 2 HTML (one story or a library archive), Twee 3 text, and Twine 1 HTML. Zero dependencies; Node 18+ or browsers.

Most converters keep only the links. This one also reads the story's **own code**: SugarCube (and Twine 1) and Harlowe variables, `if` / `else` tests and number changes become real **items, conditions and numbers** as far as the rules can say it. Whatever it cannot carry over stays as flagged text, and a **plain-words report** says exactly what became rules, what was kept as words, and what was left out. Nothing in the story is ever run.

It was part of story-format until 2026-10-17. It is its own package now so that people who only want the story data model do not pay for the importer (story-format got about 59% smaller when it left).

## Install

Copy `dist/twine-import.mjs` (ES module) or `dist/twine-import.global.js` (`<script>`, defines `TwineImport`), or the smaller `dist/twine-import.min.mjs` / `dist/twine-import.min.global.js`, or:

```js
import { importTwine } from 'https://cdn.jsdelivr.net/gh/lfcfoundry/story-editor@main/packages/twine-import/dist/twine-import.mjs';
```

The result is a story-format project. The package carries its own copy of the small piece of story-format it needs (`normalizeProject` and the `make…` builders), so you do not have to install both.

## Quick start

<!-- include: examples/quickstart.mjs -->
```js
import { importTwine, twineRead } from '../dist/twine-import.mjs';

// A tiny Twee 3 story, written inline so this example needs no file. Twine 2 HTML, library archives and Twine 1 HTML work the same way.
const twee = `:: StoryTitle
The Lantern Path

:: StoryData
{"ifid":"5B2A3C4D-1111-4222-8333-444455556666","format":"Harlowe","format-version":"3.3.9","start":"Shore"}

:: Shore
(set: $lamp to false)A lantern glows on the far rocks.
[[Pick up the lamp->Lamp]]
[[Wade out->Rocks]]

:: Lamp
(set: $lamp to true)You take the lamp.
[[Wade out->Rocks]]

:: Rocks
(if: $lamp)[The lamp lights your way. You made it.](else:)[You cannot see. The tide wins.]
`;

console.log(twineRead(twee).stories.map(s => s.name)); // which stories the file holds (archives hold several)

// Turn the first story into a story-format project. `code: 'rules'` (the default) turns the story's own code into items and conditions.
const { project, report, summary } = importTwine(twee, { code: 'rules' });
console.log(summary); // { pages, choices, items, unfinished, mode }
console.log(project.items.map(i => i.name)); // the flag the code set, as a real item
report.forEach(line => console.log('-', line)); // plain words: what became rules, what was kept as flagged text
```
<!-- /include -->

## On the command line

```
twine-to-story story.html                 writes story.story.json next to it, and prints what was and was not converted
twine-to-story story.twee -o out.json     choose the output file ("-" writes the JSON to the screen)
twine-to-story story.html --keep-code     keep the story's own code as flagged text instead of turning it into rules
twine-to-story archive.html --list        list the stories in a Twine library archive
twine-to-story archive.html --story 2     convert the second story of an archive
```

## API

| Call | What it does |
|---|---|
| `importTwine(text, { code, story })` | Reads and converts in one step. `code: 'rules'` (default) turns SugarCube, Twine 1 and Harlowe code into items and conditions; `'text'` keeps it as flagged words. `story` is a 0-based index into an archive. Returns `{ project, report, summary, kind, stories }`. Throws an `Error` in plain words if the text is not a Twine story. |
| `twineRead(text)` | Only reads: `{ kind, stories }`, each story with its passages, tags, script and stylesheet, before any conversion. |
| `twineConvert(story, { code })` | Converts one story from `twineRead`. |
| `makeProject`, `makePassage`, `makeChoice`, `makeBlock`, `makeItem`, `normalizeProject`, `cleanGame`, `kindOf` | The story-format builders and cleaner, so the result can be edited without another install. |

`project` has already been through `normalizeProject`; `project.author` is exactly what the Twine file names (empty if it names none). Types: [index.d.ts](index.d.ts).

## What it does with each kind of code

- **Links** (`[[a->b]]`, `[[b<-a]]`, `[[a|b]]`, `[[b]]`) become choices.
- **Yes/no flags and numbers** set with `<<set>>`, `(set:)` and Twine 1 macros become items; number changes become number changes on the page or choice.
- **`if` / `else` / `elseif`** in text and on links become conditions on paragraphs and choices. Conditions are simplified (`&&`, `||`, `!`) into the smallest set of rules that say the same thing.
- **Not carried over, and flagged:** values printed in text, arrays, objects, random numbers, loops, custom macros, and any other story format.

## Limits

- Best effort. The report says what was not converted; read it.
- Only SugarCube, Twine 1 and Harlowe code is translated.
- The author named in the Twine file is kept word for word, and the story text remains that author's work (see [NOTICE.md](../../NOTICE.md)). The package never supplies an author.
- American English messages.

## Tests

`npm test`: original, hand-written fixture files (Harlowe, SugarCube Twee, Twine 1, an archive) import to valid projects that the checker can read, the author is never invented, and non-Twine text is refused in plain words.

**Browsers:** none. These tests run in Node (22.22.0 for the latest release run, earlier releases not recorded); the code is cut from the editor, whose browser runs are listed in [docs/CHANGELOG.md](../../docs/CHANGELOG.md).

## For AI agents

See [AGENTS.md](AGENTS.md).

## Changelog

[CHANGELOG.md](CHANGELOG.md): what changed in each version, in plain words.

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
