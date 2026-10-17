/* Twine import: the fixtures are original, hand-written test files (not anyone's story). Copyright (c) 2026 LFC Foundry. MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importTwine, twineRead, normalizeProject } from '../dist/twine-import.mjs';
import { analyze } from '../../story-check/dist/story-check.mjs';

const fx = f => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('Harlowe cave: rules mode makes a flag and a number, and the result is already clean', () => {
  const r = importTwine(fx('cave-harlowe.html'), { code: 'rules' });
  assert.equal(r.kind, 'Twine 2 HTML');
  assert.equal(r.project.title, 'Cave');
  assert.equal(r.summary.items, 2);
  assert.equal(r.summary.unfinished, 0);
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(r.project))), r.project, 'normalizeProject changes nothing');
  assert.ok(analyze(r.project).endings.length >= 1, 'the checker can read it');
});

test('text mode keeps the code as words and flags the pages', () => {
  const r = importTwine(fx('cave-harlowe.html'), { code: 'text' });
  assert.equal(r.project.items.length, 0);
  assert.ok(r.summary.unfinished > 0);
  assert.match(r.project.passages.find(p => p.name === 'Start').blocks[0].text, /\(set: \$gold to 0\)/);
});

test('SugarCube Twee, Twine 1 and an archive', () => {
  const m = importTwine(fx('market-sugarcube.twee'));
  assert.equal(m.kind, 'Twee');
  assert.equal(m.project.title, 'Market Day');
  const o = importTwine(fx('old-twine1.html'));
  assert.equal(o.kind, 'Twine 1 HTML');
  assert.equal(o.project.passages.length, 3);
  const a = twineRead(fx('archive-two.html'));
  assert.equal(a.stories.length, 2);
  assert.equal(importTwine(fx('archive-two.html'), { story: 1 }).project.title, 'Second');
});

test('the author is exactly what the file names, and nobody else is ever put in', () => {
  const c = importTwine(fx('credited.twee'));
  assert.equal(c.project.author, 'Zoë Ó Briain-Nakamura');
  assert.ok(c.report.some(l => /Author kept exactly/.test(l)));
  assert.equal(importTwine(fx('old-twine1.html')).project.author, 'Somebody');
  for (const f of ['market-sugarcube.twee', 'cave-harlowe.html', 'archive-two.html']) {
    const r = importTwine(fx(f));
    assert.equal(r.project.author, '', f + ': no author named, none given');
    assert.ok(r.report.some(l => /names no author/.test(l)));
    assert.ok(!/JNFoo|Claude|Anthropic/.test(JSON.stringify(r.project)));
  }
  const long = 'A'.repeat(300);
  assert.equal(importTwine(`:: StoryTitle\nT\n\n:: StoryAuthor\n${long}\n\n:: Start\nHi`).project.author, long, 'long names are not shortened');
});

test('not a Twine story: plain-words refusal', () => {
  assert.throws(() => importTwine('just some words'), /does not look like a Twine story/);
});
