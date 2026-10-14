/* Shrinks the editor's own script and styles for the finished file: comments, spacing and the names of local variables and parameters
   (measured 2026-10-14: 551,832 -> 509,265 bytes plain, 229,939 -> 224,159 packed). Top-level names (functions, constants, the kl* rules) stay
   as they are, because esbuild never renames them in a plain script: the exported games copy the rule functions by their text and the error log
   in the Speed report names the functions an error passed through. Structure is unchanged (no syntax rewriting).
   Usage: node minify.mjs js|css < input > output.
   build.py runs it unless the environment variable STORY_READABLE is set (handy when hunting a bug in the browser). */
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';

const kind = process.argv[2];
const source = readFileSync(0, 'utf8');
const out =
  kind === 'css'
    ? transformSync(source, { loader: 'css', minify: true, target: ['chrome98', 'safari15', 'firefox98'] }).code
    : transformSync(source, { minifyWhitespace: true, minifyIdentifiers: true, target: 'es2020', legalComments: 'none' }).code;
process.stdout.write(out);
