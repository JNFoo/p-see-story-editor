/* The file format over time: every story file kept in editor/qa/fixtures (some written by older releases) opens, comes out at the current
   format version, and normalizes to itself (opening and re-opening changes nothing). The revision stamp survives, a bad stamp is dropped,
   and a file from a newer format opens with a warning. When the format changes (STORY_VERSION in core.js), keep an old-format file in the
   fixtures folder so this test proves the upgrade chain still opens it. Copyright (c) 2026 LFC Foundry. MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { normalizeProject, exportStory } from '../dist/story-format.mjs';
import { createContext, runInContext } from 'node:vm';

const dir = new URL('../../../editor/qa/fixtures/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.story.json'));
/* the editor's own core.js in a sandbox, with a way to read the one-time note normalizeProject leaves for the screen */
const sandbox = createContext({ console, TextDecoder, TextEncoder });
runInContext(`${readFileSync(new URL('../../../editor/core.js', import.meta.url), 'utf8')}\nthis.ed = { normalizeProject, STORY_VERSION, note: () => startFixNote };`, sandbox);
const ed = sandbox.ed;

test('there are fixtures to open', () => assert.ok(files.length >= 3, files.join()));

for (const f of files) {
  test(`fixture ${f} opens at the current version and settles`, () => {
    const raw = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const once = normalizeProject(raw);
    assert.equal(once.version, ed.STORY_VERSION);
    const twice = normalizeProject(JSON.parse(JSON.stringify(once)));
    // ids that were invalid get fresh random ones the first time only; after that the story is stable
    assert.deepEqual(JSON.parse(JSON.stringify(twice)), JSON.parse(JSON.stringify(once)));
    assert.ok(exportStory(once).passages.length > 0);
  });
}

test('the revision stamp survives and a bad one is dropped', () => {
  const raw = JSON.parse(readFileSync(new URL(files[0], dir), 'utf8'));
  const good = normalizeProject({ ...raw, rev: 7, savedAt: '2026-10-14T12:00:00.000Z' });
  assert.equal(good.rev, 7);
  assert.equal(good.savedAt, '2026-10-14T12:00:00.000Z');
  const bad = normalizeProject({ ...raw, rev: 'x', savedAt: 'yesterday' });
  assert.equal(bad.rev, undefined);
  assert.equal(bad.savedAt, undefined);
  assert.equal('rev' in exportStory(good), false, 'the game never carries the stamp');
});

test('a file from a newer format opens with a warning', () => {
  const raw = JSON.parse(readFileSync(new URL(files[0], dir), 'utf8'));
  ed.normalizeProject({ ...raw, version: ed.STORY_VERSION + 1 });
  assert.match(ed.note(), /newer version of the editor/);
  ed.normalizeProject(raw);
  assert.equal(ed.note(), '');
});
