/* A game's saved place gets damaged or comes from an older version of the story: the game must start (or carry on) without an error and always show something to press.
   Usage: node fuzz4.js [firefox|chromium] [mutations=40] */
const which = process.argv[2] || 'firefox', NM = +process.argv[3] || 40;
const B = require('./engine').pick(which), fs = require('fs');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const files = fs.readdirSync(__dirname + '/work').filter(f => /^fuzz2-firefox-\d+\.html$/.test(f)).slice(0, 8);
(async () => {
  const b = await B.launch(); let n = 0, bad = 0;
  for (const f of files) {
    const ctx = await b.newContext({ viewport: { width: 900, height: 800 } }); const g = await ctx.newPage(); const errs = [];
    g.on('pageerror', e => errs.push(e.message)); g.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await g.goto('file://' + __dirname + '/work/' + f); await g.waitForTimeout(200);
    for (let i = 0; i < 4; i++) { const c = g.locator('.kl-choices button:not([disabled]), .kl-ask button'); if (await c.count()) await c.first().click(); }
    await g.waitForTimeout(100); await g.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const keys = await g.evaluate(() => Object.keys(localStorage).filter(k => !/comfort|found|endings/.test(k)).map(k => [k, localStorage.getItem(k)]));
    let s = 99 + f.length; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let m = 0; m < NM; m++) {
      const [k, v] = keys[Math.floor(rnd() * keys.length)]; let t = v; let o = null;
      try { o = JSON.parse(v); } catch (e) {}
      const r = rnd();
      if (!o || typeof o !== 'object' || r < 0.12) t = pick(rnd, ['', '{', 'null', '[]', '{}', '"x"', '123', v.slice(0, Math.floor(v.length / 2))]);
      else { const flat = []; (function w(x, p) { if (x && typeof x === 'object') for (const kk of Object.keys(x)) { flat.push([x, kk]); w(x[kk], p); } })(o, 0); const [par, kk] = flat[Math.floor(rnd() * flat.length)] || [o, 'pid'];
        const q = rnd(); if (q < 0.5) par[kk] = pick(rnd, [null, '', 0, -5, 1e9, 'nope', [], {}, 'x'.repeat(300), true]); else if (q < 0.7) delete par[kk]; else par[kk] = typeof par[kk] === 'number' ? par[kk] + 999 : par[kk];
        t = JSON.stringify(o); }
      await g.evaluate(([k, t]) => { localStorage.setItem(k, t); Storage.prototype.setItem = function () {}; }, [k, t]); // the game saves on hide: no writes until the page is reloaded
      errs.length = 0;
      await g.reload(); await g.waitForTimeout(120); n++;
      const st = await g.evaluate(() => { const t = (document.querySelector('.kl') || document.body).innerText; return { len: t.length, bad: (t.match(/\bundefined\b|\bNaN\b|\[object \w+\]/) || [''])[0], btns: [...document.querySelectorAll('.kl button, .kl summary')].filter(e => e.getClientRects().length).length }; });
      const probs = errs.slice(); if (st.bad) probs.push('shows ' + st.bad); if (st.len < 5) probs.push('blank'); if (!st.btns) probs.push('nothing to press');
      if (probs.length) { bad++; ok(false, `${f} key ${k} mutation ${m}: ${probs.join('; ')} | saved text: ${t.slice(0, 160)}`); }
      await g.evaluate(() => { for (const k of Object.keys(localStorage)) if (!/comfort/.test(k)) localStorage.removeItem(k); });
      for (const [kk, vv] of keys) await g.evaluate(([a, c]) => localStorage.setItem(a, c), [kk, v === vv ? vv : vv]);
    }
    await ctx.close();
  }
  ok(!bad, `${n} damaged saved places in ${files.length} games: ${bad} problems`);
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
function pick(rnd, a) { return a[Math.floor(rnd() * a.length)]; }
