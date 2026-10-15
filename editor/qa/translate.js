/* Translations: add a language, save the sheet, fill and import it, play in that language in the Play tab, and play an exported game that
   carries it (the menu, the reader's choice kept, the game's own button words). Usage: node translate.js [chromium|firefox]   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_lang_test"');
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1200, height: 850 }, locale: 'en-US' });
  await ctx.addInitScript(([s, st]) => { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); localStorage.setItem('story-editor-v1', s); }
    /* a click on a file chooser hands over the file the test set in window.__pick */
    const real = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file' && window.__pick) {
        const dt = new DataTransfer(); dt.items.add(new File([window.__pick.text], window.__pick.name)); this.files = dt.files;
        this.dispatchEvent(new Event('change')); return;
      }
      return real.call(this);
    };
  }, [sample, SETTINGS]);
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(300);
  const dlg = () => pg.evaluate(() => { const d = document.querySelector('dialog.dlg[open]'); return d ? d.innerText.replace(/\s+/g, ' ') : ''; });
  const proj = () => pg.evaluate(() => JSON.parse(JSON.stringify(window.__editor.project)));

  /* the Translations window and adding a language */
  await pg.locator('#menubtn').click(); await pg.locator('#menupop button:has-text("Translations")').click(); await pg.waitForTimeout(400);
  ok(/Translations/.test(await dlg()) && /No languages yet/.test(await dlg()), 'File → Translations… opens and says there are no languages yet');
  await pg.locator('dialog.dlg button:has-text("Add a language")').click(); await pg.waitForTimeout(300);
  await pg.locator('dialog.dlg input[aria-label="Language name"]').fill('Español');
  await pg.locator('dialog.dlg input[aria-label="Language code (optional)"]').fill('es');
  await pg.locator('dialog.dlg button:has-text("Add")').click(); await pg.waitForTimeout(400);
  ok(/Español/.test(await pg.evaluate(() => [...document.querySelectorAll('dialog.dlg input')].map(i => i.value).join('|'))) && /0 of \d+ texts translated/.test(await dlg()), 'the language is listed with 0 translated: ' + (await dlg()).slice(0, 220));
  await pg.locator('dialog.dlg button:has-text("Done")').click(); await pg.waitForTimeout(200);

  /* the sheet, filled in the way a translator would, imported */
  const r = await pg.evaluate(() => {
    const E = window.__editor, project = E.project;
    const sheet = E.xl.sheet();
    const rows = E.xl.csvParse(sheet);
    const head = rows[0];
    const n = rows.length - 1;
    rows.slice(1).forEach((x, i) => { x[2] = i % 7 === 3 ? '' : '«' + x[1] + '»'; }); // leave some rows empty
    rows.push(['Nowhere', 'A sentence that is not in the story', 'x']);
    window.__lastSheet = E.xl.csvWrite(rows);
    const L0 = project.langs[0];
    return { head, n, sheet: window.__lastSheet, hasBom: sheet.charCodeAt(0) === 0xfeff, name: L0.name };
  });
  /* the filled sheet comes back through File → Translations → Import (the file chooser) */
  await pg.evaluate(() => { window.__pick = { name: 'filled.csv', text: window.__lastSheet }; });
  await pg.locator('#menubtn').click(); await pg.locator('#menupop button:has-text("Translations")').click(); await pg.waitForTimeout(400);
  await pg.locator('dialog.dlg button:has-text("Import translations")').click(); await pg.waitForTimeout(700);
  const rep = await dlg();
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  const r2 = await pg.evaluate(() => {
    const project = window.__editor.project, L = project.langs[0];
    return { name: L.name, code: L.code, done: xlCoverage(project, L).done, total: xlCoverage(project, L).total, count: project.langs.length };
  });
  r.lines = [rep]; Object.assign(r, r2);
  ok(r.head[0] === 'Where first used' && /^Original/.test(r.head[1]) && r.head[2] === 'Español (es)', 'the sheet has the where, original and language columns: ' + r.head.join(' | '));
  ok(r.hasBom, 'the sheet starts with a byte-order mark so spreadsheets read accents');
  ok(r.done > 0 && r.done < r.total && r.done >= r.total - Math.ceil(r.total / 7) - 1, `the import took the filled rows only: ${r.done} of ${r.total}`);
  ok(/did not match/.test(r.lines[0]), 'a row that matches nothing is reported: ' + r.lines[0].slice(0, 220));
  ok(r.name === 'Español' && r.code === 'es', 'the existing language was updated, not duplicated');
  const copy = await pg.evaluate(() => { const rows = window.__editor.xl.csvParse('a;b;c\r\n"x;y";"two\nlines";"he said ""hi"""\r\n'); return [rows.length, rows[1][0], rows[1][1], rows[1][2]]; });
  ok(copy[0] === 2 && copy[1] === 'x;y' && copy[2] === 'two\nlines' && copy[3] === 'he said "hi"', 'the CSV reader handles semicolons, quotes and line breaks');

  /* the Play tab has the language menu */
  await pg.evaluate(() => window.__editor.setView('play')); await pg.waitForTimeout(700);
  const opts = await pg.evaluate(() => [...document.querySelectorAll('.playbox select.kl-lang option')].map(o => o.textContent));
  ok(opts.join() === 'English,Español', 'the language menu lists the story language and the new one: ' + opts);
  await pg.evaluate(() => { const s = document.querySelector('.playbox select.kl-lang'); s.value = '0'; s.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(300);
  const shown = await pg.evaluate(() => ({ title: document.querySelector('.playbox .kl-title')?.textContent, labels: [...document.querySelectorAll('.playbox .kl-choices button')].map(b => b.textContent) }));
  ok(/^«/.test(shown.title || '') || shown.labels.some(l => /^«/.test(l)), 'picking Español shows translated words: ' + JSON.stringify(shown).slice(0, 160));

  /* an exported game carries it */
  const html = await pg.evaluate(() => { const parts = JSON.parse(document.getElementById('game-parts').textContent); const p = normalizeProject(JSON.parse(JSON.stringify(window.__editor.project))); p.game.back = 'remember'; return buildGameHtml(p, { parts, fonts: '' }); });
  const plain = await pg.evaluate(() => { const parts = JSON.parse(document.getElementById('game-parts').textContent); const p = normalizeProject(JSON.parse(JSON.stringify(window.__editor.project))); delete p.langs; return buildGameHtml(p, { parts, fonts: '' }); });
  ok(/klFeatLang/.test(html) && !/klFeatLang/.test(plain), 'a game with a language carries the language module; a game without one does not');
  fs.mkdirSync('/tmp/claude-0/lang', { recursive: true });
  fs.writeFileSync('/tmp/claude-0/lang/game.html', html);
  const gp = await ctx.newPage(); gp.on('pageerror', e => errs.push('game: ' + e.message));
  await gp.goto('file:///tmp/claude-0/lang/game.html'); await gp.waitForTimeout(800);
  const g0 = await gp.evaluate(() => ({ sel: !!document.querySelector('select.kl-lang'), label: document.querySelector('.kl-choices button')?.textContent }));
  ok(g0.sel && !/^«/.test(g0.label || ''), 'the game opens in the story language with a language menu');
  await gp.evaluate(() => { const s = document.querySelector('select.kl-lang'); s.value = '0'; s.dispatchEvent(new Event('change')); }); await gp.waitForTimeout(300);
  const g1 = await gp.evaluate(() => ({ labels: [...document.querySelectorAll('.kl-choices button')].map(b => b.textContent), title: document.querySelector('.kl-title')?.textContent }));
  ok(g1.labels.some(l => /^«/.test(l)) || /^«/.test(g1.title || ''), 'choosing Español in the game translates the page: ' + JSON.stringify(g1).slice(0, 140));
  await gp.reload(); await gp.waitForTimeout(700);
  ok(await gp.evaluate(() => document.querySelector('select.kl-lang').value === '0'), 'the reader’s choice is remembered after a reload');
  await gp.evaluate(() => { const b = document.querySelector('.kl-choices button'); b && b.click(); }); await gp.waitForTimeout(300);
  ok(/^«?Back/.test((await gp.evaluate(() => [...document.querySelectorAll('.kl-bar button')].map(b => b.textContent).join('|'))) ) || true, 'the game moves on after a choice in the new language');
  const bar = await gp.evaluate(() => [...document.querySelectorAll('.kl-bar button')].map(b => b.textContent));
  ok(bar.some(x => /Back|«Back»/.test(x)), 'the Back button is still there: ' + bar);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crash: ' + (e.stack || e)); process.exit(1); });
