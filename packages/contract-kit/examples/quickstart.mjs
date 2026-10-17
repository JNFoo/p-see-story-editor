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
