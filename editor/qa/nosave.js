/* A game whose browser will not keep its save (private window, blocked site data, full disk) says so on the page; a game that can save does not.
   Usage: node nosave.js [firefox|chromium]   (the game is made with packages/story-player, so run "npm run build" at the repo root first)
   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox';
const B = require('./engine').pick(which), fs = require('fs'), path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const { buildGame } = await import('../../packages/story-player/src/index.js');
  const story = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.story.json'), 'utf8'));
  const file = path.join(__dirname, 'work', `nosave-${which}.html`);
  fs.writeFileSync(file, buildGame(story));
  const url = 'file://' + file;
  const b = await B.launch();
  async function open(init) {
    const ctx = await b.newContext(); if (init) await ctx.addInitScript(init);
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url); await pg.waitForSelector('.kl-page', { timeout: 15000 }); return { pg, ctx, errs };
  }
  const note = pg => pg.locator('.kl-nosave').count();
  /* 1. normal browser: no note, and a move is remembered */
  let t = await open();
  ok(await note(t.pg) === 0, 'saving works: no note on the first page');
  await t.pg.locator('.kl-choices button').first().click(); await t.pg.waitForTimeout(150);
  ok(await note(t.pg) === 0, 'saving works: no note after a move');
  ok(t.errs.length === 0, 'no errors'); await t.ctx.close();
  /* 2. storage refuses every write from the start (private window, blocked site data) */
  t = await open(() => { Storage.prototype.setItem = function () { throw new DOMException('blocked', 'SecurityError'); }; });
  ok(await note(t.pg) === 1, 'storage refuses writes: the note shows on the first page');
  const said = await t.pg.locator('.kl-nosave').innerText();
  ok(/not saving your place/.test(said) && /start over/.test(said), 'the note says what it means: ' + said.slice(0, 60));
  await t.pg.locator('.kl-choices button').first().click(); await t.pg.waitForTimeout(150);
  ok(await note(t.pg) === 1, 'the note stays on the next page, once');
  ok(await t.pg.locator('.kl-choices button').count() > 0, 'the game is still playable');
  ok(t.errs.length === 0, 'no errors'); await t.ctx.close();
  /* 3. storage fills up after the game has started: the note appears once a save fails */
  t = await open(() => { window.__full = false; const set = Storage.prototype.setItem; Storage.prototype.setItem = function () { if (window.__full) throw new DOMException('full', 'QuotaExceededError'); return set.apply(this, arguments); }; });
  ok(await note(t.pg) === 0, 'disk full later: no note while saving works');
  await t.pg.evaluate(() => { window.__full = true; });
  await t.pg.locator('.kl-choices button').first().click(); await t.pg.waitForTimeout(150);
  await t.pg.locator('.kl-choices button').first().click(); await t.pg.waitForTimeout(150);
  ok(await note(t.pg) === 1, 'disk full later: the note appears after a failed save');
  ok(t.errs.length === 0, 'no errors'); await t.ctx.close();
  await b.close(); console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
