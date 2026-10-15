/* Finds an npm package (puppeteer, playwright) without the caller knowing where it is installed.
   Order: a plain require (this folder's node_modules, parents, NODE_PATH), then the folder named by QA_NODE_MODULES,
   then /opt/npm-tools/node_modules (a shared tools folder some CI images use).

   Copyright (c) 2026 LFC Foundry. MIT License. */
const path = require('path');

const extraDirs = () => [process.env.QA_NODE_MODULES, '/opt/npm-tools/node_modules'].filter(Boolean);

function load(name) {
  try { return require(name); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  for (const dir of extraDirs()) {
    try { return require(path.join(dir, name)); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  throw new Error(`Cannot find the "${name}" package. Install it (npm i ${name}) or point QA_NODE_MODULES / NODE_PATH at a node_modules folder that has it.`);
}

/** the folder of an installed package, or '' (used to reach a sibling such as playwright-core) */
function dirOf(name) {
  for (const dir of [null, ...extraDirs()]) {
    try { return path.dirname(require.resolve(name + '/package.json', dir ? { paths: [dir] } : undefined)); } catch (e) { /* try the next */ }
  }
  return '';
}

module.exports = { load, dirOf };
