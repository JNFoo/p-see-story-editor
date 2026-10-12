/* Shrinks the editor's own script and styles for the finished file: comments and spacing only (names and structure stay as they are,
   so the shipped code behaves exactly like the readable sources). Usage: node minify.mjs js|css < input > output.
   build.py runs it unless the environment variable STORY_READABLE is set (handy when hunting a bug in the browser). */
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';

const kind = process.argv[2];
const source = readFileSync(0, 'utf8');
const out =
  kind === 'css'
    ? transformSync(source, { loader: 'css', minify: true, target: ['chrome98', 'safari15', 'firefox98'] }).code
    : transformSync(source, { minifyWhitespace: true, target: 'es2020', legalComments: 'none' }).code;
process.stdout.write(out);
