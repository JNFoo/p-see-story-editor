/* Loads the editor's own sources (editor/core.js, editor/player.js, editor/maplayout.js) into a sandbox and hands back their functions.
   The packages are cut from those same files, so tests use this to prove a package gives exactly the editor's answers.

     import { loadEditor } from './editor-vm.mjs';
     const ed = loadEditor(['normalizeProject', 'analyze']);   // names to pull out of the sandbox
     ed.analyze(project)

   Copyright (c) 2026 JNFoo. MIT License. */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const EDITOR = new URL('../../../editor/', import.meta.url);

export function loadEditor(names, files = ['core.js', 'player.js', 'maplayout.js']) {
  const ctx = createContext({ console, TextDecoder, TextEncoder });
  const src = files.map(f => readFileSync(new URL(f, EDITOR), 'utf8')).join('\n');
  runInContext(`${src}\nthis.__out = { ${names.join(', ')} };`, ctx);
  return ctx.__out;
}
