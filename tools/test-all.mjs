/* npm test: everything that needs no browser and no Python.
     1. the packages are up to date with the editor sources (nothing was edited by hand in a generated file)
     2. the README code samples are identical to the example files
     2b. every file name the documents mention exists (tools/docs-drift.mjs)
     3. every package's tests (Node's built-in test runner)
     4. the editor's contract test: the checker against brute-force play on random stories
   The browser suites (editor/qa) need Firefox/Chromium and are run separately: see editor/qa/README.md.

   Copyright (c) 2026 LFC Foundry. MIT License. */
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const steps = [
  ['packages up to date', ['node', 'tools/extract-packages.mjs', '--check']],
  ['README samples', ['node', 'tools/docs.mjs', '--check']],
  ['docs drift', ['node', 'tools/docs-drift.mjs']],
  ...readdirSync(root + 'packages')
    .filter(p => existsSync(`${root}packages/${p}/test`))
    .map(p => [`${p} tests`, ['node', '--test', ...readdirSync(`${root}packages/${p}/test`).filter(f => f.endsWith('.test.mjs')).map(f => `packages/${p}/test/${f}`)]]),
  ['editor contract test', ['node', 'editor/contract.mjs', '200', '1']]
];
/* Two at a time (the machine has two cores; the longest step, story-map, runs on its own worker from the start). */
const run = ([name, cmd]) =>
  new Promise(done => {
    const t = Date.now();
    const kid = spawn(cmd[0], cmd.slice(1), { cwd: root });
    let out = '';
    kid.stdout.on('data', d => (out += d));
    kid.stderr.on('data', d => (out += d));
    kid.on('close', code => done({ name, ok: code === 0, out, sec: (Date.now() - t) / 1000 }));
  });
let bad = 0;
const queue = steps.slice().sort((a, b) => (/story-map/.test(b[0]) ? 1 : 0) - (/story-map/.test(a[0]) ? 1 : 0));
const worker = async () => {
  for (let step; (step = queue.shift()); ) {
    const r = await run(step);
    if (!r.ok) bad++;
    console.log(`${r.ok ? 'pass' : 'FAIL'}  ${r.sec.toFixed(1).padStart(5)} s  ${r.name}`);
    if (!r.ok) console.log(r.out.split('\n').slice(-25).join('\n'));
  }
};
await Promise.all([worker(), worker()]);
console.log(bad ? `\n${bad} step(s) failed` : '\nall green');
process.exit(bad ? 1 : 0);
