import { makeProject, makePassage, makeChoice, makeItem, normalizeProject, analyze } from '../dist/story-check.mjs';

// A tiny story with a key: the vault can only be opened by a player who picked up the key.
const story = makeProject('The Vault');
const hall = story.passages[0];
hall.name = 'Hall';
hall.blocks[0].text = 'A dusty hall. A brass key lies on the floor.';

const key = makeItem('Brass key', 'object');
story.items.push(key);

const vault = makePassage('Vault');
vault.ending = true;
vault.valence = 'good';
vault.blocks[0].text = 'The door swings open. Gold!';

const attic = makePassage('Attic'); // nothing leads here
attic.ending = true;

const pocket = makeChoice('Pick up the key', hall.id);
pocket.gives = [key.id]; // choices can hand out items
const open = makeChoice('Open the vault', vault.id);
open.needs = [key.id]; // ...and require them
const leave = makeChoice('Walk away', ''); // a choice that goes nowhere yet

hall.choices.push(pocket, open, leave);
story.passages.push(vault, attic);

const result = analyze(normalizeProject(story));
console.log('problems:', result.problems.map(p => p.msg));
console.log('warnings:', result.warnings.map(p => p.msg));
console.log('endings :', result.endings);
console.log('can the vault ever be reached?', result.why(vault.id).reachable);
console.log('can the attic?                 ', result.why(attic.id).reachable);
