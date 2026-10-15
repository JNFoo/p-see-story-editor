/* Options → Safety (where the story is kept, when it was last saved to a file, ask the browser to keep it), the revision stamp a file save
   writes (both for a picked file and for a plain download), the once-a-week reminder to save a file, and File → Save test script (.md).
   Usage: node safety.js [chromium|firefox]   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
/* the example story's own id is replaced at every start, so the test story gets one of its own */
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_safety_test"');
const SID = JSON.parse(sample).id;
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  /* a context per case; `seed` (when given) is written once, before the page starts */
  const open = async (seed, extra) => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 850 }, locale: 'en-US' });
    await ctx.addInitScript(([s, st, nudge, ex]) => {
      if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); if (s) localStorage.setItem('story-editor-v1', s); if (nudge) localStorage.setItem('story-editor-v1-nudge', nudge); }
      window.__saves = [];
      window.showSaveFilePicker = async o => ({ name: o.suggestedName, createWritable: async () => ({ write: async blob => { window.__saves.push(await blob.text()); }, close: async () => {} }), queryPermission: async () => 'granted' });
      if (ex) (0, eval)(ex);
    }, [seed || null, SETTINGS, (extra && extra.nudge) || null, (extra && extra.script) || null]);
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 });
    await pg.waitForTimeout(300); return pg;
  };
  const dlg = pg => pg.evaluate(() => { const d = document.querySelector('dialog.dlg[open]'); return d ? d.innerText.replace(/\s+/g, ' ') : ''; });
  const openSafety = async pg => { await pg.locator('#optbtn').click(); await pg.locator('#optpop button:has-text("Safety")').click(); await pg.waitForTimeout(500); };
  const toastText = pg => pg.evaluate(() => document.getElementById('toast').innerText.replace(/\s+/g, ' '));

  /* ---- 1. the panel on a story never saved to a file ---- */
  let pg = await open(sample, { script: "navigator.storage.persisted = async () => false; navigator.storage.persist = async () => true;" });
  await openSafety(pg);
  let t = await dlg(pg);
  ok(/Safety/.test(t) && /autosaved here after every change/.test(t), 'the box opens and says the browser autosaves: ' + t.slice(0, 80));
  ok(/has not been saved to a file/.test(t), 'a story never saved to a file says so');
  ok(/not promised/.test(t) && !/checking…/.test(t), 'it says the browser has not promised to keep the autosave, and no line is left on "checking…": ' + t.slice(-170));
  ok(/KB used here, of about \d+ MB/.test(t), 'it shows the space used');
  /* ask the browser to keep it */
  await pg.locator('dialog.dlg button:has-text("Ask the browser")').click(); await pg.waitForTimeout(500);
  ok(/Kept for good: yes/.test(await dlg(pg)) && (await pg.locator('dialog.dlg button:has-text("Ask the browser")').count() === 0 || !(await pg.locator('dialog.dlg button:has-text("Ask the browser")').isVisible())), 'after a yes the box says kept, and the ask button goes away');
  /* Save now: writes the file with revision 1 and the time */
  await pg.locator('dialog.dlg button:has-text("Save now")').click(); await pg.waitForTimeout(800);
  let saves = await pg.evaluate(() => window.__saves);
  ok(saves.length === 1, 'Save now saved once (' + saves.length + ')');
  const f1 = saves.length ? JSON.parse(saves[0]) : {};
  ok(f1.rev === 1 && /^\d{4}-\d\d-\d\dT/.test(f1.savedAt || ''), 'the file carries revision 1 and a time: rev=' + f1.rev + ' savedAt=' + f1.savedAt);
  await openSafety(pg); t = await dlg(pg);
  ok(/Last saved to a file just now/.test(t) && /revision 1/.test(t) && /Nothing has changed since/.test(t), 'the box now reports the save: ' + t.slice(60, 230));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  /* an edit, then the box says so; the second save is revision 2 */
  await pg.fill('#title', 'A new title'); await pg.waitForTimeout(700);
  await openSafety(pg); t = await dlg(pg);
  ok(/changes since that are only in this browser/.test(t), 'after an edit the box says there are changes since the last file save');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  await pg.keyboard.press('Control+s'); await pg.waitForTimeout(800);
  saves = await pg.evaluate(() => window.__saves);
  ok(saves.length === 2 && JSON.parse(saves[1]).rev === 2, 'Ctrl+S writes revision 2 (' + saves.length + ' saves, rev ' + (saves[1] && JSON.parse(saves[1]).rev) + ')');
  ok(/revision 2/.test(await toastText(pg)), 'the toast says revision 2: ' + await toastText(pg));
  /* the revision and time are part of the story: they survive a reload */
  await pg.reload(); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(400);
  const kept = await pg.evaluate(() => { const o = JSON.parse(localStorage.getItem('story-editor-v1')); return [o.rev, o.savedAt, o.id, o.title, Object.keys(localStorage).join('+')]; });
  ok(kept[0] === 2 && !!kept[1], 'the autosave keeps revision 2 and its time across a reload: ' + kept.slice(0, 2));
  if (kept[0] !== 2) console.log('DEBUG', JSON.stringify(kept));
  await pg.context().close();

  /* ---- 2. a save that is only a download also stamps the revision ---- */
  pg = await open(sample);
  await pg.evaluate(() => { window.__blobs = []; const o = URL.createObjectURL.bind(URL); URL.createObjectURL = bl => { window.__blobs.push(bl); return o(bl); }; delete window.showSaveFilePicker; });
  await pg.keyboard.press('Control+s'); await pg.waitForTimeout(1000);
  const dl = await pg.evaluate(async () => { const x = window.__blobs.find(bl => bl.type === 'application/json'); return x ? x.text() : ''; });
  ok(dl && JSON.parse(dl).rev === 1, 'a plain download carries revision 1');
  await openSafety(pg); t = await dlg(pg);
  ok(/Last saved to a file just now/.test(t), 'and the box counts the download as a file save: ' + t.slice(60, 160));
  await pg.context().close();

  /* ---- 3. the reminder ---- */
  const day = 864e5;
  /* a story with words, first seen 8 days ago, never saved to a file: one reminder with a Save now button */
  pg = await open(sample, { nudge: JSON.stringify({ id: SID, first: Date.now() - 8 * day, last: 0 }) });
  await pg.waitForTimeout(3300);
  let tt = await toastText(pg);
  ok(/has not been saved to a file for 8 days/.test(tt) && /Save now/.test(tt), 'a story first seen 8 days ago gets the reminder with Save now: ' + tt);
  await pg.locator('#toast button:has-text("Save now")').click(); await pg.waitForTimeout(800);
  ok((await pg.evaluate(() => window.__saves)).length === 1, 'the reminder\'s Save now saves');
  /* reload at once: not again within a day (the file save also just reset the clock) */
  await pg.reload(); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(3300);
  ok(!/not been saved to a file for/.test(await toastText(pg)), 'no second reminder after saving: ' + await toastText(pg));
  await pg.context().close();
  /* 6 days: too soon. Reminded 2 hours ago: not again. */
  pg = await open(sample, { nudge: JSON.stringify({ id: SID, first: Date.now() - 6 * day, last: 0 }) }); await pg.waitForTimeout(3300);
  ok(!/not been saved to a file for/.test(await toastText(pg)), 'no reminder at 6 days');
  await pg.context().close();
  pg = await open(sample, { nudge: JSON.stringify({ id: SID, first: Date.now() - 30 * day, last: Date.now() - 2 * 3600e3 }) }); await pg.waitForTimeout(3300);
  ok(!/not been saved to a file for/.test(await toastText(pg)), 'no second reminder within a day');
  await pg.context().close();
  /* an almost empty story is never nagged about */
  pg = await open(null, { nudge: JSON.stringify({ id: 'x', first: Date.now() - 30 * day, last: 0 }) }); await pg.waitForTimeout(3300);
  ok(!/not been saved to a file for/.test(await toastText(pg)), 'a new empty story gets no reminder');
  await pg.context().close();

  /* ---- 4. File → Save test script (.md) ---- */
  pg = await open(sample);
  await pg.locator('#menubtn').click(); await pg.locator('#menupop button:has-text("Save test script")').click(); await pg.waitForTimeout(1500);
  const ts = (await pg.evaluate(() => window.__saves))[0] || '';
  ok(/^# Test script: The Keeper’s Light/.test(ts), 'the test script is saved with the story\'s title: ' + ts.slice(0, 40));
  const routesN = (ts.match(/^## Route \d+/gm) || []).length;
  ok(routesN >= 2 && /- \[ \] Choose “[^”]+” → “[^”]+”/.test(ts) && /- \[ \] Start on “/.test(ts), 'it has tick-box routes (' + routesN + ') with the words to choose and the page each leads to');
  ok(/take each of the \d+ choices? players can be offered/.test(ts), 'it says how many choices the routes cover: ' + (ts.match(/\d+ routes? that together[^.]*\./) || [''])[0]);
  ok(/toast|Saved/.test(await toastText(pg)) && /test-script\.md/.test(await toastText(pg)), 'the toast names the file: ' + await toastText(pg));
  await pg.context().close();

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crash: ' + (e.stack || e)); process.exit(1); });
