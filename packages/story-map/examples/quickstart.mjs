import { writeFileSync } from 'node:fs';
import { makeProject, makePassage, makeChoice, normalizeProject, layoutStory, toSvg, playtest, mapMetrics } from '../dist/story-map.mjs';

// A small branching story: a fork that merges again, then two endings.
const story = makeProject('Fork');
const [a] = story.passages;
a.name = 'Opening';
const left = makePassage('Left road');
const right = makePassage('Right road');
const gate = makePassage('The gate');
const win = makePassage('Home');
const lose = makePassage('Lost');
win.ending = true;
win.valence = 'good';
lose.ending = true;
lose.valence = 'bad';
a.choices.push(makeChoice('Go left', left.id), makeChoice('Go right', right.id));
left.choices.push(makeChoice('On', gate.id));
right.choices.push(makeChoice('On', gate.id));
gate.choices.push(makeChoice('Knock', win.id), makeChoice('Run', lose.id));
story.passages.push(left, right, gate, win, lose);
const project = normalizeProject(story);

// 1. A picture
const layout = layoutStory(project, { view: 'flow' }); // or 'down' | 'spine'
writeFileSync(new URL('fork.svg', import.meta.url), toSvg(layout, project));

// 2. How would 1,000 random players do? (seeded: same numbers every time)
const sim = playtest(project, { runs: 1000, mode: 'random' });
console.log('how runs ended:', sim.outcome);

// 3. How good is the drawing? Scores run from 0 to 1.
console.log('drawing quality:', mapMetrics(layout, 0, {}, null, false).scores);
