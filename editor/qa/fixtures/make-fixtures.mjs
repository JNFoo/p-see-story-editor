/* Makes the test stories in this folder from the bundled example (editor/keepers-light.project.json). Run it again after the example
   or the story format changes:  node make-fixtures.mjs
     sample.story.json          the example, cleaned up by the editor's own normalizeProject
     sample-rich.story.json     the same story with one Given ("Who are you?", two hidden states), an item whose name changes with it,
                                and a corridor of three plain pages in a row (the Map folds them into one "run"), where the second page hands the lantern over to "the Keeper"
     sample-other.story.json    the same pages under another id and title, for opening a different story over the example
     sample-older.story.json    an older copy of the same story (same id, three pages fewer, no Given), to test opening another
                                version of the story that is already open
   Copyright (c) 2026 JNFoo. MIT License. */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadEditor } from '../../../packages/qa-kit/src/editor-vm.mjs';

const { normalizeProject } = loadEditor(['normalizeProject'], ['core.js']);
const here = new URL('./', import.meta.url);
const base = JSON.parse(readFileSync(new URL('../../keepers-light.project.json', import.meta.url), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const save = (name, project) => writeFileSync(new URL(name, here), JSON.stringify(project, null, 1) + '\n');

const sample = clone(normalizeProject(clone(base)));
save('sample.story.json', sample);

const rich = clone(sample);
rich.items.push({ id: 'i_g_ranger', name: 'Ranger', kind: 'state', show: false }, { id: 'i_g_visitor', name: 'Visitor', kind: 'state', show: false });
rich.givens = [{ id: 'g_role', question: 'Who are you?', options: ['i_g_ranger', 'i_g_visitor'] }];
rich.items.find(i => i.id === 'i_lantern').names = [{ when: 'i_g_visitor', name: 'Borrowed lantern' }];
const corridor = ['Corridor one', 'Corridor two', 'Corridor three'];
corridor.forEach((name, i) => rich.passages.push({
  id: `p_corridor${i + 1}`, name, blocks: [{ text: `The corridor goes on (${i + 1} of 3).` }],
  choices: [{ label: i < 2 ? 'Keep walking' : 'Come out by the shore', to: i < 2 ? `p_corridor${i + 2}` : 'p_shore' }]
}));
rich.passages.find(p => p.id === 'p_corridor2').takes = ['i_lantern'];
rich.passages.find(p => p.id === 'p_corridor2').sends = { i_lantern: 'w:the Keeper' };
rich.passages.find(p => p.id === 'p_hall').choices.push({ label: 'Follow the long corridor', to: 'p_corridor1' });
save('sample-rich.story.json', clone(normalizeProject(rich)));

const other = clone(sample);
other.id = 's_sample_other';
other.title = 'Lighthouse Sample';
save('sample-other.story.json', clone(normalizeProject(other)));

const older = clone(sample);
const drop = new Set(['p_cliff_deal', 'p_end_bought', 'p_end_flee']);
older.passages = older.passages.filter(p => !drop.has(p.id));
older.passages.forEach(p => { p.choices = (p.choices || []).filter(c => !drop.has(c.to)); });
save('sample-older.story.json', clone(normalizeProject(older)));
console.log('wrote sample, sample-rich, sample-other and sample-older');
