/* contract-kit: the helpers do what the guide says. Copyright (c) 2026 LFC Foundry. MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seeded, agree, watchReads, checkFieldTable, guarded } from '../src/contract.mjs';

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
  assert.deepEqual(guarded(join(dir, 'ok.mjs'), [], 5), { ok: true, timedOut: false, status: 0 });
  assert.deepEqual(guarded(join(dir, 'bad.mjs'), [], 5), { ok: false, timedOut: false, status: 3 });
  const t = guarded(join(dir, 'loop.mjs'), [], 1);
  assert.equal(t.ok, false);
  assert.equal(t.timedOut, true);
});
