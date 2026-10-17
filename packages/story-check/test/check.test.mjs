import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, analyzeStructure, normalizeProject, makeProject, makePassage, makeChoice, makeItem } from '../dist/story-check.mjs';
import { makeGenStory } from '../../qa-kit/src/genstory.mjs';
import { loadEditor } from '../../qa-kit/src/editor-vm.mjs';

const ed = loadEditor(['analyze', 'analyzeStructure', 'normalizeProject']);
const genStory = makeGenStory(normalizeProject);

/** Everything analyze() returns except its three helper functions, plus what those functions answer for every page. */
const flat = (project, a) => JSON.stringify([{ ...a, explain: 0, canArrive: 0, why: 0 }, project.passages.map(p => a.why(p.id))]);

test('a story with a dead end, an unreachable ending and a missing key is reported', () => {
  const s = makeProject('Vault');
  const hall = s.passages[0];
  hall.blocks[0].text = 'A hall.';
  const key = makeItem('Key', 'object');
  s.items.push(key);
  const vault = makePassage('Vault');
  vault.ending = true;
  const attic = makePassage('Attic');
  attic.ending = true;
  const open = makeChoice('Open', vault.id);
  open.needs = [key.id]; // nobody ever gets the key
  hall.choices.push(open, makeChoice('Leave', ''));
  s.passages.push(vault, attic);
  const r = analyze(normalizeProject(s));
  assert.ok(r.problems.some(p => /does not lead anywhere/.test(p.msg)));
  assert.ok(r.problems.some(p => /nobody can reach it/.test(p.msg)));
  const vaultEnd = r.endings.find(e => e.name === 'Vault');
  assert.equal(vaultEnd.reachable, false); // needs a key that exists nowhere
});

test('a fixed story passes', () => {
  const s = makeProject('Two pages');
  const a = s.passages[0];
  a.blocks[0].text = 'Start.';
  const b = makePassage('End');
  b.ending = true;
  b.blocks[0].text = 'Done.';
  a.choices.push(makeChoice('Go', b.id));
  s.passages.push(b);
  const r = analyze(normalizeProject(s));
  assert.deepEqual(r.problems, []);
  assert.equal(r.endings.length, 1);
  assert.equal(r.endings[0].reachable, true);
});

test('structure summary names the shape of a story', () => {
  const s = ed.normalizeProject(JSON.parse(JSON.stringify(genStory(3))));
  const st = analyzeStructure(normalizeProject(s));
  assert.equal(typeof st.label, 'string');
  assert.ok(Array.isArray(st.bottlenecks));
});

test('identical answers to the editor on 150 random stories (every feature)', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const p = genStory(seed);
    assert.equal(flat(p, analyze(p)), flat(p, ed.analyze(p)), `seed ${seed}`);
    assert.equal(JSON.stringify(analyzeStructure(p)), JSON.stringify(ed.analyzeStructure(p)), `structure, seed ${seed}`);
  }
});

test('bigger stories (many objects and states, wide numbers) also match', () => {
  for (let seed = 1; seed <= 12; seed++) {
    for (const opts of [{ huge: true }, { wide: true }]) {
      const p = genStory(seed * 31, opts);
      assert.equal(flat(p, analyze(p, 60000)), flat(p, ed.analyze(p, 60000)), `seed ${seed} ${JSON.stringify(opts)}`);
    }
  }
});

test('a key behind a one-way door is noted, and a story where the key can be fetched is not', () => {
  const build = oneWay => {
    const s = makeProject('Door');
    const start = s.passages[0];
    start.blocks[0].text = 'Start.';
    const key = makeItem('Key', 'object');
    s.items.push(key);
    const take = makeChoice('Take the key', '');
    take.gives = [key.id];
    const skip = makeChoice('Skip it', '');
    const hall = makePassage('Hall');
    hall.blocks[0].text = 'A hall.';
    const end = makePassage('Vault');
    end.ending = true;
    end.blocks[0].text = 'Done.';
    take.to = hall.id;
    skip.to = hall.id;
    start.choices.push(take, skip);
    const open = makeChoice('Open the door', end.id);
    open.needs = [key.id];
    hall.choices.push(open);
    if (!oneWay) hall.choices.push(makeChoice('Go back', start.id));
    s.passages.push(hall, end);
    return normalizeProject(s);
  };
  const note = r => r.notes.filter(n => /miss this choice for good/.test(n.msg));
  assert.equal(note(analyze(build(true))).length, 1);
  assert.equal(note(analyze(build(false))).length, 0);
});

test('the minified builds give the same answers as the readable ones', async () => {
  const min = await import('../dist/story-check.min.mjs');
  assert.deepEqual(Object.keys(min).sort(), Object.keys(await import('../dist/story-check.mjs')).sort());
  for (let seed = 1; seed <= 20; seed++) {
    const p = genStory(seed);
    assert.equal(flat(p, min.analyze(p)), flat(p, analyze(p)), `seed ${seed}`);
  }
});
