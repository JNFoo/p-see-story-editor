import { parseOutline, outlineToProject } from '../dist/story-outline.mjs';

// Page names at the left edge. Indented lines with an arrow are choices; other indented lines are paragraphs.
// "(ending)", "(good ending)" or "(bad ending)" after a page name makes it an ending.
const outline = `Start
  The ferry leaves you on the rock. Fog is coming in.
  Walk to the lighthouse → Lighthouse door
  Wait for the next ferry → Cold night
Lighthouse door
  The door is open a hand's width.
  Go in → Hall
Cold night (bad ending)
  The ferry never comes.
Hall (good ending)
  A lamp burns at the top of the stairs.`;

// Just read it: pages, choices and a list of anything that could not be used.
const parsed = parseOutline(outline);
console.log(parsed.pages.map(p => `${p.name}: ${p.choices.length} choices`), parsed.issues);

// Or make a whole story at once. The first page becomes the start page.
const { project, issues } = outlineToProject(outline, 'The Rock');
console.log(project.title, project.passages.length, 'pages, start is', project.passages.find(p => p.id === project.start).name, issues);
