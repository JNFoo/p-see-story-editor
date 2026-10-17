/* Regression tests for the 2026.10.12 bug-fix round: one check per fix.
   Save in flight / unsaved edits; the spare copy before a story is replaced; a full disk; closing when nothing can be kept;
   "Extra large" text after a reload; the tour waiting for typing to stop; the map key following a resized window;
   the reading-settings panel (Esc, outside click, never cut off); Start over on a stuck page; a doctored Place code. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs'); const { genStory } = require('./genstory');
const FILE = require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const nap = ms => new Promise(r => setTimeout(r, ms)); // real time (the browser shim's own waits can run short)
/* waits until what the next check looks at is there (polled, so a quick result costs nothing); if it never comes the check below fails with its own message */
const until = (pg, fn, arg, ms = 5000) => pg.waitForFunction(fn, arg, { timeout: ms }).catch(() => {});
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch();
  async function page(init, opts = {}) {
    const ctx = await b.newContext({ viewport: { width: opts.w || 1280, height: opts.h || 900 } });
    await ctx.addInitScript(([s, extra, fresh]) => { try { if (!sessionStorage.getItem('b12')) { sessionStorage.setItem('b12', '1'); if (!fresh) { localStorage.setItem('story-editor-v1-settings', s); localStorage.setItem('story-editor-v1-toured', '1'); } } } catch (e) {} if (extra) (0, eval)(extra); }, [SETTINGS, init || '', !!opts.fresh]);
    const pg = await ctx.newPage(); pg.errs = []; pg.on('pageerror', e => pg.errs.push(e.message)); pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto(FILE); await pg.waitForFunction(() => window.__editor && document.querySelector('#title'), null, { timeout: 20000 }); if (!opts.early) { await pg.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 }); await nap(300); } pg.ctx = ctx; return pg;
  }
  /* ---------- 1. Save while a save is under way ---------- */
  {
    const init = `window.__starts = 0; window.__saves = []; window.__gate = null;
      window.showSaveFilePicker = async o => ({ name: o.suggestedName, createWritable: async () => ({ write: async blob => { window.__starts++; if (window.__gate) await window.__gate; window.__saves.push(await blob.text()); }, close: async () => {} }), queryPermission: async () => 'granted' });`;
    const pg = await page(init);
    await pg.click('#menubtn'); await pg.click('#menupop >> text=Save as…'); await until(pg, () => window.__saves.length === 1 && !document.querySelector('#savebtn').classList.contains('dirty'));
    ok(await pg.evaluate(() => window.__saves.length) === 1 && !(await pg.evaluate(() => document.querySelector('#savebtn').classList.contains('dirty'))), 'Save as writes the file and the Save button shows saved');
    await pg.fill('#title', 'Edited once'); await nap(100);
    await pg.evaluate(() => { window.__gate = new Promise(r => (window.__release = r)); window.__starts = 0; });
    await pg.keyboard.press('Escape'); await pg.evaluate(() => document.activeElement.blur());
    await pg.keyboard.press('Control+s'); await pg.keyboard.press('Control+s'); await pg.keyboard.press('Control+s'); await nap(250);
    ok(await pg.evaluate(() => window.__starts) === 1, 'Ctrl+S pressed three times while the write is under way starts one write, not three');
    await pg.fill('#title', 'Edited twice'); await nap(100);
    await pg.evaluate(() => window.__release()); await until(pg, () => window.__saves.length >= 2); await nap(100);
    ok(await pg.evaluate(() => document.querySelector('#savebtn').classList.contains('dirty')), 'an edit made while the write was under way still shows as unsaved');
    await pg.evaluate(() => (window.__gate = null)); await pg.keyboard.press('Control+s'); await until(pg, () => !document.querySelector('#savebtn').classList.contains('dirty'));
    ok(!(await pg.evaluate(() => document.querySelector('#savebtn').classList.contains('dirty'))), 'a later Save clears it');
    ok(!pg.errs.length, 'no errors: ' + pg.errs.join('; ')); await pg.ctx.close();
  }
  /* ---------- 2. the spare copy when a whole story is replaced; 3. a full disk; 4. nothing can be kept ---------- */
  {
    const pg = await page('');
    await pg.fill('#title', 'My precious story'); await until(pg, () => { try { return JSON.parse(localStorage.getItem('story-editor-v1')).title === 'My precious story'; } catch (e) { return false; } });
    await pg.click('#menubtn'); await pg.click('#menupop >> text=Example story'); await nap(300); await pg.click('dialog button:has-text("Load example")'); await until(pg, () => !!localStorage.getItem('story-editor-v1-backup'));
    const spare = await pg.evaluate(() => { try { return JSON.parse(localStorage.getItem('story-editor-v1-backup')).title; } catch (e) { return 'none'; } });
    ok(spare === 'My precious story', 'loading the example keeps the story it replaced as the spare copy right away (spare holds: ' + spare + ')');
    /* a full disk: writing the story fails while the spare copy exists; the spare gives up its room and the save goes through */
    await pg.evaluate(() => { const real = Storage.prototype.setItem; window.__realSet = real; Storage.prototype.setItem = function (k, v) { if (k === 'story-editor-v1' && localStorage.getItem('story-editor-v1-backup')) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return real.call(this, k, v); }; });
    await pg.fill('#title', 'After the disk filled'); await until(pg, () => { try { return JSON.parse(localStorage.getItem('story-editor-v1')).title === 'After the disk filled'; } catch (e) { return false; } });
    const saved = await pg.evaluate(() => { try { return JSON.parse(localStorage.getItem('story-editor-v1')).title; } catch (e) { return 'none'; } });
    ok(saved === 'After the disk filled', 'a full disk: the spare copy is dropped and the story still saves (saved: ' + saved + ')');
    ok(await pg.evaluate(() => document.querySelector('#nosave').hidden), 'no "cannot save" warning when the retry worked');
    /* nothing can be written at all */
    await pg.evaluate(() => { Storage.prototype.setItem = function (k, v) { if (k === 'story-editor-v1') throw new Error('blocked'); return window.__realSet.call(this, k, v); }; });
    await pg.fill('#title', 'Cannot keep this'); await until(pg, () => !document.querySelector('#nosave').hidden);
    ok(await pg.evaluate(() => !document.querySelector('#nosave').hidden), 'when the browser keeps nothing, the warning shows');
    const prevented = await pg.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    ok(prevented, 'closing the tab then asks first, because the changes exist nowhere else');
    await pg.evaluate(() => { Storage.prototype.setItem = window.__realSet; });
    await pg.fill('#title', 'Works again'); await until(pg, () => document.querySelector('#nosave').hidden);
    ok(await pg.evaluate(() => document.querySelector('#nosave').hidden), 'the warning goes away once saving works again');
    ok(!(await pg.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })), 'and closing no longer asks');
    ok(!pg.errs.length, 'no errors: ' + pg.errs.join('; ')); await pg.ctx.close();
  }
  /* ---------- 5. "Extra large" writing text survives a reload ---------- */
  {
    const pg = await page('');
    for (let i = 0; i < 2; i++) { await pg.click('#optbtn'); await pg.click('#optpop >> text=/Writing text size/'); await nap(150); }
    ok(await pg.evaluate(() => document.body.classList.contains('wsize-x')), 'two clicks reach Extra large (Medium, Large, Extra large)');
    await nap(300); await pg.reload(); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash')); await nap(300);
    ok(await pg.evaluate(() => document.body.classList.contains('wsize-x')), 'Extra large is still on after a reload');
    await pg.ctx.close();
  }
  /* ---------- 6. the tour does not interrupt typing ---------- */
  {
    const pg = await page('', { fresh: true, early: true }); // typing starts at once, before the tour's timer (4.6 s) fires
    await pg.fill('#title', 'Typing away'); await pg.focus('#title');
    await pg.waitForTimeout(6500); /* returns once the tour's 4.6 s timer has run and chosen to wait (the page's own timers are what this waits for) */
    ok(!(await pg.locator('#tour').count()), 'the first-time tour waits while a text box has the focus');
    await pg.evaluate(() => document.activeElement.blur());
    let started = true; await pg.waitForFunction(() => document.querySelector('#tour'), null, { timeout: 14000 }).catch(() => { started = false; });
    ok(started, 'and starts a few seconds after the typing stops');
    await pg.ctx.close();
  }
  /* ---------- 7. the map key follows the window ---------- */
  {
    const pg = await page('');
    await pg.evaluate(() => __editor.setView('map')); await nap(700);
    const placed = () => pg.evaluate(() => { const k = document.querySelector('.fkey'); return k ? (k.style.top || '') : 'nokey'; });
    const t1 = await placed();
    await pg.setViewportSize({ width: 560, height: 800 }); await nap(500);
    const t2 = await placed();
    ok(t1 !== '' && t2 === '', `the key sits above Start on a wide window (${t1}) and goes back to its corner when the window becomes narrow (${t2 || 'corner'})`);
    await pg.setViewportSize({ width: 1280, height: 900 }); await nap(500);
    ok((await placed()) !== '', 'and moves above Start again when the window is wide again');
    ok(!pg.errs.length, 'no errors: ' + pg.errs.join('; ')); await pg.ctx.close();
  }
  /* ---------- 8. the game: reading-settings panel, Start over on a stuck page, a doctored Place code ---------- */
  {
    const P = genStory(3, {});
    const mk = (n, t) => { const x = { id: n, name: n, blocks: [{ text: t, needs: [], forbid: [], orPrev: false }], choices: [], ending: false, valence: '', gives: [], takes: [], adds: {}, sends: {} }; return x; };
    P.items = [{ id: 'sk', name: 'Skill', kind: 'stat', show: true, lo: 0, hi: 6, start: 3 }, { id: 'key', name: 'Key', kind: 'object', show: true }];
    P.givens = [];
    const a = mk('A', 'Start page'), w = mk('W', 'You won'), l = mk('L', 'You lost'), s = mk('S', 'A stuck page');
    w.ending = l.ending = true; w.valence = 'good'; l.valence = 'bad';
    const ch = (label, to, extra) => Object.assign({ label, to, needs: [], forbid: [], gives: [], takes: [], adds: {}, check: null, lock: false, why: '' }, extra || {});
    a.choices = [ch('Try the leap', 'W', { check: { stat: 'sk', target: 8, fail: 'L' } }), ch('Wander off', 'S')];
    s.choices = [ch('Needs a key you never get', 'W', { needs: ['key'] })];
    P.passages = [a, w, l, s]; P.start = 'A'; P.game = { back: 'off', tracker: false, comfort: true, odds: true, place: true, pal: 'paper' };
    const ed = await page('');
    await ed.evaluate(p => { localStorage.setItem('story-editor-v1', p); }, JSON.stringify(P)); await ed.reload(); await ed.waitForFunction(() => window.__editor && !document.getElementById('splash')); await nap(300);
    await ed.click('#menubtn'); await ed.click('#menupop >> text=Copy game code…'); await nap(250);
    const html = await ed.inputValue('dialog textarea'); await ed.keyboard.press('Escape');
    const gf = __dirname + `/work/bugs12-${which}.html`; fs.writeFileSync(gf, html);
    const open = async (w0 = 900, h0 = 700, comfort) => { const ctx = await b.newContext({ viewport: { width: w0, height: h0 } }); if (comfort) await ctx.addInitScript(c => { try { localStorage.setItem('story-editor-comfort', c); } catch (e) {} }, comfort); const g = await ctx.newPage(); g.errs = []; g.on('pageerror', e => g.errs.push(e.message)); await g.addInitScript(() => { navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }; }); await g.goto('file://' + gf); await nap(300); g.ctx = ctx; return g; };
    const aaState = g => g.evaluate(() => { const d = document.querySelector('.kl-aa'); const bx = d && d.querySelector('.kl-aa-box'); return d ? { open: d.open, top: bx ? Math.round(bx.getBoundingClientRect().top) : null } : null; });
    /* the panel */
    let g = await open();
    await g.click('.kl-aa summary'); await nap(150);
    ok((await aaState(g)).open, 'the Aa panel opens');
    await g.keyboard.press('Escape'); await nap(100);
    ok(!(await aaState(g)).open, 'Esc closes the Aa panel');
    await g.click('.kl-aa summary'); await nap(100); await g.click('.kl h1, .kl-page', { position: { x: 5, y: 5 } }).catch(() => {}); await g.mouse.click(20, 20); await nap(100);
    ok(!(await aaState(g)).open, 'a click anywhere else closes it');
    await g.ctx.close();
    for (const h0 of [380, 460, 560, 700]) {
      g = await open(900, h0, JSON.stringify({ size: '2' }));
      await g.click('.kl-aa summary'); await nap(150);
      const st = await aaState(g);
      ok(st.top >= 0, `Larger text, window ${h0} px tall: the whole panel is on screen (top at ${st.top})`);
      await g.ctx.close();
    }
    /* Start over on a stuck page */
    g = await open();
    await g.click('text=Wander off'); await nap(150);
    ok(await g.locator('button:text-is("Start over")').isVisible(), 'a page with no choice you can take offers Start over');
    await g.ctx.close();
    /* Place codes: a real one works on a fresh device, damaged ones are refused and change nothing */
    g = await open();
    await g.click('text=Wander off'); await nap(150);
    await g.click('summary:text-is("Place code")'); await g.click('button:text-is("Copy my place code")');
    const code1 = await g.evaluate(() => window.__clip || document.querySelector('.kl-pl-box input').value);
    await g.evaluate(() => { Storage.prototype.setItem = function () {}; for (const k of Object.keys(localStorage)) if (!/comfort/.test(k)) localStorage.removeItem(k); });
    await g.reload(); await nap(250);
    ok(/Start page/.test(await g.innerText('.kl')), 'a cleared device starts at the beginning');
    await g.click('summary:text-is("Place code")'); await g.fill('.kl-pl-box input', code1); await g.click('button:text-is("Go to that place")'); await nap(200);
    ok(/A stuck page/.test(await g.innerText('.kl')), 'pasting the code on the cleared device brings the place back (' + code1 + ')');
    await g.ctx.close();
    g = await open();
    await g.click('summary:text-is("Place code")'); await g.click('button:text-is("Copy my place code")');
    const fp = (await g.evaluate(() => window.__clip || document.querySelector('.kl-pl-box input').value)).split('-')[0];
    for (const [bad, what] of [[`${fp}-.0z`, 'a roll digit that is not a roll (z)'], [`${fp}-.0`, 'a code cut off after the choice that needs a roll'], [`${fp}-.9`, 'a choice number the page does not have']]) {
      await g.fill('.kl-pl-box input', bad); await g.click('button:text-is("Go to that place")'); await nap(200);
      const msg = await g.innerText('.kl-pl-msg').catch(() => '');
      ok(/does not fit/.test(msg), `${what}: refused with "${msg}"`);
      ok(/Start page/.test(await g.innerText('.kl')), 'and the game stays where it was');
    }
    ok(!g.errs.length, 'no errors: ' + g.errs.join('; ')); await g.ctx.close();
    await ed.ctx.close();
  }
  await b.close(); console.log(fails ? 'BUGS12 FAILED' : 'BUGS12 OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
