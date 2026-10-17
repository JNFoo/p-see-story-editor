/* story-outline: reading outlines and making stories from them. Copyright (c) 2026 LFC Foundry. MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOutline, outlinePlan, outlineToProject, makeProject, normalizeProject } from '../dist/story-outline.mjs';
import { analyze } from '../../story-check/dist/story-check.mjs';

test('pages, paragraphs, choices and endings', () => {
  const o = parseOutline('Start\n  The door is open.\n  Go in → Hall\n  Wait -> Cold night (bad ending)\n\nHall (ending)\n  Climb up => Start\n');
  assert.equal(o.pages.length, 2);
  assert.equal(o.pages[0].name, 'Start');
  assert.ok(o.pages[1].ending);
  assert.equal(o.pages[0].texts[0], 'The door is open.');
  assert.equal(o.pages[0].choices.length, 2);
  assert.equal(o.pages[0].choices[1].to, 'Cold night (bad ending)', 'the ending marker belongs to page lines only');
});

test('bullets, numbers, tabs and comments', () => {
  const b = parseOutline('- Start\n    - Go → Hall\n- Hall (good ending)\n');
  assert.equal(b.pages[1].valence, 'good');
  assert.equal(b.pages[0].choices[0].to, 'Hall');
  assert.equal(parseOutline('1. Start\n\t2) Go → Hall\n').pages[0].choices[0].label, 'Go');
  assert.equal(parseOutline('# note\nStart\n').pages.length, 1);
});

test('repeats, empty choices and odd input say so in plain words', () => {
  const d = parseOutline('A\n B → B\nA\n C → C\n');
  assert.equal(d.pages.length, 1);
  assert.equal(d.pages[0].choices.length, 2);
  assert.ok(d.issues.some(t => /listed twice/.test(t)));
  const e = parseOutline('Start\n  → Hall\n  Go →\n');
  assert.ok(e.issues.some(t => /no words/.test(t)) && e.issues.some(t => /leads nowhere/.test(t)));
  assert.equal(parseOutline('').pages.length, 0);
  assert.equal(parseOutline('   \n# note\n').pages.length, 0);
  assert.ok(parseOutline('x\n'.repeat(5000)).issues.length >= 1, 'a huge paste is cut off and says so');
  for (const junk of [null, undefined, 42, {}]) assert.doesNotThrow(() => parseOutline(junk));
});

test('outlineToProject makes a clean story with the first page as the start', () => {
  const { project, issues } = outlineToProject('Start\n  Hello.\n  Go on → Middle\n  Skip → Nowhere yet\nMiddle\n  Finish → End\nEnd (good ending)\n  Done.\n', 'Tiny');
  assert.equal(project.title, 'Tiny');
  assert.equal(project.passages[0].name, 'Start');
  assert.equal(project.start, project.passages[0].id);
  assert.ok(project.passages.find(p => p.name === 'End').ending);
  assert.ok(project.passages.some(p => p.name === 'Nowhere yet'), 'a page named only in a choice is added empty');
  assert.ok(issues.some(t => /not written yet/.test(t)));
  assert.deepEqual(normalizeProject(JSON.parse(JSON.stringify(project))), project, 'normalizeProject changes nothing');
  assert.ok(analyze(project).endings.length >= 1, 'the checker can read it');
  const ids = project.passages.map(p => p.id);
  project.passages.forEach(p => p.choices.forEach(c => assert.ok(ids.includes(c.to), 'every choice leads to a real page')));
});

test('endings lose their choices; no pages gives null', () => {
  const { project, issues } = outlineToProject('Start\n  Go → Last\nLast (ending)\n  Back → Start\n');
  assert.equal(project.passages.find(p => p.name === 'Last').choices.length, 0);
  assert.ok(issues.some(t => /is an ending/.test(t)));
  const none = outlineToProject('   \n');
  assert.equal(none.project, null);
  assert.equal(outlineToProject('').project, null);
});

test('outlinePlan adds to an existing story without changing it and keeps names unique', () => {
  const proj = makeProject('Existing'); // one empty first page "The beginning"
  const before = JSON.stringify(proj);
  const plan = outlinePlan(parseOutline('The beginning\n  Go → Two\nTwo\n'), proj);
  assert.equal(JSON.stringify(proj), before, 'the story is not changed');
  assert.ok(plan.blank, 'the untouched first page may be replaced');
  assert.equal(plan.pages[0].name, 'The beginning');
  proj.passages[0].blocks[0].text = 'Written.';
  const plan2 = outlinePlan(parseOutline('The beginning\n'), proj);
  assert.equal(plan2.blank, null);
  assert.equal(plan2.pages[0].name, 'The beginning 2');
  assert.ok(plan2.issues.some(t => /already in the story/.test(t)));
});
