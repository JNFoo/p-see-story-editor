/* One window at a time: a second window (or a second copy of the editor on this computer) must not silently overwrite the first one's autosave.
   Part 1 uses Web Locks: the second window is paused with a box; Use-this-window steals the lock, the first window saves its last edit and pauses.
   Part 2 hides Web Locks: a save by another window pauses this one and asks which version to keep.
   Part 3 keeps Web Locks but writes from outside the lock: noticed at once by the storage event, and by the autosave itself when the event is missed.
   Usage: node twowin.js [chromium|firefox]   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const D = __dirname + '/work/';
require('child_process').execSync('cp "' + (process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')) + '" ' + D + 'ed.html');
const FILE = 'http://127.0.0.1:' + (process.env.QA_PORT || 8765) + '/ed.html';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const STORE = 'story-editor-v1', SPARE = 'story-editor-v1-backup';
(async () => {
  const b = await B.launch(); const errs = [];
  const prefs = () => { if (!localStorage.getItem('story-editor-v1-settings')) localStorage.setItem('story-editor-v1-settings', JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } })); };
  const open = async (ctx) => {
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(FILE); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 });
    await pg.waitForTimeout(300); return pg;
  };
  const stored = pg => pg.evaluate(k => { const s = localStorage.getItem(k); return s && JSON.parse(s).title; }, STORE);
  const guard = pg => pg.evaluate(() => window.__editor.guard);
  const dlg = pg => pg.evaluate(() => { const d = document.querySelector('dialog.dlg[open]'); return d ? d.innerText : ''; });
  /* click a button that reloads the page and wait until the NEW page is up (the old one is marked, so it cannot be mistaken for the new one) */
  const reloadBy = async (pg, loc) => {
    await pg.evaluate(() => { window.__old = 1; });
    await loc.click();
    await pg.waitForFunction(() => !window.__old && window.__editor && !document.getElementById('splash'), null, { timeout: 20000 });
    await pg.waitForTimeout(500);
  };
  const type = async (pg, t) => { await pg.fill('#title', t); await pg.waitForTimeout(900); };

  /* ---- part 1: Web Locks ---- */
  let ctx = await b.newContext({ viewport: { width: 1200, height: 850 } }); await ctx.addInitScript(prefs);
  const A = await open(ctx);
  ok(await guard(A) === '', 'the first window has the story: no box');
  await type(A, 'From window A');
  const Bw = await open(ctx);
  ok(await guard(Bw) === 'other', 'the second window is paused (state "other")');
  ok(/open in another window/.test(await dlg(Bw)) && /nothing here is saved/.test(await dlg(Bw)), 'its box says so in plain words: ' + (await dlg(Bw)).replace(/\s+/g, ' ').slice(0, 90));
  await Bw.keyboard.press('Escape'); await Bw.waitForTimeout(200);
  ok(/open in another window/.test(await dlg(Bw)), 'Esc does not dismiss the box');
  await Bw.evaluate(() => window.__editor.persistNow(true)); /* what its autosave would do */
  ok(await stored(A) === 'From window A', 'the paused window wrote nothing: the first window\'s save is intact');
  await type(A, 'A again');
  ok(await stored(A) === 'A again' && await guard(A) === '', 'the first window keeps saving');
  /* take over from B */
  await reloadBy(Bw, Bw.locator('dialog.dlg button.primary'));
  ok(await guard(Bw) === '', 'after "Use this window instead" the second window owns the story');
  ok(await Bw.inputValue('#title') === 'A again', 'it started from what the first window saved (title "' + await Bw.inputValue('#title') + '")');
  ok(await guard(A) === 'taken', 'the first window was told ("taken")');
  ok(/took over/.test(await dlg(A)), 'its box says another window took over');
  await type(Bw, 'From window B');
  await A.evaluate(() => window.__editor.persistNow(true));
  ok(await stored(Bw) === 'From window B', 'the paused first window cannot overwrite the new owner');
  /* and back again */
  await reloadBy(A, A.locator('dialog.dlg button.primary'));
  ok(await guard(A) === '' && await A.inputValue('#title') === 'From window B', 'taking it back works and shows the latest story');
  ok(await guard(Bw) === 'taken', 'the other window is paused again');
  /* a window closed: the next one opens normally */
  await A.close(); await Bw.close();
  const C = await open(ctx);
  ok(await guard(C) === '', 'when every other window is closed a new one opens normally');
  await ctx.close();

  /* ---- part 2: no Web Locks (the storage event stands in) ---- */
  ctx = await b.newContext({ viewport: { width: 1200, height: 850 } }); await ctx.addInitScript(prefs);
  await ctx.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'locks', { get() { return undefined; }, configurable: true }); });
  const A2 = await open(ctx), B2 = await open(ctx);
  ok(await guard(A2) === '' && await guard(B2) === '', 'without Web Locks neither window is paused at the start');
  await type(A2, 'First');
  await B2.waitForTimeout(300);
  ok(await guard(B2) === 'changed', 'the other window noticed the save ("changed")');
  ok(await stored(B2) === 'First', 'and did not overwrite it');
  await reloadBy(B2, B2.locator('dialog.dlg button', { hasText: 'Load their version' }));
  ok(await B2.inputValue('#title') === 'First' && await guard(B2) === '', '"Load their version" shows the first window\'s story');
  await type(B2, 'Second, from the other window');
  await A2.waitForTimeout(300);
  ok(await guard(A2) === 'changed', 'the first window is now the one that is told');
  await A2.locator('dialog.dlg button.primary').click(); await A2.waitForTimeout(400);
  ok(await guard(A2) === '' && await stored(A2) === 'First', '"Keep mine" saves this window\'s version');
  const spare = await A2.evaluate(k => { const s = localStorage.getItem(k); return s && JSON.parse(s).title; }, SPARE);
  ok(spare === 'Second, from the other window', 'the other version became the spare copy (' + spare + ')');
  await ctx.close();

  /* ---- part 3: Web Locks present, but a save comes from a copy that does not share the lock ---- */
  const theirs = pg => pg.evaluate(k => { const o = JSON.parse(localStorage.getItem(k)); o.title = 'Theirs'; localStorage.setItem(k, JSON.stringify(o)); }, STORE);
  ctx = await b.newContext({ viewport: { width: 1200, height: 850 } }); await ctx.addInitScript(prefs);
  const A3 = await open(ctx), B3 = await open(ctx);
  ok(await guard(A3) === '' && await guard(B3) === 'other', 'with Web Locks the second window is paused as before');
  await type(A3, 'Mine');
  await theirs(B3); /* a write the lock cannot stop: the paused window's page writes storage directly, as another copy would */
  await A3.waitForTimeout(300);
  ok(await guard(A3) === 'changed', 'with Web Locks, a save from outside the lock is noticed at once ("changed")');
  ok(/Another window saved/.test(await dlg(A3)), 'its box says another window saved: ' + (await dlg(A3)).replace(/\s+/g, ' ').slice(0, 60));
  await A3.evaluate(() => window.__editor.persistNow()); /* what its autosave would do */
  ok(await stored(A3) === 'Theirs', 'and nothing was written over it');
  await ctx.close();
  /* the same, when the storage event never reaches the window (a sleeping tab): the autosave looks before it writes.
     A write made by the window's own page sends no event to that window, which is the same thing as a missed event. */
  ctx = await b.newContext({ viewport: { width: 1200, height: 850 } }); await ctx.addInitScript(prefs);
  const A4 = await open(ctx);
  await type(A4, 'Mine');
  await theirs(A4);
  await A4.waitForTimeout(300);
  ok(await guard(A4) === '', 'when the event is missed, nothing is shown yet');
  await type(A4, 'Mine, edited on');
  ok(await guard(A4) === 'changed', 'the next autosave notices the other save and asks first ("changed")');
  ok(await stored(A4) === 'Theirs', 'and the other window\'s save is intact');
  await A4.locator('dialog.dlg button.primary').click(); await A4.waitForTimeout(400);
  ok(await guard(A4) === '' && await stored(A4) === 'Mine, edited on', '"Keep mine" saves this window\'s version');
  const spare4 = await A4.evaluate(k => { const s = localStorage.getItem(k); return s && JSON.parse(s).title; }, SPARE);
  ok(spare4 === 'Theirs', 'the other version became the spare copy (' + spare4 + ')');
  await type(A4, 'Still mine');
  ok(await guard(A4) === '' && await stored(A4) === 'Still mine', 'after Keep mine, saving carries on without asking again');
  await ctx.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
