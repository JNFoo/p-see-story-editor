/* Page colors and notes: set from the Write tab, shown as a dot in the page list and a stripe and note icon on the map, listed in the
   map tip, kept in the saved story, and absent from the exported game. Usage: node marks.js [chromium|firefox]   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_marks_test"');
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1200, height: 850 }, locale: 'en-US' });
  await ctx.addInitScript(([s, st]) => { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); localStorage.setItem('story-editor-v1', s); } }, [sample, SETTINGS]);
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(300);
  const proj = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__editor.project)));
  const open = name => pg.evaluate(n => { const e = window.__editor; e.openPage(e.project.passages.find(p => p.name === n)); }, name);

  await open('Shore'); await pg.waitForTimeout(300);
  await pg.locator('button[aria-label="Color and note"]').click(); await pg.waitForTimeout(300);
  ok(/Color and note for .Shore./.test(await pg.evaluate(() => document.querySelector('dialog.dlg[open]')?.innerText || '')), 'the Color and note window opens for the open page');
  await pg.locator('.pcswatch[data-c="green"]').click();
  await pg.locator('textarea.pcnote').fill('Needs a stronger first line');
  await pg.locator('dialog.dlg button:has-text("Done")').click(); await pg.waitForTimeout(300);
  let p = await proj(); const shore = p.passages.find(q => q.name === 'Shore');
  ok(shore.color === 'green' && shore.note === 'Needs a stronger first line', 'the color and the note are on the page: ' + [shore.color, shore.note]);
  ok(await pg.evaluate(() => !!document.querySelector('#pages .pcdot')), 'a colored dot shows in the page list');

  await pg.evaluate(() => window.__editor.setView('map')); await pg.waitForTimeout(900);
  const onMap = await pg.evaluate(() => ({ stripe: document.querySelectorAll('.node rect.pcol.pc-green').length, note: document.querySelectorAll('.node .nnote').length }));
  ok(onMap.stripe === 1 && onMap.note === 1, 'the map shows one green stripe and one note icon: ' + JSON.stringify(onMap));
  const tip = await pg.evaluate(() => { const g = document.querySelector('.node rect.pcol')?.parentNode; return g ? (g.querySelector('title')?.textContent || '') : ''; });
  ok(/Your note: Needs a stronger first line/.test(tip), 'the map tip repeats the note');

  /* undo takes the marks off again; the saved story round-trips; the game never sees them */
  await pg.evaluate(() => window.__editor.setView('write')); await pg.waitForTimeout(300);
  const exp = await pg.evaluate(() => { const s = JSON.stringify(exportStory(window.__editor.project)); return { has: /Needs a stronger|"color"|"note"/.test(s) }; });
  ok(!exp.has, 'the exported game data holds neither the color nor the note');
  const back = await pg.evaluate(() => { const r = normalizeProject(JSON.parse(JSON.stringify(window.__editor.project))); const q = r.passages.find(x => x.name === 'Shore'); return [q.color, q.note]; });
  ok(back[0] === 'green' && back[1] === 'Needs a stronger first line', 'a saved and reopened story keeps them');
  const bad = await pg.evaluate(() => { const r = JSON.parse(JSON.stringify(window.__editor.project)); r.passages[0].color = 'plaid'; r.passages[0].note = 'x'.repeat(5000); const n = normalizeProject(r); return [n.passages[0].color, n.passages[0].note.length]; });
  ok(bad[0] === '' && bad[1] === 600, 'an unknown color is dropped and a long note is cut to 600 characters: ' + bad);
  await open('Shore'); await pg.waitForTimeout(200);
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  p = await proj();
  ok(p.passages.find(q => q.name === 'Shore').note !== 'Needs a stronger first line' || p.passages.find(q => q.name === 'Shore').color !== 'green', 'Undo takes back the last mark');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crash: ' + (e.stack || e)); process.exit(1); });
