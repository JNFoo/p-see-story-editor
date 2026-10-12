import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipInflate, zippedPage, zipPage } from '../dist/zip-page.mjs';
import { loadEditor } from '../../qa-kit/src/editor-vm.mjs';

const ed = loadEditor(['zipInflate', 'zippedPage']);

/* a repeatable stream of "random" numbers */
let a = 99;
const rnd = () => (a = (Math.imul(a, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
const words = ['story', 'page', 'choice', 'ünïcödé', '日本語', '😀', '<div class="x">', '&amp;', '\n', '   ', 'the', 'and'];
const text = n => Array.from({ length: n }, () => words[Math.floor(rnd() * words.length)]).join(' ');

test('zipInflate matches zlib on 120 inputs: empty, tiny, repetitive, Unicode, large, stored/fixed/dynamic blocks', () => {
  const cases = ['', 'a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ...Array.from({ length: 117 }, (_, i) => text(i * 37 + 3))];
  cases.forEach((t, i) => {
    for (const level of [0, 1, 9]) {
      const packed = deflateRawSync(Buffer.from(t, 'utf8'), { level });
      assert.equal(zipInflate(packed), t, `case ${i} level ${level}`);
    }
  });
});

test('same answers as the editor, and the wrapper page runs the same steps', () => {
  const packed = deflateRawSync(Buffer.from(text(500), 'utf8'));
  assert.equal(zipInflate(packed), ed.zipInflate(packed));
  /* the wrapper embeds the inflater's source, which the bundler may print differently, so compare everything around it */
  const strip = page => page.replace(/\(function\(\)\{var u=[\s\S]*?\}\)\(\)/, 'BOOT');
  assert.equal(strip(zippedPage('QUJD', 'T')), strip(ed.zippedPage('QUJD', 'T')));
});

test('the wrapper page keeps the title and holds the data', () => {
  const page = zippedPage('QUJD', 'My <b>title');
  assert.match(page, /<title>My <b>title<\/title>/); // the caller escapes; the title is used as given
  assert.match(page, /id="z">\nQUJD\n<\/script>/);
});

test('zipPage (browser-style, CompressionStream) round-trips', async () => {
  const html = `<!doctype html><title>Hi</title><p>${text(2000)}</p>`;
  const z = await zipPage(html);
  const b64 = /id="z">\n([\s\S]*?)<\/script>/.exec(z)[1].replace(/\s/g, '');
  assert.equal(inflateRaw(b64), html);
  assert.match(z, /<title>Hi<\/title>/);
});
const inflateRaw = b64 => zipInflate(Buffer.from(b64, 'base64'));

test('the zip-page command line tool shrinks a real page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zp-'));
  const src = join(dir, 'in.html');
  const html = `<!doctype html><title>Big</title><p>${text(6000)}</p>`;
  writeFileSync(src, html);
  execFileSync(process.execPath, [new URL('../bin/zip-page.mjs', import.meta.url).pathname, src, join(dir, 'out.html')]);
  const out = readFileSync(join(dir, 'out.html'), 'utf8');
  assert.ok(out.length < html.length * 0.6);
  assert.equal(inflateRaw(/id="z">\n([\s\S]*?)<\/script>/.exec(out)[1].replace(/\s/g, '')), html);
});
