/* npm test: everything that needs no browser and no Python.
     1. the packages are up to date with the editor sources (nothing was edited by hand in a generated file)
     2. the README code samples are identical to the example files
     3. every package's tests (Node's built-in test runner)
     4. the editor's contract test: the checker against brute-force play on random stories
   The browser suites (editor/qa) need Firefox/Chromium and are run separately: see editor/qa/README.md.

   Copyright (c) 2026 JNFoo. MIT License. */
import { spawnSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url).pathname;
const steps = [
  ['packages up to date', ['node', 'tools/extract-packages.mjs', '--check']],
  ['README samples', ['node', 'tools/docs.mjs', '--check']],
  ...readdirSync(root + 'packages')
    .filter(p => existsSync(`${root}packages/${p}/test`))
    .map(p => [`${p} tests`, ['node', '--test', ...readdirSync(`${root}packages/${p}/test`).filter(f => f.endsWith('.test.mjs')).map(f => `packages/${p}/test/${f}`)]]),
  ['editor contract test', ['node', 'editor/contract.mjs', '200', '1']]
];
let bad = 0;
for (const [name, cmd] of steps) {
  const t = Date.now();
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: root, encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${((Date.now() - t) / 1000).toFixed(1).padStart(5)} s  ${name}`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').slice(-25).join('\n'));
}
console.log(bad ? `\n${bad} step(s) failed` : '\nall green');
process.exit(bad ? 1 : 0);
