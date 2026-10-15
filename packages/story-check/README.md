# story-check

An exact checker for **branching stories that have things in them**: items you carry, conditions you are in, numbers that go up and down, and dice checks. It answers the questions an author really has:

- Is there a **dead end** or a choice that goes **nowhere**?
- Can any player ever reach this page or this ending? (Not "is there a link", but "is there a *way*", given the key you must pick up first and the number that must be high enough.)
- For a page nobody can reach, *why*? What is the closest anyone gets?

Zero dependencies. One file. Runs in Node 18+ and in browsers. It is the checker inside a single-file story editor, taken out so you can use it alone, and it is tested to give **exactly the editor's answers** (see Tests).

## Install

Nothing to install. Copy one file from this folder: `dist/story-check.mjs` (ES module) or `dist/story-check.global.js` (a plain `<script>`, defines `StoryCheck`). Or load it straight from GitHub:

```js
import { analyze } from 'https://cdn.jsdelivr.net/gh/JNFoo/p-see-story-editor@main/packages/story-check/dist/story-check.mjs';
```

## Quick start

<!-- include: examples/quickstart.mjs -->
```js
import { makeProject, makePassage, makeChoice, makeItem, normalizeProject, analyze } from '../dist/story-check.mjs';

// A tiny story with a key: the vault can only be opened by a player who picked up the key.
const story = makeProject('The Vault');
const hall = story.passages[0];
hall.name = 'Hall';
hall.blocks[0].text = 'A dusty hall. A brass key lies on the floor.';

const key = makeItem('Brass key', 'object');
story.items.push(key);

const vault = makePassage('Vault');
vault.ending = true;
vault.valence = 'good';
vault.blocks[0].text = 'The door swings open. Gold!';

const attic = makePassage('Attic'); // nothing leads here
attic.ending = true;

const pocket = makeChoice('Pick up the key', hall.id);
pocket.gives = [key.id]; // choices can hand out items
const open = makeChoice('Open the vault', vault.id);
open.needs = [key.id]; // ...and require them
const leave = makeChoice('Walk away', ''); // a choice that goes nowhere yet

hall.choices.push(pocket, open, leave);
story.passages.push(vault, attic);

const result = analyze(normalizeProject(story));
console.log('problems:', result.problems.map(p => p.msg));
console.log('warnings:', result.warnings.map(p => p.msg));
console.log('endings :', result.endings);
console.log('can the vault ever be reached?', result.why(vault.id).reachable);
console.log('can the attic?                 ', result.why(attic.id).reachable);
```
<!-- /include -->

Run it: `node examples/quickstart.mjs`. It reports the choice that leads nowhere and the attic nobody can reach, and confirms the vault *is* reachable (after the key).

Stories are plain JSON objects. Build them with the helpers above, load a file saved by the Story Editor, or write JSON by hand; always pass them through `normalizeProject` first, which repairs and validates anything. The shape is documented in [story-format](../story-format/README.md) (with a JSON Schema).

## API

| Call | Gives you |
|---|---|
| `analyze(project, limit = 200000, opt?)` | `{ problems, warnings, notes, endings, states, truncated, pruned, why(pid), ... }`. `problems` break the story, `warnings` are probably mistakes, `notes` are observations. Each is `{ pid, msg }` with messages written for authors. `endings[]` says for each ending whether it is `reachable` (true, false, or `null` when the check was cut short), how many `situations` reach it, and one shortest `path`. |
| `result.why(pageId)` | `{ reachable, isStart, incoming[] }`: for each choice that points at the page, whether anyone can take it, and what is missing (an item, a number, a roll that can never win or never fail). |
| `analyzeStructure(project)` | The shape of the story as a map: a plain-English `label` ("a branching story that comes back together"), forks, merges, depth, `bottlenecks` (pages every route to an ending must pass), `hubs`, a `spine`. Ignores items and numbers, so it is cheap enough to run on every keystroke. |
| `klChoose`, `klArrive`, `klShown`, `klVisibleBlocks`, `klTarget`, `klOdds`, ... | The game's own rules, so you can play a story yourself or build your own tools. The same functions every exported game carries. |
| `normalizeProject`, `makeProject`, `makePassage`, `makeChoice`, `makeItem`, `makeBlock` | Create and clean stories. |

Types: [index.d.ts](index.d.ts).

## How it works (and what "exact" means)

A story is explored as a graph of **situations**: a page plus everything the player holds and every number's value. The checker visits every situation a player could really be in, following only choices the player can see and pick, and with each dice check going both ways. So "unreachable" means *no combination of choices and rolls gets there*, not "no arrow points there". Numbers with a wide range are grouped into equivalent values, and numbers that no later page can read are forgotten ("pruning"), which gives the same verdicts in far fewer situations (`result.pruned` says it happened).

If a story has more situations than `limit`, `result.truncated` is `true` and verdicts that need the unexplored part are reported as *unknown* (`reachable: null`), never as a confident wrong answer.

## How it differs from what exists

Link checkers (Twine's broken-link markers and similar tools) see arrows. Story engines (Ink, ChoiceScript, Yarn Spinner and others) run a story but do not, as far as I know, ship an exhaustive "can this ending ever happen?" analysis over items, numbers and dice. This is an exhaustive search over the story's own rules, in plain JavaScript, with explanations written for authors. It does not read the story formats of those other tools; convert to the JSON shape in `story-format` first (`story-format` can read Twine files). This is a comparison of approach, not a benchmark against those tools.

## Limits

- It checks what the model can express: pages, choices, items, states, numbers with limits, dice checks, start-of-story questions. It knows nothing about free-text scripting, because the model has none.
- Very large combinations (many independent items and wide numbers) hit `limit`; raise it, or read `truncated`.
- Messages are in American English only.

## Tests

`npm test` in this folder (Node 18+, no installs). Besides unit tests, one test runs the package and the Story Editor's own sources side by side on 150 random stories that use every feature, and requires **identical** results; the editor's build also checks the checker against brute-force play (`editor/contract.mjs`).

## For AI agents

See [AGENTS.md](AGENTS.md).

---
Part of [p-see-story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
