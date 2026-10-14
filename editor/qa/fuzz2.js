/* Player fuzzer: random stories (every feature) exported as real games and played with random clicks: choices, Back, Start over,
   reloads, Place codes (copy, clear the device, paste: the same place must come back), the Aa panel. After every step: no errors,
   no "undefined"/"NaN", and always something to press. Usage: node fuzz2.js [firefox|chromium] [stories=10] [steps=120] */
const which = process.argv[2] || 'firefox', NS = +process.argv[3] || 6, STEPS = +process.argv[4] || 80;
const B = require('./engine').pick(which), fs = require('fs'), { genStory } = require('./genstory');
const FILE = require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const BACKS = ['off', 'remember', 'reroll', 'block'];
(async () => {
  const b = await B.launch();
  for (let n = 1; n <= NS; n++) {
    const seed = n + (+process.env.SEEDBASE || 0);
    const P = genStory(seed * 31 + 7, { wide: seed % 3 === 0, huge: seed % 11 === 0 });
    P.game = Object.assign({}, P.game, { back: BACKS[seed % 4], place: seed % 2 === 0, tracker: seed % 3 !== 1, comfort: seed % 5 !== 0, pal: 'night' });
    const ctx = await b.newContext({ viewport: { width: 700 + (seed % 3) * 300, height: 900 } });
    await ctx.addInitScript(p => { try { if (!sessionStorage.getItem('fz')) { sessionStorage.setItem('fz', '1'); localStorage.setItem('story-editor-v1', p); localStorage.setItem('story-editor-v1-toured', '1'); localStorage.setItem('story-editor-v1-settings', JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } })); } } catch (e) {} }, JSON.stringify(P));
    const ed = await ctx.newPage(); const errs = [];
    ed.on('pageerror', e => errs.push('editor: ' + e.message));
    await ed.goto(FILE); await ed.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 });
    await ed.click('#menubtn'); await ed.click('#menupop >> text=Copy game code…'); await ed.waitForTimeout(200);
    const html = await ed.inputValue('dialog textarea'); await ed.keyboard.press('Escape');
    const file = __dirname + `/work/fuzz2-${which}-${seed}.html`; fs.writeFileSync(file, html);
    const g = await ctx.newPage();
    g.on('pageerror', e => errs.push('game: ' + e.message)); g.on('console', m => { if (m.type() === 'error') errs.push('game console: ' + m.text()); });
    await g.addInitScript(() => { navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }; });
    await g.goto('file://' + file); await g.waitForTimeout(250);
    let s = seed * 104729 + 3; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pick = a => a[Math.floor(rnd() * a.length)];
    const log = []; let moves = 0, backs = 0, codes = 0, endings = 0;
    const text = () => g.evaluate(() => (document.querySelector('.kl') || document.body).innerText.replace(/\s+/g, ' ').trim());
    const state = () => g.evaluate(() => {
      const kl = document.querySelector('.kl'); const t = kl ? kl.innerText : '';
      const btns = [...document.querySelectorAll('.kl button, .kl summary, .kl a')].filter(e => e.getClientRects().length && !e.disabled);
      return { len: t.length, bad: (t.match(/\bundefined\b|\bNaN\b|\[object \w+\]/) || [])[0] || '', btns: btns.length, choices: document.querySelectorAll('.kl-choices button:not([disabled]):not([aria-disabled])').length };
    });
    for (let i = 0; i < STEPS; i++) {
      let what = '';
      try {
        const r = rnd(); const st0 = await state();
        if (r < 0.62) {
          const k = await g.locator('.kl-choices button:not([disabled]):not([aria-disabled])').count();
          if (k) { const j = Math.floor(rnd() * k); const lab = await g.locator('.kl-choices button:not([disabled]):not([aria-disabled])').nth(j).innerText(); await g.locator('.kl-choices button:not([disabled]):not([aria-disabled])').nth(j).click({ timeout: 2000 }); moves++; what = 'choice ' + lab.slice(0, 20); }
          else what = 'no choices';
        } else if (r < 0.74) {
          const bk = g.locator('button:text-is("Back"):not([aria-disabled]), .kl-back:not([aria-disabled])').first();
          if (await bk.count() && await bk.isVisible()) { await bk.click({ timeout: 2000 }); backs++; what = 'Back'; } else what = 'no Back';
        } else if (r < 0.79) {
          const so = g.locator('button:has-text("Start over"), button:has-text("Play again")').first();
          if (await so.count() && await so.isVisible()) { await so.click({ timeout: 2000 }); what = 'Start over'; } else what = 'no start-over';
        } else if (r < 0.85) { await g.waitForTimeout(150); await g.reload(); await g.waitForTimeout(200); what = 'reload'; }
        else if (r < 0.95 && P.game.place) {
          const sm = g.locator('summary:text-is("Place code")');
          if (await sm.count()) {
            await sm.first().click({ timeout: 2000 }); const cp = g.locator('button:text-is("Copy my place code")');
            if (await cp.count()) {
              await cp.first().click(); const code = await g.evaluate(() => window.__clip || (document.querySelector('.kl-pl-box input') || {}).value || '');
              const before = await text();
              if (code) {
                codes++;
                await g.evaluate(() => { const k = Object.keys(localStorage); k.forEach(x => { if (!x.startsWith('story-editor-comfort')) localStorage.removeItem(x); }); });
                await g.evaluate(() => { Storage.prototype.setItem = function () {}; }); await g.reload(); await g.waitForTimeout(150);
                if (!(await g.locator('summary:text-is("Place code")').count()) && (await g.locator('.kl-ask button').count())) { await g.locator('.kl-ask button').first().click(); await g.waitForTimeout(100); } /* a Given question comes first; any answer will do, the code replays the real one */
                if (!(await g.locator('summary:text-is("Place code")').count())) { what = 'place code: no summary after clearing'; errs.push('Place code missing on a fresh start page'); } else { await g.locator('summary:text-is("Place code")').first().click(); } await g.fill('.kl-pl-box input', code); await g.click('button:text-is("Go to that place")'); await g.waitForTimeout(150);
                const after = await text();
                const norm = t => t.replace(/Endings found: \d+ of \d+/g, '').replace(/rolled \d+ \+ \d+ =/g, 'rolled').replace(/Place code.*$/, '').replace(/Copy my place code|Go to that place|Copied/g, '').replace(/\s+/g, ' ').trim();
                if (norm(before) !== norm(after)) { ok(false, `story ${seed}: Place code ${code} did not bring the same place back.\n  before: ${norm(before).slice(0, 200)}\n  after:  ${norm(after).slice(0, 200)}`); errs.push('place mismatch'); }
                await g.reload(); // storage writes were switched off for the restore: reload gives a clean page for the next step
              }
              what = 'place code';
            } else what = 'no copy button (route off)';
          } else what = 'no place code';
        } else { const aa = g.locator('.kl-aa').first(); if (await aa.count() && await aa.isVisible()) { await aa.click({ timeout: 2000 }); await g.waitForTimeout(80); const bs = g.locator('.kl-aa-box button'); const c = await bs.count();
            if (c) { const j = Math.floor(rnd() * c); const cov = await g.evaluate(j => { const bn = document.querySelectorAll('.kl-aa-box button')[j]; bn.scrollIntoView({ block: 'center' }); const q = bn.getBoundingClientRect(); const e = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return e === bn || bn.contains(e) ? '' : `${bn.textContent} at y=${Math.round(q.y)} of ${innerHeight} is covered by <${e && e.tagName} class="${e && e.className}"> ${(e && e.textContent || '').slice(0, 40)}`; }, j); if (cov) errs.push('Aa button covered: ' + cov + ' | ' + await g.evaluate(() => { const a = document.querySelector('.kl-aa'), bx = document.querySelector('.kl-aa-box'); const q = a.getBoundingClientRect(), w = bx.getBoundingClientRect(); const bar = a.closest('.kl-bar'); return `Aa y=${Math.round(q.y)} box y=${Math.round(w.y)} h=${Math.round(w.height)} scrollY=${scrollY} docH=${document.documentElement.scrollHeight} wrap=${document.querySelector('.kl').className} bar pos=${bar && getComputedStyle(bar).position} vw=${innerWidth}`; })); else await bs.nth(j).click(); }
            await g.keyboard.press('Escape'); what = 'Aa'; } else what = 'no Aa'; }
        log.push(what); if (log.length > 8) log.shift();
        const st = await state();
        if (st.bad) errs.push(`screen shows "${st.bad}"`);
        if (st.len < 5) errs.push('game screen is blank');
        if (st.btns === 0) errs.push('nothing to press (no choice, Back, Start over or Place code)');
      } catch (e) { errs.push('action failed: ' + e.message.split('\n').slice(0, 7).join(' ⏎ ')); }
      if (errs.length) { ok(false, `story ${seed} (back ${P.game.back}, place ${P.game.place}) step ${i}: ${errs.slice(0, 3).join('; ')} after: ${log.join(' | ')}`); break; }
      if (i === STEPS - 1) ok(true, `story ${seed} (back ${P.game.back}, place ${P.game.place}): ${STEPS} steps (${moves} moves, ${backs} Backs, ${codes} place codes) no problems`);
    }
    await ctx.close();
  }
  await b.close(); console.log(fails ? 'FUZZ FAILED' : 'FUZZ OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
