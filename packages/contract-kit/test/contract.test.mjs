/* contract-kit: the helpers do what the guide says. Copyright (c) 2026 LFC Foundry. MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { seeded, agree, agreeAsync, shrink, deepEqual, watchReads, checkFieldTable, checkKept, guarded } from '../src/contract.mjs';
import * as core from '../src/core.mjs';

test('the same seed gives the same numbers; different seeds differ', () => {
  const a = seeded(7);
  const b = seeded(7);
  assert.deepEqual([a.rnd(), a.int(1, 6), a.pick(['x', 'y', 'z'])], [b.rnd(), b.int(1, 6), b.pick(['x', 'y', 'z'])]);
  assert.notEqual(seeded(7).rnd(), seeded(8).rnd());
  const r = seeded(3);
  for (let i = 0; i < 500; i++) {
    const n = r.int(2, 5);
    assert.ok(n >= 2 && n <= 5);
  }
});

const generate = r => ({ x: r.int(0, 20), y: r.int(0, 20) });

test('agree: two matching implementations pass; the first difference is reported with a seed that replays it', () => {
  const add = ({ x, y }) => x + y;
  const add2 = ({ x, y }) => y + x;
  assert.deepEqual(agree({ generate, a: add, b: add2, runs: 100 }), { ok: true, runs: 100, failure: null });
  const buggy = ({ x, y }) => (x === 13 ? 0 : x + y);
  const r = agree({ generate, a: buggy, b: add, runs: 500, seed: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.failure.input.x, 13);
  assert.equal(r.failure.a.value, 0);
  const again = agree({ generate, a: buggy, b: add, runs: 500, seed: r.failure.seed });
  assert.deepEqual(again.failure.input, r.failure.input, 'the same seed finds the same input');
});

test('agree: a throw is a difference; view and same narrow the comparison; inputs are not shared', () => {
  const r = agree({ generate, a: () => { throw new Error('boom'); }, b: () => 1, runs: 3 });
  assert.equal(r.failure.a.error, 'boom');
  assert.ok(agree({ generate, a: i => ({ v: i.x, extra: 1 }), b: i => ({ v: i.x }), view: v => v.v, runs: 20 }).ok);
  assert.ok(agree({ generate, a: i => i.x, b: i => i.x + 0.0000001, same: (p, q) => Math.abs(p - q) < 1e-3, runs: 20 }).ok);
  const mutate = agree({ generate, a: i => { i.x = -1; return 0; }, b: i => (i.x < 0 ? 1 : 0), runs: 20 });
  assert.ok(mutate.ok, 'one side changing its input cannot change what the other sees');
});

test('watchReads notes fields by kind and follows what is inside, but not list positions', () => {
  const story = { start: 'a', title: 'T', passages: [{ id: 'a', choices: [{ to: 'b', label: 'Go' }] }] };
  const { proxy, reads } = watchReads(story, 'project', { 'project.passages': 'passage', 'passage.choices': 'choice' });
  proxy.start;
  proxy.passages[0].id;
  proxy.passages.map(p => p.choices.map(c => c.to));
  assert.deepEqual([...reads].sort(), ['choice.to', 'passage.choices', 'passage.id', 'project.passages', 'project.start']);
  assert.equal(proxy.passages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(proxy)), story, 'the stand-in behaves like the original');
});

test('checkFieldTable finds unread rules fields and unlisted fields, and is quiet when all is well', () => {
  const table = { loan: { rules: ['start', 'end'], display: ['note'] } };
  const all = new Set(['loan.start', 'loan.end']);
  assert.deepEqual(checkFieldTable({ table, samples: { loan: [{ start: 1, end: 2, note: '' }] }, reads: all }), []);
  const unread = checkFieldTable({ table, reads: new Set(['loan.start']) });
  assert.equal(unread.length, 1);
  assert.match(unread[0], /loan\.end/);
  const unlisted = checkFieldTable({ table, samples: { loan: [{ start: 1, end: 2, tint: 'red' }] }, reads: all });
  assert.match(unlisted[0], /loan\.tint/);
  assert.match(checkFieldTable({ table, samples: { other: [{}] }, reads: all })[0], /other/);
});

test('guarded stops a check that never finishes, and passes one that does', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-kit-'));
  writeFileSync(join(dir, 'ok.mjs'), 'process.exit(0)');
  writeFileSync(join(dir, 'bad.mjs'), 'process.exit(3)');
  writeFileSync(join(dir, 'loop.mjs'), 'for (;;) {}');
  assert.deepEqual(guarded(join(dir, 'ok.mjs'), [], 5), { ok: true, timedOut: false, status: 0, signal: null });
  assert.deepEqual(guarded(join(dir, 'bad.mjs'), [], 5), { ok: false, timedOut: false, status: 3, signal: null });
  const t = guarded(join(dir, 'loop.mjs'), [], 1);
  assert.equal(t.ok, false);
  assert.equal(t.timedOut, true);
});

/* ---- 1.1.0 ---- */

test('seeded: rnd stays below 1, so int and pick never step outside their range', () => {
  const r = seeded(9);
  for (let i = 0; i < 20000; i++) assert.ok(r.rnd() < 1);
  // the one state that used to give exactly 1: s = 0x7fffffff
  const edge = { rnd: () => 0x7fffffff / 0x80000000 };
  assert.ok(Math.floor(edge.rnd() * 6) <= 5);
});

test('agree: a promise is a difference, not a quiet pass; agreeAsync compares what the promises say', async () => {
  const bad = agree({ generate, a: async i => i.x, b: async i => i.x + 1, runs: 5 });
  assert.equal(bad.ok, false);
  assert.match(bad.failure.a.error, /agreeAsync/);
  assert.ok((await agreeAsync({ generate, a: async i => i.x, b: i => i.x, runs: 20 })).ok);
  const r = await agreeAsync({ generate, a: async i => i.x, b: async i => i.x + 1, runs: 20 });
  assert.equal(r.ok, false);
  assert.equal(r.failure.a.value + 1, r.failure.b.value);
  assert.equal((await agreeAsync({ generate, a: async () => { throw new Error('late'); }, b: async () => 1, runs: 2 })).failure.a.error, 'late');
});

test('agree: every kind of throw counts, including empty messages, strings and null', () => {
  for (const thrown of [new Error(''), 'bad', null, undefined, 0]) {
    const r = agree({ generate, a: () => { throw thrown; }, b: () => undefined, runs: 2 });
    assert.equal(r.ok, false, `throwing ${String(thrown)} must not look like returning undefined`);
    assert.equal(r.failure.a.threw, true);
  }
  assert.equal(agree({ generate, a: () => { throw new Error('x'); }, b: () => { throw new Error('x'); }, runs: 2 }).ok, false, 'by default two throws are still a difference');
  assert.ok(agree({ generate, a: () => { throw new Error('x'); }, b: () => { throw new Error('x'); }, runs: 2, errors: 'compare' }).ok);
  assert.equal(agree({ generate, a: () => { throw new Error('x'); }, b: () => { throw new Error('y'); }, runs: 2, errors: 'compare' }).ok, false);
});

test('agree: clone false skips the copy; a custom copier is used; seconds stops early', () => {
  const seen = [];
  agree({ generate, a: i => seen.push(i), b: i => seen.push(i), runs: 1, clone: false });
  assert.equal(seen[0], seen[1], 'with clone: false both sides get the very same object');
  let copies = 0;
  agree({ generate, a: i => i.x, b: i => i.x, runs: 4, clone: i => { copies++; return { ...i }; } });
  assert.equal(copies, 8);
  const slow = agree({ generate: r => { const t = Date.now(); while (Date.now() - t < 5); return generate(r); }, a: i => i.x, b: i => i.x, runs: 100000, seconds: 0.05 });
  assert.ok(slow.ok && slow.stopped && slow.runs < 100000 && slow.runs >= 1);
});

test('agree: tags count what the inputs contain, and an expected tag that never appears fails the run', () => {
  const tags = i => [i.x > 10 ? 'big' : 'small', 'any'];
  const r = agree({ generate, a: i => i.x, b: i => i.x, runs: 200, tags, expect: ['big', 'small'] });
  assert.ok(r.ok && r.tags.any === 200 && r.tags.big + r.tags.small === 200);
  const never = agree({ generate, a: i => i.x, b: i => i.x, runs: 50, tags, expect: ['huge'] });
  assert.equal(never.ok, false);
  assert.deepEqual(never.failure, { missing: ['huge'] });
});

test('shrink: a failing story-sized input is cut to the smallest one that still fails', () => {
  const generateList = r => ({ items: Array.from({ length: r.int(20, 40) }, () => ({ id: r.int(0, 99), note: 'x'.repeat(r.int(0, 30)) })) });
  const buggy = ({ items }) => items.length - (items.some(i => i.id === 77) ? 1 : 0);
  const right = ({ items }) => items.length;
  let found;
  for (let seed = 1; seed < 40 && !found; seed++) { const r = agree({ generate: generateList, a: buggy, b: right, runs: 50, seed, shrink: true }); if (!r.ok) found = r; }
  assert.ok(found, 'the planted bug is found');
  const small = found.failure.smallest;
  assert.deepEqual(small.input, { items: [{ id: 77, note: '' }] });
  assert.ok(found.failure.input.items.length >= 20 && small.tries > 0);
  assert.notEqual(small.a.value, small.b.value);
});

test('shrink: only a failure of the same kind counts, a custom candidate list is honored, and the limit stops it', () => {
  // the original failure is a difference in values; deleting items would also make both sides throw, which must not count as "still failing"
  const r = agree({ generate: () => ({ items: [1, 2, 3] }), a: i => i.items.length + 1, b: i => { if (!i.items.length) throw new Error('empty'); return i.items.length; }, runs: 1, shrink: true });
  assert.deepEqual(r.failure.smallest.input, { items: [0] }, 'one item left, its value shrunk to 0: zero items would be a different failure');
  const own = shrink(10, n => n >= 3, { candidates: function* (n) { yield n - 1; } });
  assert.equal(own.input, 3);
  const capped = shrink(1000, n => n >= 3, { candidates: function* (n) { yield n - 1; }, limit: 10 });
  assert.ok(capped.input === 990 && capped.tries <= 11, 'ten steps and no more');
});

test('deepEqual agrees with node:util isDeepStrictEqual on random nested data (agree checks itself)', () => {
  const make = (r, depth = 0) => {
    const k = r.int(0, depth > 2 ? 5 : 11);
    switch (k) {
      case 0: return r.int(-2, 2);
      case 1: return r.pick([0, -0, NaN, 1.5, Infinity]);
      case 2: return r.pick(['', 'a', 'ab']);
      case 3: return r.pick([true, false, null, undefined]);
      case 4: return new Date(r.int(0, 3) * 1000);
      case 5: return r.pick([/a/, /a/g, /b/]);
      case 6: return Array.from({ length: r.int(0, 3) }, () => make(r, depth + 1));
      case 7: return Object.fromEntries(Array.from({ length: r.int(0, 3) }, () => [r.pick(['a', 'b', 'c']), make(r, depth + 1)]));
      case 8: return new Map(Array.from({ length: r.int(0, 3) }, () => [r.pick(['a', 1, { z: 1 }]), make(r, depth + 1)]));
      case 9: return new Set(Array.from({ length: r.int(0, 3) }, () => make(r, depth + 1)));
      case 10: return new Uint8Array(Array.from({ length: r.int(0, 3) }, () => r.int(0, 2)));
      default: return r.pick([new Error('a'), new Error('b'), new TypeError('a')]);
    }
  };
  const res = agree({ generate: r => [make(r), make(r)], a: ([x, y]) => deepEqual(x, y), b: ([x, y]) => isDeepStrictEqual(x, y), runs: 20000, seed: 11, clone: false });
  assert.ok(res.ok, JSON.stringify(res.failure && res.failure.input));
  // and the same value against a copy of itself must be equal (the interesting side of the comparison)
  const same = agree({ generate: r => { const v = make(r); return [v, structuredClone(v)]; }, a: ([x, y]) => deepEqual(x, y), b: ([x, y]) => isDeepStrictEqual(x, y), runs: 5000, seed: 12, clone: false });
  assert.ok(same.ok);
  assert.equal(deepEqual(Promise.resolve(1), Promise.resolve(1)), false);
  const loop = { n: 1 }; loop.self = loop;
  const loop2 = { n: 1 }; loop2.self = loop2;
  assert.ok(deepEqual(loop, loop2));
});

test('watchReads: the same inner object comes back as the same stand-in, so === and Set work', () => {
  const page = { id: 'a' };
  page.next = page;
  const { proxy } = watchReads({ passages: [page] }, 'project', { 'project.passages': 'passage', 'passage.next': 'passage' });
  assert.equal(proxy.passages[0], proxy.passages[0]);
  assert.equal(proxy.passages[0].next, proxy.passages[0]);
  assert.ok(new Set([proxy.passages[0]]).has(proxy.passages[0].next));
});

test('watchReads: frozen data works; "in" and hasOwnProperty count as reads; borrowed methods are not fields', () => {
  const frozen = Object.freeze({ list: Object.freeze([1]), inner: Object.freeze({ a: 1, b: 2 }) });
  const { proxy, reads } = watchReads(frozen, 'k', { 'k.inner': 'i' });
  assert.equal(proxy.inner.a, 1);
  assert.deepEqual([...reads].sort(), ['i.a', 'k.inner']);
  const w = watchReads({ a: 1, b: 2, c: 3 }, 'k');
  assert.ok('a' in w.proxy);
  assert.ok(Object.prototype.hasOwnProperty.call(w.proxy, 'b'));
  w.proxy.hasOwnProperty('c');
  w.proxy.toString();
  assert.deepEqual([...w.reads].sort(), ['k.a', 'k.b', 'k.c']);
});

test('checkFieldTable: a table without a display list works; a field listed twice is a problem', () => {
  assert.deepEqual(checkFieldTable({ table: { loan: { rules: ['a'] } }, samples: { loan: [{ a: 1 }] }, reads: new Set(['loan.a']) }), []);
  const both = checkFieldTable({ table: { loan: { rules: ['a'], display: ['a'] } }, reads: new Set(['loan.a']) });
  assert.equal(both.length, 1);
  assert.match(both[0], /both/);
});

test('checkKept finds a rules field that an exporter dropped or changed, and ignores display fields', () => {
  const table = { loan: { rules: ['start', 'end'], display: ['note'] } };
  const good = [{ start: 1, end: 5, note: 'x' }, { start: 1, end: 5 }];
  assert.deepEqual(checkKept({ table, pairs: { loan: [good] } }), []);
  const lost = checkKept({ table, pairs: { loan: [[{ start: 1, end: 5 }, { start: 1 }], [{ start: 1, end: 5 }, { start: 1 }]] } });
  assert.equal(lost.length, 1, 'one line per field, not one per object');
  assert.match(lost[0], /loan\.end/);
  assert.match(checkKept({ table, pairs: { loan: [[{ start: 1, end: 5 }, { start: 2, end: 5 }]] } })[0], /loan\.start/);
  assert.match(checkKept({ table, pairs: { other: [[{}, {}]] } })[0], /other/);
});

test('guarded: a script that ignores the polite stop request is still stopped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-kit-'));
  writeFileSync(join(dir, 'stubborn.mjs'), "process.on('SIGTERM', () => {}); for (;;) {}");
  const t = guarded(join(dir, 'stubborn.mjs'), [], 0.5);
  assert.equal(t.timedOut, true);
  assert.equal(t.signal, 'SIGKILL');
});

test('core.mjs imports nothing from Node, so it can run in a browser', async () => {
  const { readFileSync } = await import('node:fs');
  assert.doesNotMatch(readFileSync(new URL('../src/core.mjs', import.meta.url), 'utf8'), /^\s*import\b|require\(|node:/m);
  assert.equal(typeof core.agree, 'function');
  assert.equal(core.guarded, undefined);
});

test('the fixed browser check gives its recorded answer in Node (a browser run must give the same)', async () => {
  const { run } = await import('./browser-check.mjs');
  const { readFileSync } = await import('node:fs');
  assert.deepEqual(JSON.parse(JSON.stringify(await run())), JSON.parse(readFileSync(new URL('./browser-check.expected.json', import.meta.url), 'utf8')));
});

test('the default copier works when a browser insists structuredClone is called on its window (it was once handed over as a method)', () => {
  const real = globalThis.structuredClone;
  globalThis.structuredClone = function (x) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return real(x);
  };
  try {
    assert.ok(agree({ generate, a: i => i.x, b: i => i.x, runs: 3 }).ok);
    assert.ok(watchReads(Object.freeze({ a: 1 }), 'k').proxy.a === 1);
  } finally {
    globalThis.structuredClone = real;
  }
});
