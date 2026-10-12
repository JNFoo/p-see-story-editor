#!/usr/bin/env node
/* story-player: turn a story file into a game page, or play it in the terminal.

     story-player build story.json game.html [--zip]     write an offline game page (--zip: smaller, unzips itself when opened)
     story-player play  story.json [--seed N]            play it as text; type a choice number, q to quit

   story.json is a story file saved by the Story Editor, or any JSON that follows packages/story-format/story.schema.json.

   Copyright (c) 2026 JNFoo. MIT License. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { buildGame, buildZippedGame, createSession, normalizeProject } from '../src/index.js';

const [cmd, file, out, ...rest] = process.argv.slice(2);
const usage = () => {
  console.error('Usage:\n  story-player build story.json game.html [--zip]\n  story-player play story.json [--seed N]');
  process.exit(2);
};
if (!cmd || !file) usage();

let story;
try {
  story = JSON.parse(readFileSync(file === '-' ? 0 : file, 'utf8'));
  normalizeProject(story);
} catch (e) {
  console.error(`Could not read a story from ${file}: ${e.message}`);
  process.exit(1);
}

if (cmd === 'build') {
  if (!out) usage();
  const html = rest.includes('--zip') ? await buildZippedGame(story) : buildGame(story);
  writeFileSync(out, html);
  console.log(`Wrote ${out} (${Buffer.byteLength(html).toLocaleString('en-US')} bytes). Open it in any browser; it works offline.`);
} else if (cmd === 'play') {
  const args = [out, ...rest].filter(Boolean);
  const si = args.indexOf('--seed');
  let a = si >= 0 ? +args[si + 1] : Date.now();
  const rng = () => ((a = (Math.imul(a, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff); // a repeatable roll of the dice
  const s = createSession(normalizeProject(story), { rng });
  const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
  const show = () => {
    console.log(`\n${s.page.heading || s.page.name}\n${s.text.join('\n\n')}`);
    if (s.ended) return console.log(`\n— The end${s.page.valence ? ` (${s.page.valence})` : ''} —`);
    s.choices.forEach(c => console.log(`  ${c.index + 1}. ${c.label}${c.odds !== null ? ` [dice check: ${c.odds}%]` : ''}${c.locked ? ` (locked${c.why ? `: ${c.why}` : ''})` : ''}`));
    process.stdout.write('> ');
  };
  show();
  for await (const line of { [Symbol.asyncIterator]: () => lines }) {
    const ans = line.trim();
    if (ans === 'q' || s.ended) break;
    try {
      const r = s.choose(+ans - 1);
      if (r.roll) console.log(`  You rolled ${r.roll}: ${r.passed ? 'success' : 'failure'}.`);
    } catch (e) {
      console.log(`  ${e.message}`);
    }
    show();
    if (s.ended) break;
  }
  process.exit(0);
} else usage();
