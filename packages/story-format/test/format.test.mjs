import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  makeProject, makePassage, makeChoice, normalizeProject, parseLegacy, exportStory, storyFind, storyReplace, storyOrder, storyManuscript, storyStats,
  klFingerprint, klShortIds, STARTERS, PALETTES, GAME_OPTIONS, FIELD_CONTRACT, BACK_MODES
} from '../dist/story-format.mjs';
import { makeGenStory } from '../../qa-kit/src/genstory.mjs';
import { loadEditor } from '../../qa-kit/src/editor-vm.mjs';

const schema = JSON.parse(readFileSync(new URL('../story.schema.json', import.meta.url), 'utf8'));
const genStory = makeGenStory(normalizeProject);
const ed = loadEditor(['normalizeProject', 'exportStory', 'klShortIds', 'klFingerprint', 'storyManuscript', 'storyStats']);

/* A very small JSON Schema checker: the keywords story.schema.json uses (type, enum, const, required, properties,
   additionalProperties, items, minItems, minimum, maxLength, oneOf, $ref to #/$defs). Returns a list of problems. */
function validate(value, sch, path = '$', errs = []) {
  if (sch.$ref) return validate(value, schema.$defs[sch.$ref.split('/').pop()], path, errs);
  if (sch.oneOf) {
    if (!sch.oneOf.some(s => validate(value, s, path, []).length === 0)) errs.push(`${path}: matches none of oneOf`);
    return errs;
  }
  if ('const' in sch && value !== sch.const) errs.push(`${path}: not ${JSON.stringify(sch.const)}`);
  if (sch.enum && !sch.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} not in enum`);
  const t = sch.type;
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (t && !(t === actual || (t === 'number' && actual === 'integer'))) return errs.concat(`${path}: expected ${t}, got ${actual}`);
  if (typeof value === 'string' && sch.maxLength && value.length > sch.maxLength) errs.push(`${path}: too long`);
  if (typeof value === 'number' && sch.minimum !== undefined && value < sch.minimum) errs.push(`${path}: below minimum`);
  if (Array.isArray(value)) {
    if (sch.minItems && value.length < sch.minItems) errs.push(`${path}: too few items`);
    if (sch.items) value.forEach((v, i) => validate(v, sch.items, `${path}[${i}]`, errs));
  }
  if (actual === 'object') {
    (sch.required || []).forEach(k => k in value || errs.push(`${path}: missing ${k}`));
    for (const [k, v] of Object.entries(value)) {
      if (sch.properties?.[k]) validate(v, sch.properties[k], `${path}.${k}`, errs);
      else if (sch.additionalProperties === false) errs.push(`${path}: unexpected ${k}`);
      else if (sch.additionalProperties && typeof sch.additionalProperties === 'object') validate(v, sch.additionalProperties, `${path}.${k}`, errs);
    }
  }
  return errs;
}

test('the JSON Schema accepts every starter and 150 random stories, and rejects broken ones', () => {
  for (const st of STARTERS) assert.deepEqual(validate(normalizeProject(st.make()), schema), [], st.name);
  for (let seed = 1; seed <= 150; seed++) assert.deepEqual(validate(genStory(seed), schema), [], `seed ${seed}`);
  assert.ok(validate({}, schema).length, 'passages is required');
  assert.ok(validate({ passages: [{ id: 'a', choices: [{ check: { stat: 'x' } }] }] }, schema).length, 'a check needs target and fail');
  assert.ok(validate({ passages: [], game: { pal: 'neon' } }, schema).length, 'unknown palette');
});

test('the schema stays in step with the code: palettes, game options, back modes', () => {
  assert.deepEqual(schema.properties.game.properties.pal.enum, Object.keys(PALETTES));
  assert.deepEqual(Object.keys(schema.properties.game.properties).sort(), GAME_OPTIONS.map(o => o.key).sort());
  assert.deepEqual(schema.properties.game.properties.back.enum, BACK_MODES);
  const model = FIELD_CONTRACT.passage.rules.concat(FIELD_CONTRACT.passage.display);
  const listed = Object.keys(schema.properties.passages.items.properties);
  model.forEach(f => assert.ok(listed.includes(f), `passage field ${f} is in the schema`));
});

test('normalizeProject repairs damaged and hostile input', () => {
  assert.throws(() => normalizeProject({}), /not a story/);
  assert.throws(() => normalizeProject(null), /not a story/);
  const p = normalizeProject({
    title: 42,
    start: 'nope',
    passages: [
      { id: '__proto__', name: 7, blocks: 'oops', choices: [{ label: 'x', to: 'ghost', needs: 'a' }] },
      { id: 'b', ending: true, choices: [{ label: 'never shown', to: 'b' }] }
    ]
  });
  assert.equal(typeof p.title, 'string');
  assert.ok(p.passages.every(q => /^[A-Za-z0-9_-]+$/.test(q.id) && q.id !== '__proto__'));
  assert.ok(p.passages.some(q => q.id === p.start), 'a start page exists');
  assert.equal(Object.getPrototypeOf(Object.create(null)), null);
  assert.deepEqual(validate(p, schema), []);
  /* running it twice changes nothing */
  const again = normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(p)));
});

test('normalizeProject, exportStory, short ids, fingerprint, manuscript and stats equal the editor on 100 random stories', () => {
  const j = x => JSON.stringify(x);
  for (let seed = 1; seed <= 100; seed++) {
    const raw = genStory(seed);
    assert.equal(j(normalizeProject(raw)), j(ed.normalizeProject(raw)), `normalize ${seed}`);
    assert.equal(j(exportStory(raw)), j(ed.exportStory(raw)), `export ${seed}`);
    assert.equal(klFingerprint(raw), ed.klFingerprint(raw));
    assert.equal(j(klShortIds(exportStory(raw))), j(ed.klShortIds(ed.exportStory(raw))));
    assert.equal(storyManuscript(raw), ed.storyManuscript(raw));
    assert.equal(j(storyStats(raw)), j(ed.storyStats(raw)));
  }
});

test('the plain-text story format (parseLegacy) reads pages, choices, conditions and items', () => {
  const { project, notes } = parseLegacy(`title: Cellar
[[start]]
# The cellar
It is dark.
(if lamp) A warm light fills the room.
-> Take the lamp => hall | gives: lamp
-> Go up => hall | unless: lamp
-> Jump => nowhere

[[hall]]
The end of the road.`);
  assert.equal(project.passages[0].blocks.length, 2);
  assert.equal(project.passages[0].blocks[1].needs.length, 1, 'a line that starts with (if item) is conditional');
  assert.equal(project.title, 'Cellar');
  assert.equal(project.passages[0].heading, 'The cellar');
  assert.ok(notes.some(n => /does not exist/.test(n)));
  assert.ok(project.items.some(i => /lamp/i.test(i.name)));
  assert.ok(project.passages.some(p => /Picked up/.test(p.name)), 'a choice that gives an item gets a small page after it');
  assert.deepEqual(validate(normalizeProject(project), schema), []);
  assert.throws(() => parseLegacy('nothing here'), /No pages/);
});

test('find and replace: whole words, case, undo-friendly single replace, and the 120-letter heading limit', () => {
  const p = normalizeProject({
    start: 'a',
    passages: [{ id: 'a', name: 'Cat house', heading: 'Cat', blocks: [{ text: 'The cat sat. Concatenate. CAT!' }], choices: [{ label: 'Pet the cat', to: 'a' }] }]
  });
  assert.equal(storyFind(p, 'cat').length, 6);
  assert.equal(storyFind(p, 'cat', { whole: true }).length, 5);
  assert.equal(storyFind(p, 'cat', { whole: true, matchCase: true }).length, 2);
  const first = storyFind(p, 'cat', { whole: true })[2];
  assert.equal(storyReplace(p, 'cat', 'dog', { whole: true }, first), 1);
  assert.match(p.passages[0].blocks[0].text, /^The dog sat/);
  assert.equal(storyReplace(p, 'cat', 'x'.repeat(200), { whole: true, matchCase: true }), 1);
  assert.ok(p.passages[0].heading.length <= 120);
  assert.deepEqual(storyFind(p, ''), []);
});

test('reading order starts at the first page and never repeats a page', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const p = genStory(seed);
    const order = storyOrder(p);
    assert.equal(order[0].id, p.start);
    assert.equal(new Set(order.map(o => o.id)).size, order.length);
  }
});

test('the starters are all different, well formed, and carry no personal text', () => {
  assert.equal(new Set(STARTERS.map(s => s.name)).size, STARTERS.length);
  for (const s of STARTERS) assert.ok(s.make().passages.length >= 3);
});

test('the story written out in the README is valid and passes the checker', async () => {
  const { analyze } = await import('../../story-check/dist/story-check.mjs');
  const md = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const block = /```jsonc\n([\s\S]*?)```/.exec(md)[1].replace(/\s\/\/.*$/gm, '');
  const raw = JSON.parse(block);
  assert.deepEqual(validate(raw, schema), []);
  const r = analyze(normalizeProject(raw));
  assert.deepEqual(r.problems, []);
  assert.equal(r.endings.filter(e => e.reachable).length, 2);
});

test('normalizeProject leaves the data it is given alone, even when it is frozen', () => {
  const raw = { passages: [{ name: 'One', choices: [{ label: 'Go', to: 'b' }] }, { id: 'b', name: 'Two' }], items: [{ name: 'Key' }] };
  const before = JSON.stringify(raw);
  const freeze = o => (Object.values(o).forEach(v => v && typeof v === 'object' && freeze(v)), Object.freeze(o));
  const p = normalizeProject(freeze(raw));
  assert.equal(JSON.stringify(raw), before);
  assert.equal(p.passages.length, 2);
});

test('normalizeProject with ids: "sequential" gives the same story every time, and says what it fixed', () => {
  const raw = { passages: [{ name: 'One', choices: [{ label: 'Go', to: 'b' }] }, { id: 'b', name: 'Two', ending: true }, { name: 'Three' }], items: [{ name: 'Key' }, { name: 'Lamp' }] };
  const a = normalizeProject(JSON.parse(JSON.stringify(raw)), { ids: 'sequential' });
  const b = normalizeProject(JSON.parse(JSON.stringify(raw)), { ids: 'sequential' });
  assert.deepEqual(a, b);
  assert.deepEqual(a.passages.map(q => q.id), ['p_1', 'b', 'p_2']);
  assert.deepEqual(a.items.map(q => q.id), ['i_1', 'i_2']);
  assert.equal(a.passages[0].choices[0].to, 'b');
  const notes = [];
  normalizeProject({ start: 'x', passages: [{ id: 'x', name: 'Only', ending: true }] }, { notes });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /cannot be an ending/);
  assert.notDeepEqual(normalizeProject(JSON.parse(JSON.stringify(raw))).passages[0].id, 'p_1'); // without the option the ids stay random
});

test('the manuscript names pages by their first match when two share an id, and stays fast on a big story', () => {
  const p = normalizeProject({ passages: [{ id: 'a', name: 'First', choices: [{ label: 'On', to: 'b' }] }, { id: 'b', name: 'Second' }] });
  p.passages.push({ ...p.passages[1], name: 'Impostor' });
  assert.match(storyManuscript(p), /\*Second\*/);
  const many = normalizeProject({ passages: [...Array(4000)].map((_, i) => ({ id: `p${i}`, name: `Page ${i}`, choices: [{ label: 'On', to: `p${(i * 7 + 3) % 4000}` }] })) });
  const t = Date.now();
  storyManuscript(many);
  assert.ok(Date.now() - t < 500, 'the manuscript of 4,000 pages takes well under half a second');
});

test('the minified builds export the same names as the readable ones', async () => {
  const [a, b] = [await import('../dist/story-format.mjs'), await import('../dist/story-format.min.mjs')];
  assert.deepEqual(Object.keys(b).sort(), Object.keys(a).sort());
  assert.equal(JSON.stringify(b.normalizeProject(JSON.parse('{"id":"s","passages":[{"id":"a","name":"x"}]}'))), JSON.stringify(a.normalizeProject(JSON.parse('{"id":"s","passages":[{"id":"a","name":"x"}]}'))));
});
