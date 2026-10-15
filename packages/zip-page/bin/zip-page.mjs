#!/usr/bin/env node
/* zip-page: shrink one HTML file into a page that unzips itself when opened.

     zip-page in.html out.html        (use - for in.html to read standard input)

   Needs only Node 18 or newer. For the very smallest output, the editor's own build uses Zopfli (see editor/build.py); this tool uses zlib level 9.

   Copyright (c) 2026 LFC Foundry. MIT License. */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { zippedPage } from '../src/index.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: zip-page in.html out.html');
  process.exit(2);
}
const html = readFileSync(input === '-' ? 0 : input, 'utf8');
const packed = deflateRawSync(Buffer.from(html, 'utf8'), { level: 9 }).toString('base64');
const title = (/<title>([\s\S]*?)<\/title>/.exec(html) || [0, 'Page'])[1];
const page = zippedPage(packed, title);
writeFileSync(output, page);
console.log(`${Buffer.byteLength(html).toLocaleString('en-US')} bytes -> ${Buffer.byteLength(page).toLocaleString('en-US')} bytes (${Math.round((100 * Buffer.byteLength(page)) / Buffer.byteLength(html))}%)`);
