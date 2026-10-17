/* A fixed set of checks that gives the same answer in Node and in a browser. `run()` returns plain data; test/contract.test.mjs holds the expected answer,
   and a browser run (the core bundled into one script) must return the same thing. Copyright (c) 2026 LFC Foundry. MIT License. */
import { seeded, agree, agreeAsync, deepEqual, watchReads, checkFieldTable, checkKept } from '../src/core.mjs';

export async function run() {
  const r = seeded(1);
  const numbers = [r.int(1, 6), r.int(1, 6), r.int(0, 99), r.pick(['x', 'y', 'z'])];
  const generate = rnd => ({ items: Array.from({ length: rnd.int(5, 30) }, () => ({ id: rnd.int(0, 9), price: rnd.int(1, 500), off: rnd.pick([0, 0.1, 0.5]) })) });
  const slow = ({ items }) => items.reduce((s, i) => s + i.price * (1 - i.off), 0);
  const fast = ({ items }) => items.reduce((s, i) => s + (i.id === 7 ? i.price : i.price * (1 - i.off)), 0);
  const bug = agree({ generate, a: fast, b: slow, runs: 200, seed: 1, shrink: true });
  const good = agree({ generate, a: slow, b: slow, runs: 100, seed: 2, tags: i => (i.items.length > 20 ? ['long'] : ['short']) });
  const late = await agreeAsync({ generate, a: async i => slow(i), b: async i => slow(i) + (i.items.length === 7 ? 1 : 0), runs: 100, seed: 3 });
  const page = { id: 'a' }; page.next = page;
  const w = watchReads({ passages: [page] }, 'project', { 'project.passages': 'passage', 'passage.next': 'passage' });
  const same = w.proxy.passages[0] === w.proxy.passages[0].next;
  const table = { loan: { rules: ['start', 'end'], display: ['note'] } };
  return {
    numbers,
    bug: { ok: bug.ok, n: bug.failure.n, smallest: bug.failure.smallest.input, tries: bug.failure.smallest.tries },
    good: { ok: good.ok, runs: good.runs, tags: good.tags },
    late: { ok: late.ok, n: late.failure && late.failure.n },
    identity: same,
    reads: [...w.reads].sort(),
    equal: [deepEqual(new Map([[1, [1, { a: NaN }]]]), new Map([[1, [1, { a: NaN }]]])), deepEqual(0, -0), deepEqual(new Set([{ a: 1 }]), new Set([{ a: 2 }])), deepEqual(Promise.resolve(), Promise.resolve())],
    table: checkFieldTable({ table, samples: { loan: [{ start: 1, end: 2, tint: 'red' }] }, reads: new Set(['loan.start']) }),
    kept: checkKept({ table, pairs: { loan: [[{ start: 1, end: 5 }, { start: 1 }]] } })
  };
}
