/* story-diff: the plain-words labels. Copyright (c) 2026 LFC Foundry. MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeChange } from '../dist/story-diff.mjs';

const base = () => ({
  id: 's1',
  title: 'T',
  author: '',
  start: 'a',
  items: [{ id: 'k', name: 'Key', kind: 'object' }],
  givens: [],
  game: {},
  passages: [
    { id: 'a', name: 'Start', blocks: [{ text: 'x' }], choices: [], gives: [], takes: [], adds: {}, sends: {}, ending: false, valence: '', color: '', note: '' },
    { id: 'b', name: 'Hall', blocks: [{ text: 'y' }], choices: [], gives: [], takes: [], adds: {}, sends: {}, ending: false, valence: '', color: '', note: '' }
  ]
});
const clone = o => JSON.parse(JSON.stringify(o));
const change = fn => {
  const a = base();
  const b = clone(a);
  fn(b);
  return describeChange(a, b);
};

test('pages added and deleted', () => {
  assert.deepEqual(change(s => s.passages.push({ id: 'c', name: 'The Cellar' })), { text: 'Add page “The Cellar”', pid: 'c' });
  assert.deepEqual(change(s => s.passages.pop()), { text: 'Delete page “Hall”', pid: 'b' });
  assert.equal(change(s => s.passages.push({ id: 'c', name: 'C' }, { id: 'd', name: 'D' })).text, 'Add 2 pages');
  assert.equal(change(s => (s.passages.pop(), s.passages.push({ id: 'z', name: 'Z' }, { id: 'y', name: 'Y' }))).text, 'Change 3 pages (some added, some deleted)');
});

test('inside one page', () => {
  assert.equal(change(s => (s.passages[0].name = 'The shore')).text, 'Rename page “Start” to “The shore”');
  assert.equal(change(s => s.passages[0].choices.push({ label: 'Go', to: 'b' })).text, 'Add a choice on “Start”');
  assert.equal(change(s => s.passages[0].blocks.push({ text: 'more' })).text, 'Add a paragraph on “Start”');
  assert.equal(change(s => s.passages[0].blocks.pop()).text, 'Delete a paragraph on “Start”');
  assert.equal(change(s => (s.passages[1].ending = true)).text, 'Change the ending setting of “Hall”');
  assert.equal(change(s => (s.passages[1].color = 'red')).text, 'Mark page “Hall”');
  assert.equal(change(s => (s.passages[1].gives = ['k'])).text, 'Change what page “Hall” gives or takes');
  assert.equal(change(s => (s.passages[1].blocks[0].text = 'changed')).pid, 'b');
  assert.equal(change(s => ((s.passages[0].blocks[0].text = 'p'), (s.passages[1].blocks[0].text = 'q'))).text, 'Change 2 pages');
});

test('the story itself', () => {
  assert.equal(change(s => s.passages.reverse()).text, 'Move page “Hall”');
  assert.equal(change(s => (s.start = 'b')).text, 'Change the start page');
  assert.equal(change(s => (s.title = 'U')).text, 'Change the story title');
  assert.equal(change(s => (s.author = 'Someone')).text, 'Change the author');
  assert.equal(change(s => (s.game = { back: 'block' })).text, 'Change the game options');
  assert.equal(change(s => s.items.push({ id: 'l', name: 'Lamp', kind: 'object' })).text, 'Add item “Lamp”');
  assert.equal(change(s => (s.items[0].name = 'Brass key')).text, 'Rename item “Key” to “Brass key”');
  assert.equal(change(s => (s.id = 'other')).text, 'Open another story');
  assert.equal(change(() => {}).text, 'Edit the story');
});

test('text or objects, and nothing ever throws', () => {
  const a = base();
  const b = clone(a);
  b.passages.push({ id: 'c', name: 'C' });
  assert.deepEqual(describeChange(JSON.stringify(a), JSON.stringify(b)), describeChange(a, b));
  for (const bad of ['not json', '', 'null', '5', null, undefined, 7, [], {}]) {
    assert.equal(typeof describeChange(bad, a).text, 'string');
    assert.equal(typeof describeChange(a, bad).text, 'string');
  }
  assert.equal(describeChange('not json', '{}').text, 'Edit the story');
});

test('long page names are shortened', () => {
  const s = change(s => s.passages.push({ id: 'c', name: 'A'.repeat(50) }));
  assert.ok(s.text.length < 50 && s.text.includes('…'));
});
