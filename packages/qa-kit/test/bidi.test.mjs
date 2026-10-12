import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const firefoxPath = process.env.FIREFOX_PATH || process.env.FIREFOX_158;
let puppeteerOk = true;
try {
  require('puppeteer');
} catch (e) {
  puppeteerOk = false;
}
const skip = !firefoxPath || !puppeteerOk ? 'needs puppeteer (npm i puppeteer) and FIREFOX_PATH pointing at stock Firefox' : false;

const PAGE = 'data:text/html,' + encodeURIComponent(`<!doctype html><title>t</title>
<button id=a onclick="document.getElementById('out').textContent='clicked '+(++n)">Save</button>
<button class=other>Other <b>thing</b></button>
<input id=name><div id=out></div><ul><li>one</li><li>two</li><li>three</li></ul>
<script>var n=0</script>`);

test('Playwright-style calls drive stock Firefox', { skip }, async () => {
  const { firefox } = require('../src/bidi.js');
  const browser = await firefox.launch();
  try {
    const page = await browser.newPage();
    await page.goto(PAGE);
    await page.click('text=Save');
    assert.equal(await page.locator('#out').textContent(), 'clicked 1');
    await page.click('button:has-text("Other")');
    await page.fill('#name', 'hello');
    assert.equal(await page.locator('#name').inputValue(), 'hello');
    assert.equal(await page.locator('li >> nth=-1').textContent(), 'three');
    assert.equal(await page.locator('li').count(), 3);
    assert.deepEqual(await page.$$eval('li', els => els.map(e => e.textContent)), ['one', 'two', 'three']);
    await page.keyboard.press('Control+a');
  } finally {
    await browser.close();
  }
});

test('genstory is repeatable and editor-vm loads the editor', async () => {
  const { makeGenStory } = await import('../src/genstory.mjs');
  const { loadEditor } = await import('../src/editor-vm.mjs');
  const ed = loadEditor(['normalizeProject']);
  const gen = makeGenStory(ed.normalizeProject);
  assert.equal(JSON.stringify(gen(11)), JSON.stringify(gen(11)));
  assert.notEqual(JSON.stringify(gen(11)), JSON.stringify(gen(12)));
});
