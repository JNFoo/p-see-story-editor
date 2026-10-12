/* Keeps the code samples in the READMEs identical to the example files that the tests run.

   In a README, a sample looks like this (the lines between the markers are rewritten):
     <!-- include: examples/quickstart.mjs -->
     ```js
     ...
     ```
     <!-- /include -->

   node tools/docs.mjs          rewrite every README under packages/
   node tools/docs.mjs --check  change nothing; exit 1 if a README is out of date

   Copyright (c) 2026 JNFoo. MIT License. */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const CHECK = process.argv.includes('--check');
const stale = [];
const re = /<!-- include: (\S+) -->\n```(\w*)\n[\s\S]*?```\n<!-- \/include -->/g;

for (const dir of readdirSync(join(root, 'packages'))) {
  const file = join(root, 'packages', dir, 'README.md');
  if (!existsSync(file)) continue;
  const old = readFileSync(file, 'utf8');
  const next = old.replace(re, (_, path, lang) => {
    const code = readFileSync(join(dirname(file), path), 'utf8').replace(/\n+$/, '');
    return `<!-- include: ${path} -->\n\`\`\`${lang}\n${code}\n\`\`\`\n<!-- /include -->`;
  });
  if (next !== old) {
    if (CHECK) stale.push(`packages/${dir}/README.md`);
    else writeFileSync(file, next);
  }
}
if (stale.length) {
  console.error('README samples are out of date (run: npm run docs):\n  ' + stale.join('\n  '));
  process.exit(1);
}
console.log(CHECK ? 'README samples are up to date' : 'README samples written');
