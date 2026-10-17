import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const have = c => { try { execFileSync('sh', ['-c', 'command -v ' + c], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
const skip = have('WebKitWebDriver') && have('xvfb-run') && have('dbus-run-session') ? false : 'needs WebKitWebDriver, xvfb-run and dbus-run-session (WebKitGTK on Linux)';

const PAGE = `<!doctype html><title>t</title>
<button id=a onclick="document.getElementById('out').textContent='clicked '+(++n)">Save</button>
<input id=name><div id=out></div><ul><li>one</li><li>two</li><li>three</li></ul>
<script>var n=0</script>`;

test('Playwright-style calls drive WebKitGTK', { skip }, async () => {
  const { webkit, version } = require('../src/webkit.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-kit-wk-'));
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(file, PAGE);
  const browser = await webkit.launch();
  try {
    assert.match(version(), /^WebKitGTK \d/);
    const page = await browser.newPage();
    await page.goto('file://' + file);
    await page.click('text=Save');
    assert.equal(await page.locator('#out').textContent(), 'clicked 1');
    await page.fill('#name', 'hello');
    assert.equal(await page.locator('#name').inputValue(), 'hello');
    assert.equal(await page.locator('li >> nth=-1').textContent(), 'three');
    assert.equal(await page.locator('li').count(), 3);
    await page.keyboard.press('Control+a');
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
