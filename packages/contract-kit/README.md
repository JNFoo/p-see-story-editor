# contract-kit

A **guide**, with a small helper (about 100 lines, no dependencies), for a problem many projects have without naming it: **two pieces of code that must always agree**, such as a fast analyzer and the slow real thing, an editor's rules and the exported game's rules, a parser and a printer, or a rewrite and the original.

It is the pattern behind the Story Editor's build-stopping contract test ([`editor/contract.mjs`](../../editor/contract.mjs)), written down without the story parts. Node 18+ (the helper uses `node:child_process` and `node:util`); the guide applies to any language.

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
```

| Call | What it does |
|---|---|
| `seeded(seed)` | A small repeatable random generator: `{ rnd(), int(lo, hi), pick(list) }`. The same seed always gives the same numbers. |
| `agree({ generate, a, b, view, same, runs, seed })` | Makes `runs` random inputs with `generate(random)`, gives each implementation its own copy, and compares the answers. A throw counts as a difference. Stops at the first difference and returns `{ ok: false, runs, failure: { n, seed, input, a, b } }`; otherwise `{ ok: true, runs, failure: null }`. `view(result, input)` picks the part of each answer that must match; `same(x, y)` decides equality (default: deep equal). |
| `watchReads(obj, root, children)` | Wraps an object so every field read is noted as `kind.field` in a `Set`. `children` says what is inside (`{ 'project.passages': 'passage' }`). Give the wrapped object to your analyzer, run it on many inputs, keep the `Set`. |
| `checkFieldTable({ table, samples, reads })` | Returns plain-words problems: a field in your data that is not in the table, and a `rules` field nothing ever read. Empty list means all is well. |
| `guarded(file, args, seconds)` | Runs `node file args` and stops it after `seconds`. Returns `{ ok, timedOut, status }`. |

Types: [index.d.ts](index.d.ts).

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

## How to use it in your project

- Write the slow, obvious version first, even if it is only used in tests. Keep it in the test folder.
- Write the **input generator** so that every feature appears often. A generator that rarely makes the interesting case is the usual weakness; count how often each feature appears in a run and print it.
- Compare the **answers that matter**, not every internal detail (`view`). If the fast version groups or skips situations, compare what a person would see: which things are reachable, which endings exist, which choices are usable.
- Keep the seed in the failure message. A failure you cannot replay is a rumor.
- Run it on every build, with a time limit, and with a smaller count while iterating (the Story Editor runs 200 in `npm test` and 400 in the build).
- When you find a bug the test missed, **add a deliberate-bug check**: break the code on purpose and confirm the test fails. A test that cannot fail is not testing.

## How it differs from what exists

This is **differential testing** with **property-style random inputs**. Libraries such as fast-check (JavaScript), Hypothesis (Python) and QuickCheck (Haskell) are far more complete for the random part, as I understand them: they shrink a failing input to its smallest form, which this helper does not. What this adds is the **guide to the whole arrangement**: the slow reference implementation, the field table that forces the analyzer to learn about new features, and the time limit. You can use `agree` with fast-check's generators if you prefer; the helper does not mind where the inputs come from.

## Limits

- No shrinking: the failing input is reported as generated. Make your generator small by default so failures are readable.
- `guarded` can stop a check that never finishes, but cannot say where it was stuck.
- `watchReads` notes reads through ordinary property access. Code that copies an object first (`{ ...obj }`, `JSON.stringify`) is seen reading every field, so give the wrapped object to the analyzer directly.
- American English messages.

## Tests

`npm test`: the same seed gives the same numbers; `agree` finds a planted bug and the seed replays it; a throw counts as a difference; one side changing its input cannot change what the other sees; `watchReads` and `checkFieldTable` find an unread field and an unlisted field; `guarded` stops an endless loop.

**Browsers:** none. These tests run in Node (22.22.0 for the latest release run). The helper does not touch a browser.

## For AI agents

See [AGENTS.md](AGENTS.md).

## Changelog

[CHANGELOG.md](CHANGELOG.md): what changed in each version, in plain words.

---
Part of [story-editor](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
