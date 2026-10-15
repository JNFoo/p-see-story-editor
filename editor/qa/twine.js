/* File → Import Twine…: a Twine 2 HTML file, a Twee file, a Twine 1 file and an archive of two stories, with the code kept as text or turned into rules,
   the plain-words report, undo, and the friendly refusal of a file that is not a Twine story.
   Usage: node twine.js [chromium|firefox]   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const fx = f => fs.readFileSync(__dirname + '/fixtures/twine/' + f, 'utf8');
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_twine_test"');
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 850 }, locale: 'en-US' });
    await ctx.addInitScript(([s, st]) => {
      if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); localStorage.setItem('story-editor-v1', s); }
      /* a click on a file chooser hands over the file the test set in window.__pick (neither engine's file-chooser event is needed) */
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
    await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 });
    await pg.waitForTimeout(300); return pg;
  };
  const dlg = pg => pg.evaluate(() => { const d = document.querySelector('dialog.dlg[open]'); return d ? d.innerText.replace(/\s+/g, ' ') : ''; });
  const proj = pg => pg.evaluate(() => JSON.parse(JSON.stringify(window.__editor.project)));
  const pick = (pg, name, text) => pg.evaluate(([n, t]) => { window.__pick = { name: n, text: t }; }, [name, text]);
  const menu = async pg => { await pg.locator('#menubtn').click(); await pg.locator('#menupop button:has-text("Import Twine")').click(); await pg.waitForTimeout(500); };

  /* ---- 1. Twine 2 HTML (Harlowe), code kept as text ---- */
  let pg = await open();
  await pick(pg, 'cave.html', fx('cave-harlowe.html'));
  await menu(pg);
  let t = await dlg(pg);
  ok(/Import a Twine story/.test(t) && /Keep the code as text/.test(t) && /Convert the code to rules/.test(t), 'the dialog offers both ways to treat the code: ' + t.slice(0, 120));
  ok(/“Cave” from cave\.html: 4 passages/.test(t), 'it names the story, the file and the page count');
  await pg.locator('dialog.dlg button:has-text("Keep the code as text")').click(); await pg.waitForTimeout(800);
  t = await dlg(pg);
  ok(/Imported 4 pages from Twine/.test(t) && /marked unfinished/.test(t), 'a report opens and says which pages are unfinished: ' + t.slice(0, 200));
  let p = await proj(pg);
  ok(p.title === 'Cave' && p.passages.length === 4, 'the story is now “Cave” with 4 pages');
  ok(p.items.length === 0 && p.passages.filter(q => q.todo).length === 3, 'no rules were made, and 3 pages are flagged unfinished');
  ok(/\(set: \$gold to 0\)/.test(p.passages.find(q => q.name === 'Start').blocks[0].text), 'the Harlowe code is still there as words');
  ok(p.passages.find(q => q.name === 'Door').choices.length === 3, 'all three links of the Door page became choices');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  /* undo brings the earlier story back */
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(500);
  ok((await proj(pg)).title === JSON.parse(sample).title, 'Undo brings the story that was open before back');
  await pg.context().close();

  /* ---- 2. the same file, code turned into rules ---- */
  pg = await open();
  await pick(pg, 'cave.html', fx('cave-harlowe.html'));
  await menu(pg);
  await pg.locator('dialog.dlg button:has-text("Convert the code to rules")').click(); await pg.waitForTimeout(800);
  t = await dlg(pg);
  ok(/Turned the code into rules: 1 yes\/no flag, 1 number/.test(t), 'the report counts the rules made: ' + t.slice(0, 220));
  p = await proj(pg);
  ok(p.items.length === 2 && p.passages.every(q => !q.todo), 'two items (a flag and a number) and no page left unfinished');
  const door = p.passages.find(q => q.name === 'Door');
  ok(door.blocks.some(x => x.needs.length === 1 && /unlock/.test(x.text)) && door.blocks.some(x => x.forbid.length === 1 && /locked/.test(x.text)), 'the if / else became paragraphs that need or forbid the flag');
  ok(door.choices.some(c => c.needs.some(n => /^t:/.test(n))), 'the “gold at least 5” test became a number condition on a choice');
  const torch = p.passages.find(q => q.name === 'Torch');
  ok(torch.gives.length === 1 && Object.values(torch.adds).join() === '5', 'Torch gives the flag and adds 5 to the number');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  /* it is playable: the Play tab starts on the first page */
  await pg.evaluate(() => window.__editor.setView('play')); await pg.waitForTimeout(600);
  ok(/You wake in a cave/.test(await pg.evaluate(() => document.body.innerText)), 'the Play tab plays the imported story');
  await pg.context().close();

  /* ---- 3. Twee (SugarCube), converted ---- */
  pg = await open();
  await pick(pg, 'market.twee', fx('market-sugarcube.twee'));
  await menu(pg);
  await pg.locator('dialog.dlg button:has-text("Convert the code to rules")').click(); await pg.waitForTimeout(800);
  t = await dlg(pg);
  ok(/pick-one set/.test(t) && /Continue/.test(t) && /show a value|shows a value/.test(t), 'the report mentions the pick-one set, the goto turned into Continue, and the value that cannot be shown: ' + t.slice(0, 300));
  p = await proj(pg);
  ok(p.title === 'Market Day' && p.start && p.passages.find(q => q.id === p.start).name === 'Home', 'title from StoryTitle and start page from StoryData');
  ok(p.passages.find(q => q.name === 'Sleep').todo === true && p.passages.find(q => q.name === 'Smith').todo === false, 'only the page with an unreadable <<print>> is flagged');
  await pg.context().close();

  /* ---- 4. Twine 1 ---- */
  pg = await open();
  await pick(pg, 'old.html', fx('old-twine1.html'));
  await menu(pg);
  await pg.locator('dialog.dlg button:has-text("Convert the code to rules")').click(); await pg.waitForTimeout(800);
  p = await proj(pg);
  ok(p.title === 'Old Twine' && p.author === 'Somebody' && p.passages.length === 3, 'Twine 1 title, author and pages: ' + [p.title, p.author, p.passages.length]);
  ok(/"Hello" & bye/.test(p.passages.find(q => q.name === 'Hall').blocks[0].text), 'its escaped characters were decoded');
  await pg.context().close();

  /* ---- 5. an archive with two stories asks which ---- */
  pg = await open();
  await pick(pg, 'archive.html', fx('archive-two.html'));
  await menu(pg);
  t = await dlg(pg);
  ok(/holds 2 stories/.test(t) && /First/.test(t) && /Second/.test(t), 'it lists both stories: ' + t.slice(0, 150));
  await pg.locator('dialog.dlg button:has-text("Second")').click(); await pg.waitForTimeout(300);
  await pg.locator('dialog.dlg button:has-text("Keep the code as text")').click(); await pg.waitForTimeout(800);
  p = await proj(pg);
  ok(p.title === 'Second' && p.passages.length === 2, 'the second story was imported');
  ok(p.passages.find(q => q.name === 'Z').todo === true, 'the Chapbook insert {name} flags its page, because that format’s code is not read');
  await pg.context().close();

  /* ---- 5b. the author is whoever the file names, word for word; none named means none given ---- */
  pg = await open();
  await pick(pg, 'credited.twee', fx('credited.twee'));
  await menu(pg);
  await pg.locator('dialog.dlg button:has-text("Keep the code as text")').click(); await pg.waitForTimeout(800);
  p = await proj(pg); t = await dlg(pg);
  ok(p.author === 'Zoë Ó Briain-Nakamura', 'the named author is kept exactly: ' + p.author);
  ok(/Author kept exactly as the Twine file names it/.test(t) && /permission/.test(t), 'the report says the credit stays and permission is needed');
  await pg.context().close();
  pg = await open();
  await pick(pg, 'market.twee', fx('market-sugarcube.twee'));
  await menu(pg);
  await pg.locator('dialog.dlg button:has-text("Keep the code as text")').click(); await pg.waitForTimeout(800);
  p = await proj(pg); t = await dlg(pg);
  ok(p.author === '' && !/JNFoo|Claude/.test(JSON.stringify(p)), 'a file with no author leaves the box empty and puts no other name in');
  ok(/names no author/.test(t), 'the report says the file names no author');
  await pg.context().close();

  /* ---- 6. a file that is not a Twine story ---- */
  pg = await open();
  await pick(pg, 'notes.txt', 'just some words, no story here');
  await menu(pg);
  t = await dlg(pg);
  ok(/That is not a Twine story/.test(t) && /Twee/.test(t), 'a plain text file is refused in plain words: ' + t.slice(0, 160));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  ok((await proj(pg)).title === JSON.parse(sample).title, 'and the open story is untouched');
  await pick(pg, 'mine.story.json', sample);
  await menu(pg);
  ok(/Use File/.test(await dlg(pg)) && /Open a story/.test(await dlg(pg)), 'one of this editor’s own story files is pointed to File → Open: ' + (await dlg(pg)).slice(0, 140));
  await pg.context().close();

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crash: ' + (e.stack || e)); process.exit(1); });
