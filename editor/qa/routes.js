/* Pinned routes: the Play tab records the pages you played; "Continue where I was" and the pinned routes walk them again after the story
   was edited and stop, in plain words, at the first step that no longer works; the Check tab counts how many pinned routes still work.
   Usage: node routes.js [chromium|firefox]   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_routes_test"');
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1200, height: 850 }, locale: 'en-US' });
  await ctx.addInitScript(([s, st]) => { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); localStorage.setItem('story-editor-v1', s); } }, [sample, SETTINGS]);
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(300);
  const text = sel => pg.evaluate(s => (document.querySelector(s) || {}).innerText || '', sel);
  const view = async v => { await pg.evaluate(x => window.__editor.setView(x), v); await pg.waitForTimeout(500); };
  const choose = async label => { await pg.locator(`.kl-choices button:has-text("${label}")`).click(); await pg.waitForTimeout(250); };

  await view('play');
  ok(/nothing played yet/.test(await text('.routeline')), 'before anything is played the route row says so');
  await choose('Walk the shoreline'); await choose('tin shed');
  ok(/Route: Start › Shore › Shed/.test(await text('.routeline')), 'the route row follows the pages played: ' + await text('.routeline'));

  /* pin it */
  await pg.locator('.routerow button:has-text("Pin this route")').click(); await pg.waitForTimeout(300);
  ok(/Pin this route/.test(await text('dialog.dlg[open]')), 'the pin window opens');
  await pg.locator('dialog.dlg button:has-text("Pin it")').click(); await pg.waitForTimeout(300);
  ok(/Pinned routes \(1\)/.test(await text('.routerow')), 'the row now counts one pinned route');

  /* a fresh run: continue where I was walks all three pages again */
  await view('write'); await view('play');
  await pg.locator('.routerow button:has-text("Continue where I was")').click(); await pg.waitForTimeout(400);
  ok(/all 3 pages replayed/.test(await text('.routenote')), 'with the story unchanged all three pages are replayed: ' + await text('.routenote'));
  ok(/Route: Start › Shore › Shed/.test(await text('.routeline')), 'and the route carries on from there');
  ok(/red box|Open the red box/i.test(await text('.playbox')), 'the player stands on the Shed page');

  /* edit the story: the Shore page loses its choice to the shed */
  await pg.evaluate(() => { const p = window.__editor.project; const shore = p.passages.find(q => q.name === 'Shore'); shore.choices = shore.choices.filter(c => !/shed/i.test(c.label)); window.__editor.refresh(); });
  await view('check');
  const check = await text('#main');
  ok(/Pinned routes \(0 of 1 still work\)/.test(check), 'the Check tab says 0 of 1 pinned routes still work');
  ok(/no longer has a choice that leads to .Shed./.test(check), 'and says why in plain words');

  await view('play');
  await pg.locator('.routerow button:has-text("Continue where I was")').click(); await pg.waitForTimeout(400);
  const note = await text('.routenote');
  ok(/Back at .Shore. after 2 of 3 pages/.test(note) && /no longer has a choice/.test(note), 'continue stops on the last page that still works and says why: ' + note);
  ok(/Shore|rocks|shoreline/i.test(await text('.playbox')), 'the player stands on the Shore page');

  /* a deleted page and a lock */
  await pg.evaluate(() => { const p = window.__editor.project; p.passages.find(q => q.name === 'Shore').choices.push({ label: 'Back to the shed', to: p.passages.find(q => q.name === 'Shed').id, needs: [p.items[0].id], forbid: [], gives: [], takes: [], adds: {}, check: null, lock: false, why: '' }); window.__editor.refresh(); });
  await view('check');
  ok(/now needs Lantern/.test(await text('#main')), 'a choice that now needs something names it: ' + (await text('#main')).slice(0, 0));
  await pg.evaluate(() => window.__editor.openPage(window.__editor.project.passages[0]));
  await pg.evaluate(() => { const p = window.__editor.project; const i = p.passages.findIndex(q => q.name === 'Shed'); const id = p.passages[i].id; p.passages.splice(i, 1); p.passages.forEach(q => q.choices.forEach(c => { if (c.to === id) c.to = ''; })); window.__editor.refresh(); });
  await view('check');
  ok(/page .Shed. is gone/.test(await text('#main')), 'a deleted page is named as gone');

  /* the pinned list can remove it */
  await view('play');
  await pg.locator('.routerow button:has-text("Pinned routes")').click(); await pg.waitForTimeout(300);
  ok(/Pinned routes/.test(await text('dialog.dlg[open]')) && /Remove/.test(await text('dialog.dlg[open]')), 'the pinned list opens with a Remove button');
  await pg.locator('dialog.dlg button:has-text("Remove")').click(); await pg.waitForTimeout(300);
  ok(/Nothing pinned yet/.test(await text('dialog.dlg[open]')), 'removing the route empties the list');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crash: ' + (e.stack || e)); process.exit(1); });
