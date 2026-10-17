# story-player

Turns a story into **one offline HTML file** that plays in any browser, and plays stories **from code** or in a **terminal**.

- `buildGame(project)` → a string of HTML. Save it as `game.html`; send it to anyone. No server, no internet, no tracking.
- `buildZippedGame(project)` → the same page that unzips itself when opened, about a quarter smaller.
- `createSession(project)` → play a story from code (for bots, tests, tools, AI helpers) with *exactly* the rules the game uses.
- `story-player build|play` → a command line for both.

The page is made of the story data, the rules, a small player and its stylesheet. A game carries **only the features its story uses**: no dice code if there are no dice checks, no Back button code if the author did not turn it on. It makes no network requests and says so in a Content-Security-Policy tag. Zero dependencies; Node 18+ or any modern browser.

## Install

Copy `dist/story-player.mjs` (ES module) or `dist/story-player.global.js` (`<script>`, defines `StoryPlayer`), or:

```js
import { buildGame } from 'https://cdn.jsdelivr.net/gh/lfcfoundry/story-editor@main/packages/story-player/dist/story-player.mjs';
```

## Quick start

<!-- include: examples/quickstart.mjs -->
```js
import { writeFileSync } from 'node:fs';
import { makeProject, makePassage, makeChoice, makeItem, buildGame, buildZippedGame, createSession } from '../dist/story-player.mjs';

// A story with a dice check: roll two dice, add Courage, reach 9 to beat the dragon.
const story = makeProject('The Dragon');
const [cave] = story.passages;
cave.name = 'Cave mouth';
cave.blocks[0].text = 'Heat rolls out of the cave. Something huge shifts in the dark.';
const courage = makeItem('Courage', 'stat');
courage.lo = 0;
courage.hi = 6;
courage.start = 3;
story.items.push(courage);
const won = makePassage('Victory');
const lost = makePassage('Singed');
won.ending = true;
won.valence = 'good';
won.blocks[0].text = 'The dragon bows its head. The valley is safe.';
lost.ending = true;
lost.valence = 'bad';
lost.blocks[0].text = 'You flee with scorched eyebrows.';
const fight = makeChoice('Face the dragon', won.id);
fight.check = { stat: courage.id, target: 9, fail: lost.id };
cave.choices.push(fight);
story.passages.push(won, lost);

// 1. One offline HTML file. Open it in any browser; it never contacts the internet.
writeFileSync(new URL('dragon.html', import.meta.url), buildGame(story));

// 2. The same game, zipped so it unzips itself when opened (smaller on disk).
const zipped = await buildZippedGame(story);
writeFileSync(new URL('dragon.zipped.html', import.meta.url), zipped);

// 3. Play it from code with the game's own rules (a fixed "random" makes the run repeatable).
const play = createSession(story, { rng: () => 0.5 });
console.log(play.text, play.choices); // odds is the chance of passing the check, in percent
console.log(play.choose(0)); // { roll, passed }
console.log('ended on:', play.page.name, play.ended);
```
<!-- /include -->

The result: [`examples/dragon.html`](examples/dragon.html) (about 20 KB, with a dice check, a number, and the Aa text-size button).

Command line (from a story file saved by the Story Editor, or any JSON that follows [story-format's schema](../story-format/story.schema.json)):

```
node bin/story-player.mjs build story.json game.html --zip     # write the game (--zip: smaller)
node bin/story-player.mjs play  story.json --seed 7           # play in the terminal; type a number, q to quit
```

## API

| Call | What it does |
|---|---|
| `buildGame(project, { fonts?, fontsLite? })` | Cleans the project (`normalizeProject`), returns the page as a string. `fonts` is CSS text of `@font-face` rules with `data:` URLs if you want the game to carry a font; without it the game uses the device's own font. |
| `buildZippedGame(project, opts)` | `async`; the zipped page. Falls back to the plain page where `CompressionStream` is missing. |
| `createSession(project, { rng, givens, from })` | A playable session. `s.text`, `s.choices` (`{ index, label, locked, why, odds }`), `s.choose(i)` (returns `{ roll, passed }` for a dice check), `s.ended`, `s.page`, `s.inventory`, `s.trail`. `rng` is a function returning 0 to 1 (pass a seeded one for repeatable runs). `givens` answers start-of-story questions (default: the first answer). Throws a clear message for a locked choice, a choice that goes nowhere, or a finished story. |
| `buildGameHtml(project, assets)` | The lower-level builder `buildGame` wraps, if you want your own `assets` (`{ parts, fonts, fontsLite, features }`). `GAME_PARTS` is the data every game is made from. |
| the `kl*` rules, `normalizeProject`, `make*` | As in [story-check](../story-check/README.md) and [story-format](../story-format/README.md). |

Reader options the author can set on the story (`project.game`): `back` (off | remember | reroll | block, for the Back button and dice rolls), `tracker` ("endings found"), `comfort` (the Aa button for text size, spacing, contrast and calm motion), `odds` (show the chance on dice checks), `place` (a copyable code that returns a reader to their spot), `pal` (paper, night, sepia, ocean, forest, contrast).

Types: [index.d.ts](index.d.ts).

## How it differs from what exists

Twine and Ink can publish playable pages too, usually with a runtime of tens or hundreds of kilobytes. This builder's pages are small because they carry only what the story uses (measured on the editor's own build: a 25-page game with a number and a dice check is about 48 KB plain with an embedded font and 22 KB gzipped; the example in this folder, without a font, is about 20 KB). The session API is the other difference: the **same rule functions** run in the browser game, the checker and your code, so a bot cannot disagree with the game. This is a comparison of design, not a benchmark against those tools.

## Limits

- Stories use the model in `story-format`; there is no scripting language. Items, states, numbers, dice checks, conditions on text and choices, start-of-story questions.
- Fonts are not bundled in this package (the editor's build embeds a subset of Inter Tight under the SIL Open Font License; see `editor/fonts/`). Pass `fonts` yourself or use the device font.
- Games save the player's place in `localStorage` (with a backup copy); players who block storage can still play but lose progress on reload.
- The game page needs JavaScript. The zipped page also needs `DecompressionStream` or falls back to a built-in inflater (a few milliseconds more).
- `createSession` is a text-level player: it does not run the browser game's animations or features such as Back or the Place code.

## Tests

`npm test` (Node 18+, no installs): every starter builds to a self-contained page with no network references; story text cannot close the script tag early; features are included only when used; **the page is byte-identical to the editor's own for the same story**; zipped pages round-trip; sessions obey items, numbers and locks; and across 200 random stories, random play **never reaches an ending the checker calls unreachable** (3,000 plays). The editor's browser suites (`editor/qa`) play exported games in Firefox and Chromium.

**Browsers:** none. These tests run in Node (22.22.0 for the latest release run, earlier releases not recorded); the code is cut from the editor, whose browser runs are listed in [docs/CHANGELOG.md](../../docs/CHANGELOG.md).

## For AI agents

See [AGENTS.md](AGENTS.md).

## Changelog

[CHANGELOG.md](CHANGELOG.md): what changed in each version, in plain words.

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
