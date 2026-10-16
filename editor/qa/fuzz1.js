/* Random-click fuzzer for the editor: many seeded sequences of real clicks, typing, keys, view changes, resizes and reloads,
   checking after every step that nothing threw, the screen is not blank or showing "undefined"/"NaN", and the story is still whole.
   At the end: Undo all the way, Redo all the way, and the story must come back exactly; the autosave must match the story.
   Usage: node fuzz1.js [firefox|chromium] [steps=250] [seeds=3] */
const which = process.argv[2] || 'firefox', STEPS = +process.argv[3] || 150, SEEDS = +process.argv[4] || 2;
const B = require('./engine').pick(which);
const FILE = require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const SKIP = /\b(open|import|download|export|save|copy game|manuscript|take the tour|speed report|print)\b/i;
const WORDS = ['alpha', 'The door creaks open.', 'x', '', 'Two  spaces', 'a'.repeat(120), 'Quote "here" and it\'s', 'line\nbreak', '12', '-3'];
const SIZES = [[1280, 900], [820, 1100], [390, 780], [1600, 1000], [600, 800]];
(async () => {
  const b = await B.launch();
  for (let seed = 1; seed <= SEEDS; seed++) {
    let s = (seed + (+process.env.SEEDBASE||0)) * 7919 + 13; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const pick = a => a[Math.floor(rnd() * a.length)];
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('fz')) { sessionStorage.setItem('fz', '1'); localStorage.setItem('story-editor-v1-settings', JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } })); localStorage.setItem('story-editor-v1-toured', '1'); } } catch (e) {} });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    pg.on('dialog', d => d.dismiss().catch(() => {}));
    const load = async () => { await pg.goto(FILE); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(200); };
    await load();
    const log = []; let changes = 0, lastJ = '';
    const invariants = () => pg.evaluate(() => {
      const out = []; const P = __editor.project; const ids = new Set(P.passages.map(p => p.id));
      if (ids.size !== P.passages.length) out.push('duplicate page ids');
      if (!ids.has(P.start)) out.push('start page missing');
      else if (P.passages.find(p => p.id === P.start).ending) out.push('start page is an ending');
      P.passages.forEach(p => { if (!Array.isArray(p.blocks) || !Array.isArray(p.choices)) out.push('bad page ' + p.id); else p.choices.forEach(c => { if (c.to && !ids.has(c.to)) out.push('dangling choice target in ' + p.name); }); });
      const main = document.querySelector('#main'); if (!main || !main.children.length) out.push('main area is blank');
      if (document.querySelectorAll('dialog[open]').length > 1) out.push('two dialogs open');
      const t = document.body.innerText; const m = t.match(/\bundefined\b|\bNaN\b|\[object \w+\]|\bnull\b/); if (m) out.push('screen shows "' + m[0] + '"');
      return out;
    });
    const act = async () => {
      const r = rnd();
      if (r < 0.62) { // click something visible
        const info = await pg.evaluate(([skipSrc, rv]) => {
          const skip = new RegExp(skipSrc, 'i'); const dlg = document.querySelector('dialog[open], .ctx, .picker');
          const root = dlg && rv < 0.8 ? dlg : document;
          const els = [...root.querySelectorAll('button, [role=tab], [role=menuitem], label, summary, input[type=checkbox], input[type=radio], .grip, .node, select')].filter(e => {
            if (e.disabled || !e.getClientRects().length) return false; const tx = (e.innerText || e.title || e.getAttribute('aria-label') || '').trim(); if (skip.test(tx) || skip.test(e.title || '')) return false;
            if (e.closest('#tour')) return false;
            if (e.tagName === 'SELECT' && dlg && !dlg.contains(e)) return false; // a person cannot reach a select behind an open dialog, and the change event below would skip that
            return true; });
          if (!els.length) return null; const e = els[Math.floor(rv * 9973) % els.length];
          e.scrollIntoView({ block: 'center', inline: 'center' });
          if (e.tagName === 'SELECT') { const o = [...e.options]; e.value = o[Math.floor(rv * 7919) % o.length].value; e.dispatchEvent(new Event('change', { bubbles: true })); return { sel: true, t: (e.id || e.className) }; }
          const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2, t: (e.innerText || e.title || e.className || e.tagName).slice(0, 30) };
        }, [SKIP.source, rnd()]);
        if (!info) return 'nothing to click'; if (info.sel) return 'select ' + info.t;
        await pg.mouse.click(info.x, info.y); return 'click ' + JSON.stringify(info.t);
      }
      if (r < 0.78) { // type into a box
        const info = await pg.evaluate(rv => { const els = [...document.querySelectorAll('textarea, input[type=text], input:not([type])')].filter(e => e.getClientRects().length && !e.disabled && !e.readOnly); if (!els.length) return null; const e = els[Math.floor(rv * 9973) % els.length]; e.scrollIntoView({ block: 'center' }); e.focus(); return e.id || e.className || e.tagName; }, rnd());
        if (!info) return 'no box'; const w = pick(WORDS);
        if (rnd() < 0.3) await pg.keyboard.press('Control+a');
        await pg.keyboard.type(w.replace(/\n/g, ' '), { delay: 0 }); if (rnd() < 0.4) await pg.keyboard.press(pick(['Enter', 'Tab', 'Escape'])); return 'type in ' + info;
      }
      if (r < 0.88) { const k = pick(['Control+z', 'Control+y', 'Control+z', 'Escape', 'Control+k', 'Alt+ArrowUp', 'Alt+ArrowDown', 'Tab', 'Shift+Tab', 'Enter']); await pg.keyboard.press(k); return 'key ' + k; }
      if (r < 0.94) { const v = pick(['write', 'map', 'items', 'game', 'check', 'play']); await pg.evaluate(v => { try { __editor.setView(v); } catch (e) { } }, v); return 'view ' + v; }
      if (r < 0.995) { const z = pick(SIZES); await pg.setViewportSize({ width: z[0], height: z[1] }); return 'resize ' + z; }
      await pg.waitForTimeout(600); await load(); return 'reload';
    };
    for (let i = 0; i < STEPS; i++) {
      let what; try { what = await act(); } catch (e) { what = 'ACTION ERROR ' + e.message.split('\n')[0]; }
      const nowJ = await pg.evaluate(() => JSON.stringify(__editor.project)).catch(() => lastJ); if (nowJ !== lastJ) { changes++; lastJ = nowJ; }
      log.push(what); if (log.length > 12) log.shift();
      const bad = await invariants().catch(e => ['invariant check failed: ' + e.message]);
      if (bad.length || errs.length) { ok(false, `seed ${seed} step ${i}: ${bad.concat(errs).join('; ')} after: ${log.join(' | ')}`); break; }
      if (i === STEPS - 1) ok(true, `seed ${seed}: ${STEPS} random steps (${changes} changed the story), story whole, no errors`);
    }
    if (!errs.length) { // undo everything, redo everything: the same story must come back; the autosave must match
      await pg.keyboard.press('Escape'); await pg.evaluate(() => document.activeElement && document.activeElement.blur());
      await pg.evaluate(() => { document.querySelectorAll('dialog[open]').forEach(d => d.close()); });
      let m0 = 0; while (m0++ < 400 && await pg.evaluate(() => { const u = document.querySelector('#redo'); if (u.disabled) return false; u.click(); return true; })) { } // start from the newest state
      const before = await pg.evaluate(() => JSON.stringify(__editor.project));
      let n = 0; while (n++ < 400 && await pg.evaluate(() => { const u = document.querySelector('#undo'); if (u.disabled) return false; u.click(); return true; })) { }
      let m = 0; while (m++ < 400 && await pg.evaluate(() => { const u = document.querySelector('#redo'); if (u.disabled) return false; u.click(); return true; })) { }
      const after = await pg.evaluate(() => JSON.stringify(__editor.project));
      ok(before === after, `seed ${seed}: undo all (${n - 1}) then redo all (${m - 1}) gives the same story back`);
      await pg.waitForTimeout(1200);
      const saved = await pg.evaluate(() => localStorage.getItem('story-editor-v1'));
      ok(saved === after, `seed ${seed}: the autosave matches the story`);
      ok(!errs.length, `seed ${seed}: no errors during undo/redo ${errs.slice(0, 2).join('; ')}`);
    }
    await ctx.close();
  }
  await b.close(); console.log(fails ? 'FUZZ FAILED' : 'FUZZ OK'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
