#!/usr/bin/env node
/* twine-to-story: turn a Twine story into a story file for this format.

     twine-to-story story.html                 writes story.story.json next to it, and prints what was and was not converted
     twine-to-story story.twee -o out.json     choose the output file ("-" writes the JSON to the screen)
     twine-to-story story.html --keep-code     keep the story's own code as flagged text instead of turning it into rules
     twine-to-story archive.html --list        list the stories in a Twine library archive
     twine-to-story archive.html --story 2     convert the second story of an archive

   Reads Twine 2 HTML (a published story or a library archive), Twee 3 text, and Twine 1 HTML. SugarCube (and Twine 1) and Harlowe code is
   translated into flags, numbers and conditions as far as the rules can say it; everything else stays as flagged text and is listed.
   Nothing in the story is run.

   Copyright (c) 2026 LFC Foundry. MIT License. */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { importTwine, twineRead } from '../dist/story-format.mjs';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const value = n => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith('-') && !['-o', '--story'].includes(args[i - 1]));
if (!file || flag('--help') || flag('-h')) {
  console.error('Usage:\n  twine-to-story story.html|story.twee [-o out.story.json] [--keep-code] [--story N] [--list]');
  process.exit(file ? 0 : 2);
}
let text;
try {
  text = readFileSync(file, 'utf8');
} catch (e) {
  console.error(`Could not read ${file}: ${e.message}`);
  process.exit(1);
}
try {
  if (flag('--list')) {
    twineRead(text).stories.forEach((s, i) => console.log(`${i + 1}. ${s.name || 'Untitled story'} (${s.passages.length} passages)`));
    process.exit(0);
  }
  const n = value('--story') === undefined ? 1 : Math.floor(Number(value('--story')));
  if (!(n >= 1)) throw new Error('--story needs a number from 1, such as --story 2.');
  const r = importTwine(text, { code: flag('--keep-code') ? 'text' : 'rules', story: n - 1 });
  const json = JSON.stringify(r.project, null, 2) + '\n';
  const out = value('-o') || `${basename(file).replace(/\.[^.]*$/, '')}.story.json`;
  if (out === '-') process.stdout.write(json);
  else {
    writeFileSync(out, json);
    console.error(`Wrote ${out}.`);
  }
  r.report.forEach(l => console.error(`- ${l}`));
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
