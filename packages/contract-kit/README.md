# contract-kit

A **guide**, with a small helper (under 300 lines, no dependencies), for a problem many projects have without naming it: **two pieces of code that must always agree**, such as a fast analyzer and the slow real thing, an editor's rules and the exported game's rules, a parser and a printer, or a rewrite and the original.

It is the pattern behind the Story Editor's build-stopping contract test ([`editor/contract.mjs`](../../editor/contract.mjs)), written down without the story parts. Node 18+. The core (`contract-kit/core`: everything except `guarded`) imports nothing from Node and also runs in browsers, Deno and Bun; the guide applies to any language.

## The idea in plain words

1. **Make a second, simple implementation on purpose.** The fast or clever one (the checker) is the one you ship. The second one is slow and obvious: it just plays the game out, move by move, using the real rules. It never has to be fast, so it can be so simple that you trust it.
2. **Feed both the same random inputs and compare the answers.** Hundreds of random stories, each using every feature, every time you build. Random inputs find the cases you would never think to write.
3. **Stop the build when they differ.** Not a warning: a failure. Say which input, and give the seed so anyone can replay it.
4. **Keep a table of every field and what it does** (`rules`: can change the outcome; `display`: only looks). Then check three things automatically: every field that exists is in the table, the analyzer **reads** every `rules` field, and the exporter **keeps** every one. A new feature cannot be added without the analyzer being taught about it, because the build says so.
5. **Put a time limit on the whole thing.** A rule that never lets the play-out finish should fail with a message, not hang the build. Run the test in a child process that is stopped after a number of seconds.
6. **Check the checker with an independent reading.** If both implementations share a helper, they can share a bug. The Story Editor added a third check: what a player sees on each page is compared with a plain-words restatement of the rules. A deliberate bug in the shared code passed the old test and fails the new one.

What it cost in the Story Editor [read from `contract.mjs`'s header]: a normal run takes about 2 seconds for 200 to 400 stories, and the limit is 90 seconds.

## The helper

```js
import { agree, seeded, watchReads, checkFieldTable, guarded } from 'contract-kit'; // or ./src/contract.mjs
import { agree, shrink } from 'contract-kit/core';                                  // no Node-only parts: browsers, Deno, Bun
```

| Call | What it does |
|---|---|
| `seeded(seed)` | A small repeatable random generator: `{ rnd(), int(lo, hi), pick(list) }`. The same seed always gives the same numbers. |
| `agree({ generate, a, b, view, same, runs, seed, ... })` | Makes `runs` random inputs with `generate(random)`, gives each implementation its own copy, and compares the answers. A throw counts as a difference (any kind of throw, even an empty message or a plain string), and so does an answer that is a promise. Stops at the first difference and returns `{ ok: false, runs, failure: { n, seed, input, a, b } }`; otherwise `{ ok: true, runs, failure: null }`. `view(result, input)` picks the part of each answer that must match; `same(x, y)` decides equality (default: `deepEqual`). More options below. |
| `agree` option `shrink: true` | Also cuts the failing input down to the smallest one that still fails in the same way, and adds it as `failure.smallest = { input, a, b, tries }`. Give a function instead of `true` to list smaller versions of a value yourself. |
| `agree` option `tags` and `expect` | `tags(input)` names the features an input has (`['has item 7']`); the result counts them in `tags`. `expect: ['has item 7']` fails the run if a tag never appeared, so a generator cannot quietly miss a feature. |
| `agree` options `seconds`, `clone`, `errors` | `seconds`: stop early when the time is up (`stopped: true`). `clone: false`: skip the copy of each input for pure functions (200 runs of the Story Editor's checker on both sides, stories of about 3 KB: 126 ms down to 72 ms, about 1.7 times faster; with trivial functions the copying is nearly all the time, 32 ms down to 0.2 ms); or give your own copier. `errors: 'compare'`: two throws with the same message count as agreeing. |
| `agreeAsync(options)` | The same, for functions that return promises. Returns a promise. |
| `shrink(input, fails, { candidates, limit })` | The cutting-down step on its own: takes the first smaller version that still fails and starts again from it, up to `limit` (500) tries. `candidates(value)` lists smaller versions (default: arrays lose chunks then single items, strings lose halves, numbers move toward 0). `shrinkAsync` is the async twin. |
| `deepEqual(a, b)` | The default comparison: numbers by `Object.is` (NaN equals NaN, `0` differs from `-0`), arrays, objects, Map, Set, Date, RegExp, Error, typed arrays, cycles. Two promises are never equal. Checked against `node:util`'s `isDeepStrictEqual` on 25,000 random nested values (the package tests use `agree` for that). |
| `watchReads(obj, root, children)` | Wraps an object so every field read is noted as `kind.field` in a `Set`. `children` says what is inside (`{ 'project.passages': 'passage' }`). `field in obj` and `hasOwnProperty` count as reads, and the same inner object always comes back as the same stand-in, so `===`, `Set` and `Map` work. Give the wrapped object to your analyzer, run it on many inputs, keep the `Set`. |
| `checkFieldTable({ table, samples, reads })` | Returns plain-words problems: a field in your data that is not in the table, a field listed under both `rules` and `display`, and a `rules` field nothing ever read. Empty list means all is well. |
| `checkKept({ table, pairs })` | Returns plain-words problems for a `rules` field that an exporter or copier dropped or changed: `pairs` is `{ kind: [[before, after], ...] }`. |
| `guarded(file, args, seconds)` | Runs `node file args` and stops it after `seconds` (killed outright, so a script that ignores polite stop requests cannot hang the build). Returns `{ ok, timedOut, status, signal }`. Node only. |

Types: [index.d.ts](index.d.ts) and [core.d.ts](core.d.ts).

## Quick start

<!-- include: examples/quickstart.mjs -->
```js
import { agree, watchReads, checkFieldTable } from '../src/contract.mjs';

// 1. Two implementations of one rule: how many days are in the loan? A fast one (arithmetic) and a plain one (count them).
const fast = ({ start, end }) => ({ days: end - start + 1 });
const plain = ({ start, end }) => {
  let days = 0;
  for (let d = start; d <= end; d++) days++;
  return { days };
};
const generate = r => {
  const start = r.int(0, 50);
  return { start, end: start + r.int(0, 30) };
};
console.log(agree({ generate, a: fast, b: plain, runs: 200, seed: 1 })); // { ok: true, runs: 200, failure: null }

// A bug in the fast one is found, with the run number and the seed to replay it.
const buggy = ({ start, end }) => ({ days: end - start });
const r = agree({ generate, a: buggy, b: plain, runs: 200, seed: 1 });
console.log(r.ok, r.failure.n, r.failure.input, r.failure.a.value, r.failure.b.value);

// 2. A table of fields: "rules" change the outcome, "display" only change the looks.
const table = { loan: { rules: ['start', 'end'], display: ['note'] } };

// An analyzer that ignores `end` is caught: nothing ever read it.
const lazy = loan => ({ days: loan.start });
const { proxy, reads } = watchReads({ start: 1, end: 5, note: 'hi' }, 'loan');
lazy(proxy);
console.log(checkFieldTable({ table, samples: { loan: [{ start: 1, end: 5, note: 'hi' }] }, reads }));

// A new field nobody classified is caught too.
console.log(checkFieldTable({ table, samples: { loan: [{ start: 1, end: 5, color: 'red' }] }, reads: new Set(['loan.start', 'loan.end']) }));
```
<!-- /include -->

Cutting a failing input down, counting features, and the async version:

<!-- include: examples/shrink.mjs -->
```js
import { agree, agreeAsync } from '../src/contract.mjs';

// A fast price calculator with a bug: it forgets the discount on the item with id 7.
const slow = ({ items }) => items.reduce((sum, i) => sum + i.price * (1 - i.discount), 0);
const fast = ({ items }) => items.reduce((sum, i) => sum + (i.id === 7 ? i.price : i.price * (1 - i.discount)), 0);
const generate = r => ({ items: Array.from({ length: r.int(5, 30) }, () => ({ id: r.int(0, 9), price: r.int(1, 500), discount: r.pick([0, 0.1, 0.5]) })) });

// shrink: true cuts the failing input down to the smallest one that still fails.
const r = agree({ generate, a: fast, b: slow, runs: 200, seed: 1, shrink: true });
console.log(r.ok, 'failed on run', r.failure.n, 'with', r.failure.input.items.length, 'items');
console.log('smallest:', JSON.stringify(r.failure.smallest.input), `(${r.failure.smallest.tries} tries)`);

// tags + expect: say which features the random inputs must contain, so the generator cannot quietly miss them.
const counted = agree({ generate, a: slow, b: slow, runs: 200, tags: i => (i.items.some(x => x.id === 7) ? ['has item 7'] : []), expect: ['has item 7'] });
console.log(counted.ok, counted.tags);

// agreeAsync: the same for functions that return promises (agree itself refuses them).
console.log((await agreeAsync({ generate, a: async i => slow(i), b: async i => slow(i), runs: 50 })).ok);
```
<!-- /include -->

## How to use it in your project

- Write the slow, obvious version first, even if it is only used in tests. Keep it in the test folder.
- Write the **input generator** so that every feature appears often. A generator that rarely makes the interesting case is the usual weakness; count how often each feature appears in a run and print it.
- Compare the **answers that matter**, not every internal detail (`view`). If the fast version groups or skips situations, compare what a person would see: which things are reachable, which endings exist, which choices are usable.
- Keep the seed in the failure message. A failure you cannot replay is a rumor.
- Turn on `shrink: true` while you debug: a failing story of 9 pages and 10 choices became 1 page and 3 choices in 126 tries (27 ms more), which is the version a person can read.
- Use `tags` and `expect` for the features your generator must produce; a run that never made one fails instead of passing quietly.
- Run it on every build, with a time limit, and with a smaller count while iterating (the Story Editor runs 200 in `npm test` and 400 in the build).
- When you find a bug the test missed, **add a deliberate-bug check**: break the code on purpose and confirm the test fails. A test that cannot fail is not testing.

## How it differs from what exists

This is **differential testing** with **property-style random inputs**. Libraries such as fast-check (JavaScript), Hypothesis (Python) and QuickCheck (Haskell) are far more complete for the random part, as I understand them: they come with many ready-made generators and shrink along the structure of what was generated. This helper's shrinking is a simpler, greedy cut (in the spirit of the delta-debugging method of Zeller and Hildebrandt) that works on any plain data without knowing how it was made; it can stop at a larger input than a generator-aware shrinker would. For scale, fast-check 4.10.2 is 1.5 MB unpacked on npm (measured with `npm view`); this helper is about 16 KB of source. What this adds is the **guide to the whole arrangement**: the slow reference implementation, the field table that forces the analyzer to learn about new features, and the time limit. You can use `agree` with fast-check's generators if you prefer; the helper does not mind where the inputs come from.

## Limits

- Shrinking is a greedy cut of plain data. It keeps the original failure's kind (a wrong answer stays a wrong answer; it will not settle for "both sides now throw"), but it does not know your data's rules, so a smaller input may be one your program would never see. Give `shrink` your own candidate list when that matters.
- `seeded` is a small 31-bit generator, the same one the Story Editor's contract test uses. It is for repeatable test inputs, not for anything that needs good randomness.
- `deepEqual` compares plain data; class instances are compared by their own fields and prototype, and `structuredClone` (the default copier) turns them into plain objects, so give `clone` a custom copier for those.
- `guarded` can stop a check that never finishes, but cannot say where it was stuck.
- `watchReads` notes reads through property access, `in` and `hasOwnProperty`. Code that copies an object first (`{ ...obj }`, `Object.keys`, `JSON.stringify`) is seen reading every field, so give the wrapped object to the analyzer directly. A frozen object is swapped for an editable copy.
- American English messages.

## Tests

`npm test` (20 tests, about 3 seconds): the same seed gives the same numbers and `rnd()` stays below 1; `agree` finds a planted bug and the seed replays it; every kind of throw counts; a promise is a difference and `agreeAsync` compares what promises say; one side changing its input cannot change what the other sees; `shrink` cuts a failing story-sized input to the smallest one that fails in the same way; `deepEqual` agrees with `node:util` on random nested data; `watchReads` keeps one stand-in per inner object, works on frozen data and notes `in` and `hasOwnProperty`; `checkFieldTable` and `checkKept` find unread, unlisted, doubled and lost fields; `guarded` stops an endless loop, even one that ignores polite stop requests; `core.mjs` has no Node imports.

**Browsers:** the Node tests run on Node 22.22.0. The core (`src/core.mjs`, bundled into one script) was also run on a fixed set of checks and gave the same answer as Node in Firefox 158.0, ungoogled Chromium 155.0.8059.39-1 and WebKitGTK 2.52.6, one at a time. GNOME Web 46.5 was not run. `guarded` is Node only.

## For AI agents

See [AGENTS.md](AGENTS.md).

## Changelog

[CHANGELOG.md](CHANGELOG.md): what changed in each version, in plain words.

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
