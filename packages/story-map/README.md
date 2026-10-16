# story-map

Pictures and numbers for the **shape of a branching story**.

- **Layouts**: a layered (Sugiyama-style) drawing left-to-right or top-down, with choke points held on one line ("spine"), plus arc, matrix and "story shape" views.
- **Choke points and traffic**: pages every route to the goal must pass, and how much of the traffic runs through each page.
- **Simulated players**: thousands of seeded random players using the game's own rules, so you see where players really go, which endings they reach, and where they get stuck.
- **Drawing metrics**: crossings, neighbor preservation, reading direction, compactness, stability between edits, group separation, speed.
- **`layoutStory` and `toSvg`**: story in, SVG picture out, in a few lines.

Zero dependencies; pure functions (no DOM); Node 18+ or browsers.

## Install

Copy `dist/story-map.mjs` or `dist/story-map.global.js` (`StoryMap`), or:

```js
import { layoutStory, toSvg } from 'https://cdn.jsdelivr.net/gh/lfcfoundry/story-editor@main/packages/story-map/dist/story-map.mjs';
```

## Quick start

<!-- include: examples/quickstart.mjs -->
```js
import { writeFileSync } from 'node:fs';
import { makeProject, makePassage, makeChoice, normalizeProject, layoutStory, toSvg, playtest, mapMetrics } from '../dist/story-map.mjs';

// A small branching story: a fork that merges again, then two endings.
const story = makeProject('Fork');
const [a] = story.passages;
a.name = 'Opening';
const left = makePassage('Left road');
const right = makePassage('Right road');
const gate = makePassage('The gate');
const win = makePassage('Home');
const lose = makePassage('Lost');
win.ending = true;
win.valence = 'good';
lose.ending = true;
lose.valence = 'bad';
a.choices.push(makeChoice('Go left', left.id), makeChoice('Go right', right.id));
left.choices.push(makeChoice('On', gate.id));
right.choices.push(makeChoice('On', gate.id));
gate.choices.push(makeChoice('Knock', win.id), makeChoice('Run', lose.id));
story.passages.push(left, right, gate, win, lose);
const project = normalizeProject(story);

// 1. A picture
const layout = layoutStory(project, { view: 'flow' }); // or 'down' | 'spine'
writeFileSync(new URL('fork.svg', import.meta.url), toSvg(layout, project));

// 2. How would 1,000 random players do? (seeded: same numbers every time)
const sim = playtest(project, { runs: 1000, mode: 'random' });
console.log('how runs ended:', sim.outcome);

// 3. How good is the drawing? Scores run from 0 to 1.
console.log('drawing quality:', mapMetrics(layout, 0, {}, null, false).scores);
```
<!-- /include -->

What `layoutStory(project, { view: 'flow' })` and `{ view: 'down' }` look like (examples/map-flow.svg and examples/map-down.svg, made from one of the starter stories):

![flow view](examples/map-flow.svg)

![top-down view](examples/map-down.svg)

## API

| Call | What it does |
|---|---|
| `layoutStory(project, { view, as, fold, open, merge })` | One call: builds the graph, sizes the boxes, lays them out. `view`: `'flow'` (left to right), `'down'`, or `'spine'`. Returns `{ nodes: [{ id, pages, x, y, w, h, layer }], edges: [{ from, to, kind, pts }], width, height, ... }`. `as` fixes the answers to start-of-story questions; `fold` merges straight runs of pages into one box. |
| `toSvg(layout, project)` | A self-contained SVG string for those three views (boxes colored by good/bad ending, the first page outlined, dashed arrows for choices that need something). |
| `mapGraph`, `layered`, `arcLayout`, `matrixLayout`, `shapeLayout` | The lower-level pieces, if you want to draw (or interact) yourself. Set `n.w`/`n.h` on every node of `mapGraph`'s result before calling `layered`. `layered` takes `prev` (the last drawing's `order`) so a redraw after an edit keeps the picture stable. |
| `mapImportance(project, ids, links)` | `{ choke, traffic, spine, depth, goal }`. |
| `playtest(project, { runs = 2000, mode, as })` | Seeded simulated players. `mode`: `'random'`, `'first'` (always the first choice listed: the author's main line), `'curious'` (prefers somewhere new). Returns visits per page, moves per arrow, `outcome` (`good`, `bad`, `neutral`, `stuck`) and every run, so `playtestFilter` can follow one page or arrow. |
| `mapMetrics(layout, ms, groups, prevPos, quick)` | Scores 0 to 1 for `neighbors`, `flow`, `compact`, `speed` (and `groups`, `stability` when given), plus raw `crossings`. `mapTaskScore(scores, 'edit' \| 'beats' \| 'vars')` weighs them for a task. |

Types: [index.d.ts](index.d.ts).

## How it differs from what exists

General graph-layout libraries (dagre, ELK, d3-dag and others) already draw layered graphs well; use them if you only need boxes and arrows. This package is not a replacement for them. What it adds is **story-specific**: it folds straight runs, finds the choke points of a story, keeps drawings stable between edits, can hold choke points on one line, simulates players with the actual game rules, and scores the result against the tasks authors have (editing structure, studying beats, following a variable). Crossing reduction uses barycenter sweeps and adjacent swaps with an O(E log V) crossing counter (a Fenwick tree); placement solves each layer exactly under order constraints (pool-adjacent-violators). I have not benchmarked it against those libraries.

## Limits

- `toSvg` draws flow, down and spine only. The other views return data; draw them yourself (the editor's Map tab does).
- Stories are the `story-format` model. Arrows for dice-check failures are drawn like other choices.
- Very large stories (thousands of pages) were not a design target.

## Tests

`npm test`: every starter draws to a well-formed SVG; names are escaped; and on 60 random stories the graph, the layered, arc, matrix and shape layouts and the simulated players are **identical to the editor's own**.

## For AI agents

See [AGENTS.md](AGENTS.md).

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
