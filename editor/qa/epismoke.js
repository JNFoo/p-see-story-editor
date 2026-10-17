/* A short look at the editor in GNOME Web (Epiphany), the fourth approved test browser. GNOME Web refuses WebDriver clicks, so every click here is a script click
   (element.click() in the page) and the typing is a script too; what is checked is that the editor loads, saves, switches views, survives a reload and builds a game.
   Usage: WEBKIT=epiphany node epismoke.js webkit   (qa.js full runs it by itself)   Copyright (c) 2026 LFC Foundry. MIT License. */
process.env.WEBKIT = 'epiphany';
const B = require('./engine').pick('webkit');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  console.log('browser: ' + require('../../packages/qa-kit/src/webkit.js').version());
  const ctx = await b.newContext({ viewport: { width: 1200, height: 850 } });
  await ctx.addInitScript(s => { try { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', s); } } catch (e) {} }, SETTINGS);
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  const ready = () => pg.waitForFunction(() => window.__editor && !document.getElementById('splash') && document.querySelector('#title'), null, { timeout: 30000 });
  const click = sel => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
  const stored = () => pg.evaluate(() => { try { return JSON.parse(localStorage.getItem('story-editor-v1')).title; } catch (e) { return null; } });
  await pg.goto(EDITOR); await ready();
  const sess = (pg.pp && pg.pp.wd && pg.pp.wd.version) || 'unknown'; console.log('the browser session says: ' + sess); /* the user agent does not name GNOME Web; the driver's session does */
  ok(/Epiphany/i.test(sess), 'this really is GNOME Web (the session reports ' + sess + ')');
  ok(true, 'the editor opens');
  /* typing: a script sets the box and sends the input event, as a keystroke would */
  await pg.evaluate(() => { const t = document.querySelector('#title'); t.focus(); t.value = 'GNOME Web smoke'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('story-editor-v1')).title === 'GNOME Web smoke'; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
  ok(await stored() === 'GNOME Web smoke', 'a title typed in the box is saved in the browser: ' + await stored());
  /* the Map view opens */
  ok(await click('#tabs [data-tab=map]'), 'the Map tab is there');
  await pg.waitForFunction(() => document.querySelector('.mapbox'), null, { timeout: 8000 }).catch(() => {});
  ok(await pg.evaluate(() => !!document.querySelector('.mapbox')), 'a script click on Map shows the map');
  ok(await click('#tabs [data-tab=check]'), 'the Check tab is there');
  await pg.waitForFunction(() => !document.querySelector('.mapbox'), null, { timeout: 8000 }).catch(() => {});
  ok(await pg.evaluate(() => !document.querySelector('.mapbox')), 'and Check leaves the map');
  /* a reload keeps the story */
  await pg.reload(); await ready();
  ok(await pg.evaluate(() => document.querySelector('#title').value) === 'GNOME Web smoke', 'after a reload the title is still there');
  /* build a game: Menu > Copy game code shows the page, which carries the policy with WebAssembly allowed */
  ok(await click('#menubtn'), 'the Menu button is there');
  await pg.waitForFunction(() => [...document.querySelectorAll('#menupop button')].some(x => /Copy game code/.test(x.textContent)), null, { timeout: 8000 }).catch(() => {});
  ok(await pg.evaluate(() => { const x = [...document.querySelectorAll('#menupop button')].find(y => /Copy game code/.test(y.textContent)); if (x) x.click(); return !!x; }), 'Copy game code is in the menu');
  await pg.waitForFunction(() => document.querySelector('dialog textarea') && document.querySelector('dialog textarea').value.length > 1000, null, { timeout: 20000 }).catch(() => {});
  const html = await pg.evaluate(() => { const t = document.querySelector('dialog textarea'); return t ? t.value : ''; });
  ok(html.length > 1000 && /Content-Security-Policy/.test(html) && /script-src 'unsafe-inline' 'wasm-unsafe-eval';/.test(html), `the game code is a whole page (${html.length} characters) with the policy that allows WebAssembly`);
  ok(!errs.length, 'no errors: ' + errs.join('; '));
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); await b.close(); process.exit(fails ? 1 : 0);
})();
