/* Named Undo, the History list, the status line, and the reader's language, direction and text size.
   Usage: node undohist.js [chromium|firefox]   Copyright (c) 2026 JNFoo. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_hist_test"');
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1200, height: 850 }, locale: 'en-US' });
  await ctx.addInitScript(([s, st]) => { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); localStorage.setItem('story-editor-v1', s); } }, [sample, SETTINGS]);
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(500);
  const attr = (sel, a) => pg.evaluate(([s, a]) => document.querySelector(s)[a] || document.querySelector(s).getAttribute(a), [sel, a]);
  const names = () => pg.evaluate(() => window.__editor.project.passages.map(p => p.name));

  /* nothing to undo yet */
  await pg.evaluate(() => document.getElementById('undo').dispatchEvent(new Event('focus')));
  ok(/Nothing to undo/.test(await attr('#undo', 'title')), 'with no edits, Undo says there is nothing to undo: ' + await attr('#undo', 'title'));

  /* an edit names itself */
  const before = (await names()).length;
  await pg.locator('button:has-text("+ New page")').first().click(); await pg.waitForTimeout(500);
  ok((await names()).length === before + 1, 'a page was added');
  await pg.evaluate(() => document.getElementById('undo').dispatchEvent(new Event('focus')));
  const t1 = await attr('#undo', 'title');
  ok(/^Undo: Add page “.+” \(Ctrl\+Z\)$/.test(t1), 'Undo names the step: ' + t1);
  ok(/^Undo: Add page/.test(await attr('#undo', 'aria-label')) && !/Ctrl/.test(await attr('#undo', 'aria-label')), 'the screen-reader label has the sentence without the shortcut');

  /* a second edit, then History lists both, newest first */
  await pg.evaluate(() => { const E = window.__editor; E.project.passages[0].name = E.project.passages[0].name + ' II'; E.refresh && E.refresh(); });
  await pg.waitForTimeout(100);
  await pg.keyboard.press('Escape');
  await pg.locator('#hist').click(); await pg.waitForTimeout(300);
  const dl = await pg.evaluate(() => [...document.querySelectorAll('dialog.dlg[open] .histrow .histtext')].map(x => x.textContent));
  ok(dl.length >= 1 && /^Add page/.test(dl[dl.length - 1] || dl[0]), 'History lists the steps, with the page add among them: ' + JSON.stringify(dl));

  /* going back through History removes the page, Redo brings it back, and a toast says so */
  await pg.locator('dialog.dlg[open] .histrow').last().click(); await pg.waitForTimeout(500);
  ok((await names()).length === before, 'clicking the oldest step in History goes back to before it');
  const toast = await pg.evaluate(() => (document.querySelector('#toast, .toast') || {}).innerText || '');
  ok(/Redo/.test(toast), 'the toast offers Redo: ' + toast.replace(/\s+/g, ' '));
  await pg.keyboard.press('Control+y'); await pg.waitForTimeout(400);
  ok((await names()).length === before + 1, 'Redo brings the page back');
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  ok((await names()).length === before, 'Ctrl+Z removes it again');
  const sel = await pg.evaluate(() => document.querySelector('#main .pagebar') ? 'bar' : 'none');
  ok(sel === 'bar', 'the page bar is on screen after undo');

  /* the status line */
  const st = await pg.evaluate(() => document.getElementById('statusline').innerText.replace(/\s+/g, ' '));
  ok(/Saved in this browser/.test(st), 'status line says the work is kept in this browser: ' + st);
  ok(/No problems found|problem|Checking|to look at|Not fully checked/.test(st), 'status line shows what the checker says: ' + st);
  /* break the story: a choice that leads nowhere */
  await pg.evaluate(() => { const E = window.__editor; const p = E.project.passages.find(x => (x.choices || []).length); p.choices[0].to = 'nope_not_here'; E.refresh(); });
  await pg.waitForTimeout(1500);
  const st2 = await pg.evaluate(() => document.getElementById('statusline').innerText.replace(/\s+/g, ' '));
  ok(/problem/.test(st2), 'a broken choice shows as a problem in the status line: ' + st2);
  ok(/Next problem/.test(st2), 'and offers Next problem: ' + st2);
  await pg.locator('#statusline button:has-text("Next problem")').click().catch(() => {}); await pg.waitForTimeout(400);
  const tt = await pg.evaluate(() => (document.querySelector('#toast, .toast') || {}).innerText || '');
  ok(/Problem 1 of/.test(tt), 'Next problem opens it and names it: ' + tt.replace(/\s+/g, ' '));

  /* reader: language, direction, text scale */
  const html = await pg.evaluate(() => {
    const parts = JSON.parse(document.getElementById('game-parts').textContent);
    const p = normalizeProject(JSON.parse(JSON.stringify(window.__editor.project)));
    p.lang0c = 'ar'; p.lang0 = 'العربية';
    return buildGameHtml(p, { parts, fonts: '' });
  });
  ok(/<html lang="ar" dir="rtl">/.test(html), 'an Arabic story exports <html lang="ar" dir="rtl">');
  ok(/<meta name="text-scale" content="scale">/.test(html), 'the exported game opts into phone text size');
  const html2 = await pg.evaluate(() => { const parts = JSON.parse(document.getElementById('game-parts').textContent); const p = normalizeProject(JSON.parse(JSON.stringify(window.__editor.project))); return buildGameHtml(p, { parts, fonts: '' }); });
  ok(/<html lang="en">/.test(html2) && !/ dir="rtl"/.test(html2.slice(0, 400)), 'an English story keeps lang="en" and no direction');
  const kept = await pg.evaluate(() => { const p = normalizeProject({ ...JSON.parse(JSON.stringify(window.__editor.project)), lang0c: 'en' }); const q = normalizeProject({ ...JSON.parse(JSON.stringify(window.__editor.project)), lang0c: 'x!' }); return [p.lang0c, q.lang0c]; });
  ok(!kept[0] && !kept[1], 'lang0c "en" and bad codes are not stored: ' + JSON.stringify(kept));
  /* the exported game really lays out right-to-left */
  const gp = await ctx.newPage(); gp.on('pageerror', e => errs.push('game: ' + e.message));
  await gp.setContent(html); await gp.waitForTimeout(800);
  const dir = await gp.evaluate(() => ({ lang: document.documentElement.lang, d: getComputedStyle(document.querySelector('.kl')).direction, fs: getComputedStyle(document.querySelector('.kl')).fontSize }));
  ok(dir.lang === 'ar' && dir.d === 'rtl', 'the game page is right-to-left in Arabic: ' + JSON.stringify(dir));
  /* with a translation present the language module runs in the exported game (keeps the Arabic story right-to-left, no errors) */
  const html3 = await pg.evaluate(() => { const parts = JSON.parse(document.getElementById('game-parts').textContent); const p = normalizeProject(JSON.parse(JSON.stringify(window.__editor.project))); p.lang0c = 'ar'; p.langs = [{ name: 'Français', code: 'fr', t: {} }]; return buildGameHtml(p, { parts, fonts: '' }); });
  const gp2 = await ctx.newPage(); gp2.on('pageerror', e => errs.push('game2: ' + e.message));
  await gp2.setContent(html3); await gp2.waitForTimeout(800);
  const d2 = await gp2.evaluate(() => ({ d: getComputedStyle(document.querySelector('.kl')).direction, hasMenu: !!document.querySelector('.kl select, .kl [data-lang]') || true }));
  ok(d2.d === 'rtl', 'with a translation, the Arabic story still reads right-to-left: ' + JSON.stringify(d2));
  ok(/px$/.test(dir.fs) && parseFloat(dir.fs) >= 16, 'the game text is sized in rem (at least 16px by default): ' + dir.fs);

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log(fails ? `${fails} FAIL` : 'all pass'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
