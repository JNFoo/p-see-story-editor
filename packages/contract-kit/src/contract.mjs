/* contract-kit: keep two implementations of one rule set from drifting apart.
   Pattern from the Story Editor's build-stopping contract test (editor/contract.mjs), with the story parts taken out.
     seeded(seed)             a small repeatable random generator { rnd, int, pick }
     agree(opts)              run two implementations on many random inputs and report the first one where they differ
     watchReads(obj, ...)     a stand-in for an object that records which fields are read, to prove a function looks at every field that matters
     checkFieldTable(...)     every field is classified, every "rules" field is read, nothing classified is missing
     guarded(file, args, s)   run a check script in a child process that is stopped after s seconds, so a rule that loops forever fails with a message
   Copyright (c) 2026 LFC Foundry. MIT License. */
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

/** A small seeded random generator. The same seed always gives the same numbers, so a failure can be replayed. */
export function seeded(seed = 1) {
  let s = seed | 0;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return { rnd, int: (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)), pick: a => a[Math.floor(rnd() * a.length)] };
}

/**
 * Runs `a` and `b` (the two implementations) on `runs` random inputs from `generate(random)` and compares what they say.
 * `view(result, input)` picks the part of each answer that must match (default: the whole answer); `same` decides equality (default: deep equal).
 * An implementation that throws counts as a difference. Stops at the first difference, because the first one is the one to understand.
 * Returns { ok, runs, failure } where failure = { n, seed, input, a, b } says which run, the seed to replay it, and both answers.
 */
export function agree({ generate, a, b, view = r => r, same = isDeepStrictEqual, runs = 300, seed = 1 }) {
  const random = seeded(seed);
  for (let n = 1; n <= runs; n++) {
    const input = generate(random);
    const got = [a, b].map(f => {
      try {
        return { value: view(f(structuredClone(input)), input) };
      } catch (e) {
        return { error: e.message };
      }
    });
    if (got[0].error || got[1].error || !same(got[0].value, got[1].value)) {
      return { ok: false, runs: n, failure: { n, seed, input, a: got[0], b: got[1] } };
    }
  }
  return { ok: true, runs, failure: null };
}

/**
 * Wraps `obj` (an object of kind `root`) so that every field read is noted as "<kind>.<field>" in the Set `reads`.
 * `children` says what the objects inside are: { 'project.passages': 'passage' } means the list or object found in a project's
 * `passages` field holds objects of kind passage. A field not named there is noted but not followed. Positions in lists are not noted.
 * Returns { proxy, reads }. Give the proxy to the function under test; it behaves like the original.
 */
export function watchReads(obj, root, children = {}, reads = new Set()) {
  const watch = (o, kind) =>
    new Proxy(o, {
      get(target, key, receiver) {
        const v = Reflect.get(target, key, receiver);
        if (typeof key === 'symbol') return v;
        if (Array.isArray(target)) return v && typeof v === 'object' ? watch(v, kind) : v;
        reads.add(`${kind}.${key}`);
        const child = children[`${kind}.${key}`];
        return child && v && typeof v === 'object' ? watch(v, child) : v;
      }
    });
  return { proxy: watch(obj, root), reads };
}

/**
 * Checks a table of fields against what really happens.
 *   table      { kind: { rules: [fields that change the outcome], display: [fields that only change looks] } }
 *   samples    { kind: [objects of that kind that exist in your data] }: every field found must be in the table
 *   reads      the Set that watchReads filled while your analyzer ran over many inputs: every "rules" field must be in it
 * Returns a list of plain-words problems (empty when everything agrees). A new field nobody classified is a problem on purpose:
 * it forces the person adding it to decide whether the analyzer must learn about it.
 */
export function checkFieldTable({ table, samples = {}, reads = new Set() }) {
  const problems = [];
  Object.entries(samples).forEach(([kind, list]) => {
    const t = table[kind];
    if (!t) return problems.push(`Objects of kind “${kind}” are not in the table.`);
    const known = new Set([...t.rules, ...t.display]);
    const unlisted = new Set();
    list.forEach(o => Object.keys(o || {}).forEach(k => !known.has(k) && unlisted.add(k)));
    unlisted.forEach(k => problems.push(`The field “${kind}.${k}” is not in the table. List it under “rules” if it can change the outcome, otherwise under “display”.`));
  });
  Object.entries(table).forEach(([kind, t]) =>
    t.rules.forEach(k => {
      if (!reads.has(`${kind}.${k}`)) problems.push(`Nothing ever read “${kind}.${k}”, which the table says can change the outcome. Teach the analyzer about it, or move it to “display”.`);
    })
  );
  return problems;
}

/**
 * Runs `node file ...args` in a child process and stops it after `seconds`. Returns { ok, timedOut, status }.
 * Use it around a check that explores every situation: a rule that never lets the play-out finish then fails with a message instead of hanging.
 */
export function guarded(file, args = [], seconds = 90) {
  const r = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit', timeout: seconds * 1000 });
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  return { ok: !timedOut && r.status === 0, timedOut, status: r.status };
}
