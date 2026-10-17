import { importTwine, twineRead } from '../dist/twine-import.mjs';

// A tiny Twee 3 story, written inline so this example needs no file. Twine 2 HTML, library archives and Twine 1 HTML work the same way.
const twee = `:: StoryTitle
The Lantern Path

:: StoryData
{"ifid":"5B2A3C4D-1111-4222-8333-444455556666","format":"Harlowe","format-version":"3.3.9","start":"Shore"}

:: Shore
(set: $lamp to false)A lantern glows on the far rocks.
[[Pick up the lamp->Lamp]]
[[Wade out->Rocks]]

:: Lamp
(set: $lamp to true)You take the lamp.
[[Wade out->Rocks]]

:: Rocks
(if: $lamp)[The lamp lights your way. You made it.](else:)[You cannot see. The tide wins.]
`;

console.log(twineRead(twee).stories.map(s => s.name)); // which stories the file holds (archives hold several)

// Turn the first story into a story-format project. `code: 'rules'` (the default) turns the story's own code into items and conditions.
const { project, report, summary } = importTwine(twee, { code: 'rules' });
console.log(summary); // { pages, choices, items, unfinished, mode }
console.log(project.items.map(i => i.name)); // the flag the code set, as a real item
report.forEach(line => console.log('-', line)); // plain words: what became rules, what was kept as flagged text
