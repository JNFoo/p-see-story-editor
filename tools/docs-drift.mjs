/* Docs drift check: every file name a Markdown file mentions (in `backticks` or as a link) must exist in the repository.
   Run by npm test. A name counts as found when a tracked file has that exact path (from the repository root or from the Markdown file's
   own folder) or, for a bare name with no folder, when any tracked file has that name.
   Not checked: URLs, names with * or <> or $ in them, files the build makes (BUILT below), and the two documents that record history
   on purpose (docs/CHANGELOG.md, docs/OPTIMIZATION-CHART.md): they name files that have since gone.
   Usage: node tools/docs-drift.mjs [--list]    Exit code 1 and the list of broken names when any are missing.
   Copyright (c) 2026 LFC Foundry. MIT License. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
const tracked = git('ls-files');
const have = new Set(tracked);
const bases = new Set(tracked.map(f => path.basename(f)));
const HISTORY = new Set(['docs/CHANGELOG.md', 'docs/OPTIMIZATION-CHART.md']);
/* made by a build or a test run, or kept outside this repository on purpose */
const BUILT = new Set(['story-editor.html', 'story-editor.packed.html', 'counts.json', 'times.json', 'sizes-last.json', 'package-lock.json', 'CLAUDE.md']);
/* other repositories' files, and made-up example names in how-to text */
const ELSEWHERE = n => n === 'TASKS.md' || n.startsWith('JS-modules/') || ['something.html', 'game.html'].includes(n);
const EXT = /\.(md|js|mjs|cjs|json|py|css|html|txt|sh|zip)$/;

const broken = [];
for (const md of tracked.filter(f => f.endsWith('.md') && !HISTORY.has(f))) {
  const text = readFileSync(root + md, 'utf8');
  const names = new Set();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) names.add(m[1].trim());
  for (const m of text.matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) names.add(m[1].trim());
  for (let n of names) {
    if (/^[a-z]+:\/\//i.test(n) || /[*<>$|{}()\s=;,'"]/.test(n) || !EXT.test(n) || n.startsWith('.') || ELSEWHERE(n.replace(/^\.\//, ''))) continue;
    n = n.replace(/^\.\//, '').replace(/\/$/, '');
    if (BUILT.has(path.basename(n))) continue;
    const here = path.posix.normalize(path.posix.join(path.posix.dirname(md), n));
    if (have.has(n) || have.has(here)) continue;
    if (!n.includes('/') && bases.has(n)) continue;
    if (n.includes('/') && tracked.some(f => f.endsWith('/' + n))) continue;
    broken.push(`${md}: ${n}`);
  }
}
if (process.argv.includes('--list') || broken.length) console.log(broken.join('\n'));
if (broken.length) {
  console.error(`\n${broken.length} file name(s) in the documents do not exist in the repository. Fix the name, remove the sentence, or (for a build product) add it to BUILT in tools/docs-drift.mjs.`);
  process.exit(1);
}
console.log('docs drift check ok: every file name in the documents exists');
