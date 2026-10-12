import { writeFileSync } from 'node:fs';
import { makeProject, makeChoice, makePassage, normalizeProject, storyFind, storyReplace, storyStats, storyManuscript, storyOrder, exportStory } from '../dist/story-format.mjs';

// Build a story in code ...
const story = makeProject('The Lantern');
const [shore] = story.passages;
shore.name = 'The shore';
shore.blocks[0].text = 'A lantern glows on the far rocks. The tide is coming in.';
const rocks = makePassage('The rocks');
rocks.ending = true;
rocks.valence = 'good';
rocks.blocks[0].text = 'You reach the lantern as the first wave breaks behind you.';
shore.choices.push(makeChoice('Wade out to the lantern', rocks.id));
story.passages.push(rocks);

// ... clean anything (hand-written, AI-written, old, damaged) into a safe project ...
const project = normalizeProject(story);

// ... and work with it.
console.log(storyStats(project)); // { pages, items, givens, choices, words, good, bad }
console.log(storyFind(project, 'lantern')); // every place the word occurs
storyReplace(project, 'lantern', 'lighthouse'); // replace all, in place
console.log(storyOrder(project).map(o => '  '.repeat(o.depth) + o.id)); // pages in reading order
console.log(storyManuscript(project)); // the whole story as plain text (Markdown)

// The compact form a game ships with: no editor-only fields, ids shortened by buildGameHtml
writeFileSync(new URL('lantern.story.json', import.meta.url), JSON.stringify(project, null, 2));
console.log(JSON.stringify(exportStory(project)).length, 'bytes of game data');
