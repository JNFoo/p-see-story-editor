/* contract-kit core: keep two implementations of one rule set from drifting apart. No Node-only imports, so it also runs in browsers, Deno and Bun.
   Pattern from the Story Editor's build-stopping contract test (editor/contract.mjs), with the story parts taken out.
     seeded(seed)              a small repeatable random generator { rnd, int, pick }
     agree(opts)               run two implementations on many random inputs and report the first one where they differ (agreeAsync for async ones)
     shrink(input, fails)      cut a failing input down to a smaller one that still fails
     watchReads(obj, ...)      a stand-in for an object that records which fields are read, to prove a function looks at every field that matters
     checkFieldTable(...)      every field is classified, every "rules" field is read, nothing classified is missing
     checkKept(...)            every "rules" field survives a trip through an exporter or a copier
     deepEqual(a, b)           the comparison agree uses by default
   Copyright (c) 2026 LFC Foundry. MIT License. */

/** A small seeded random generator. The same seed always gives the same numbers, so a failure can be replayed. rnd() is in [0, 1). */
export function seeded(seed = 1) {
  let s = seed | 0;
  const rnd = () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x80000000;
  };
  return { rnd, int: (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)), pick: a => a[Math.floor(rnd() * a.length)] };
}

const keysOf = o => Reflect.ownKeys(o).filter(k => Object.prototype.propertyIsEnumerable.call(o, k));

/** Deep equality for plain data: numbers by Object.is (NaN equals NaN, 0 differs from -0), arrays, objects, Map, Set, Date, RegExp, Error, typed arrays, cycles. Two promises are never equal. */
export function deepEqual(a, b, seen = new WeakMap()) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Promise || a instanceof WeakMap || a instanceof WeakSet) return false;
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (a instanceof Date) return Object.is(a.getTime(), b.getTime());
  if (a instanceof RegExp) return String(a) === String(b);
  if (a instanceof Error && (a.name !== b.name || a.message !== b.message)) return false;
  if (ArrayBuffer.isView(a)) {
    const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  if (a instanceof Map || a instanceof Set) {
    if (a.size !== b.size) return false;
    const left = [...b.entries()], taken = new Set();
    return [...a.entries()].every(([k, v]) => {
      const i = left.findIndex(([k2, v2], j) => !taken.has(j) && deepEqual(k, k2, seen) && deepEqual(v, v2, seen));
      return i >= 0 && !!taken.add(i);
    });
  }
  const ka = keysOf(a), kb = keysOf(b);
  if (ka.length !== kb.length || (Array.isArray(a) && a.length !== b.length)) return false;
  return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k], seen));
}

/** Candidates one step smaller than `v`, biggest cuts first: arrays lose chunks then single items, strings lose halves, numbers move toward 0, booleans toward false; objects keep their keys and shrink what is inside. */
export function* smaller(v) {
  if (typeof v === 'number') {
    if (v !== 0) yield 0;
    if (Number.isInteger(v) && Math.abs(v) > 1) yield Math.trunc(v / 2);
    if (Number.isInteger(v) && Math.abs(v) > 0) yield v - Math.sign(v);
  } else if (typeof v === 'string') {
    if (v) yield '';
    if (v.length > 1) { yield v.slice(0, v.length >> 1); yield v.slice(v.length >> 1); yield v.slice(0, -1); }
  } else if (v === true) yield false;
  else if (Array.isArray(v)) {
    for (let size = v.length >> 1 || 1; size >= 1 && v.length; size = size === 1 ? 0 : size >> 1)
      for (let at = 0; at + size <= v.length; at += size) yield [...v.slice(0, at), ...v.slice(at + size)];
    for (let i = 0; i < v.length; i++) for (const s of smaller(v[i])) yield Object.assign([...v], { [i]: s });
  } else if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    for (const k of Object.keys(v)) for (const s of smaller(v[k])) yield { ...v, [k]: s };
  }
}

/**
 * Cuts `input` down while `fails(candidate)` stays true. Greedy: takes the first smaller candidate that still fails and starts again from it.
 * `candidates(value)` lists smaller versions (default: `smaller`); `limit` caps how many candidates are tried. Returns { input, tries }.
 */
export function shrink(input, fails, { candidates = smaller, limit = 500 } = {}) {
  let best = input, tries = 0, again = true;
  while (again && tries < limit) {
    again = false;
    for (const c of candidates(best)) {
      if (++tries > limit) break;
      if (fails(c)) { best = c; again = true; break; }
    }
  }
  return { input: best, tries };
}

/** Async twin of `shrink`: `fails` may return a promise. */
export async function shrinkAsync(input, fails, { candidates = smaller, limit = 500 } = {}) {
  let best = input, tries = 0, again = true;
  while (again && tries < limit) {
    again = false;
    for (const c of candidates(best)) {
      if (++tries > limit) break;
      if (await fails(c)) { best = c; again = true; break; }
    }
  }
  return { input: best, tries };
}

const describe = e => (e instanceof Error ? e.message || e.name : String(e));
const thenable = v => !!v && typeof v.then === 'function';
const settle = (view, input, v) => ({ value: view(v, input) });
const failed = e => ({ threw: true, error: describe(e) });
const differs = (x, y, same, errors) => (x.threw || y.threw ? !(errors === 'compare' && x.threw && y.threw && x.error === y.error) : !same(x.value, y.value));
const shape = (x, y) => `${+!!x.threw}${+!!y.threw}`;

function prepare(o) {
  const { runs = 300, seed = 1, view = r => r, same = deepEqual, errors = 'differ', clone = x => structuredClone(x), tags, expect = [], seconds, shrink: wantShrink } = o;
  return { ...o, runs, seed, view, same, errors, clone: clone === false ? x => x : clone, tags, expect, seconds, wantShrink, random: seeded(seed), counts: {}, started: Date.now() };
}

function tally(p, input) {
  if (p.tags) for (const t of p.tags(input)) p.counts[t] = (p.counts[t] || 0) + 1;
}

function finish(p, n, stopped) {
  const missing = p.expect.filter(t => !p.counts[t]);
  const out = missing.length ? { ok: false, runs: n, failure: { missing } } : { ok: true, runs: n, failure: null };
  if (p.tags) out.tags = p.counts;
  if (stopped) out.stopped = true;
  return out;
}

function broke(p, n, input, x, y, smallest) {
  const out = { ok: false, runs: n, failure: { n, seed: p.seed, input, a: x, b: y } };
  if (smallest) out.failure.smallest = smallest;
  if (p.tags) out.tags = p.counts;
  return out;
}

const shrinkOpts = p => (typeof p.wantShrink === 'function' ? { candidates: p.wantShrink } : {});

/**
 * Runs `a` and `b` (the two implementations) on `runs` random inputs from `generate(random)` and compares what they say.
 * `view(result, input)` picks the part of each answer that must match (default: the whole answer); `same` decides equality (default: deepEqual).
 * An implementation that throws counts as a difference (with `errors: 'compare'`, two throws with the same message agree). A result that is a promise is
 * a difference too: use `agreeAsync`. Stops at the first difference, because the first one is the one to understand.
 * Each side gets its own `structuredClone` of the input (`clone: false` skips it for pure functions, or give your own copier).
 * `shrink: true` (or a function listing smaller inputs) also cuts the failing input down; `seconds` stops early when the time is up;
 * `tags(input)` names the features an input has so the result can count them, and `expect` lists tags that must appear at least once.
 * Returns { ok, runs, failure } where failure = { n, seed, input, a, b, smallest? } says which run, the seed to replay it, and both answers.
 */
export function agree(o) {
  const p = prepare(o);
  const side = (f, input) => {
    try {
      const v = f(p.clone(input));
      return thenable(v) ? failed(new Error('returned a promise: use agreeAsync')) : settle(p.view, input, v);
    } catch (e) {
      return failed(e);
    }
  };
  const test = input => { const x = side(p.a, input), y = side(p.b, input); return [x, y, differs(x, y, p.same, p.errors)]; };
  for (let n = 1; n <= p.runs; n++) {
    if (p.seconds && Date.now() - p.started >= p.seconds * 1000) return finish(p, n - 1, true);
    const input = p.generate(p.random);
    tally(p, input);
    const [x, y, bad] = test(input);
    if (bad) {
      let smallest;
      if (p.wantShrink) {
        const kind = shape(x, y);
        const { input: small, tries } = shrink(input, c => { const [cx, cy, cb] = test(c); return cb && shape(cx, cy) === kind; }, shrinkOpts(p));
        const [sx, sy] = test(small);
        smallest = { input: small, a: sx, b: sy, tries };
      }
      return broke(p, n, input, x, y, smallest);
    }
  }
  return finish(p, p.runs);
}

/** `agree` for implementations that return promises (or plain values). Returns a promise of the same result. */
export async function agreeAsync(o) {
  const p = prepare(o);
  const side = async (f, input) => {
    try {
      return settle(p.view, input, await f(p.clone(input)));
    } catch (e) {
      return failed(e);
    }
  };
  const test = async input => { const [x, y] = await Promise.all([side(p.a, input), side(p.b, input)]); return [x, y, differs(x, y, p.same, p.errors)]; };
  for (let n = 1; n <= p.runs; n++) {
    if (p.seconds && Date.now() - p.started >= p.seconds * 1000) return finish(p, n - 1, true);
    const input = p.generate(p.random);
    tally(p, input);
    const [x, y, bad] = await test(input);
    if (bad) {
      let smallest;
      if (p.wantShrink) {
        const kind = shape(x, y);
        const { input: small, tries } = await shrinkAsync(input, async c => { const [cx, cy, cb] = await test(c); return cb && shape(cx, cy) === kind; }, shrinkOpts(p));
        const [sx, sy] = await test(small);
        smallest = { input: small, a: sx, b: sy, tries };
      }
      return broke(p, n, input, x, y, smallest);
    }
  }
  return finish(p, p.runs);
}

/**
 * Wraps `obj` (an object of kind `root`) so that every field read is noted as "<kind>.<field>" in the Set `reads`.
 * `children` says what the objects inside are: { 'project.passages': 'passage' } means the list or object found in a project's
 * `passages` field holds objects of kind passage. A field not named there is noted but not followed. Positions in lists are not noted.
 * `field in obj` and hasOwnProperty count as reads. The same inner object always comes back as the same stand-in, so `===`, Set and Map work.
 * A frozen (read-only) object is swapped for an editable copy, because a stand-in cannot hand out other objects from a frozen one. Returns { proxy, reads }. Give the proxy to the function under test.
 */
export function watchReads(obj, root, children = {}, reads = new Set()) {
  const made = {};
  const handlers = {};
  const watch = (original, kind) => {
    const cache = made[kind] || (made[kind] = new WeakMap());
    let p = cache.get(original);
    if (p) return p;
    const o = Object.isFrozen(original) ? structuredClone(original) : original;
    p = new Proxy(o, handlers[kind] || (handlers[kind] = handlerFor(kind)));
    cache.set(original, p);
    return p;
  };
  const handlerFor = kind => {
    const note = (target, key) => typeof key === 'string' && !Array.isArray(target) && reads.add(`${kind}.${key}`);
    return {
      get(target, key, receiver) {
        const v = Reflect.get(target, key, receiver);
        if (typeof key === 'symbol') return v;
        const isObject = !!v && typeof v === 'object';
        if (Array.isArray(target)) return isObject ? watch(v, kind) : v;
        if (typeof v === 'function' && !Object.prototype.hasOwnProperty.call(target, key)) return v;
        note(target, key);
        if (!isObject) return v;
        const child = children[`${kind}.${key}`];
        return child ? watch(v, child) : v;
      },
      has(target, key) { note(target, key); return Reflect.has(target, key); },
      getOwnPropertyDescriptor(target, key) { note(target, key); return Reflect.getOwnPropertyDescriptor(target, key); }
    };
  };
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
    const known = new Set([...(t.rules || []), ...(t.display || [])]);
    const unlisted = new Set();
    list.forEach(o => Object.keys(o || {}).forEach(k => !known.has(k) && unlisted.add(k)));
    unlisted.forEach(k => problems.push(`The field “${kind}.${k}” is not in the table. List it under “rules” if it can change the outcome, otherwise under “display”.`));
  });
  Object.entries(table).forEach(([kind, t]) => {
    (t.rules || []).forEach(k => {
      if ((t.display || []).includes(k)) problems.push(`The field “${kind}.${k}” is listed under both “rules” and “display”. Pick one.`);
      if (!reads.has(`${kind}.${k}`)) problems.push(`Nothing ever read “${kind}.${k}”, which the table says can change the outcome. Teach the analyzer about it, or move it to “display”.`);
    });
  });
  return problems;
}

/**
 * Checks that an exporter, copier or converter keeps every "rules" field.
 *   table   the same table as checkFieldTable
 *   pairs   { kind: [[before, after], ...] }: an object of that kind and what came out the other end
 * Returns a list of plain-words problems: a "rules" field that was present before and is missing or different after.
 */
export function checkKept({ table, pairs = {} }) {
  const problems = new Set();
  Object.entries(pairs).forEach(([kind, list]) => {
    const t = table[kind];
    if (!t) return problems.add(`Objects of kind “${kind}” are not in the table.`);
    list.forEach(([before, after]) =>
      (t.rules || []).forEach(k => {
        if (before && Object.prototype.hasOwnProperty.call(before, k) && !(after && Object.prototype.hasOwnProperty.call(after, k) && deepEqual(before[k], after[k])))
          problems.add(`The field “${kind}.${k}” can change the outcome but was lost or changed on the way through.`);
      })
    );
  });
  return [...problems];
}
