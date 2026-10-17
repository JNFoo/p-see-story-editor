/* The editor's own page policy (the Content-Security-Policy meta tag build.py writes): no network, no 'unsafe-eval', and WebAssembly allowed ('wasm-unsafe-eval' in
   script-src, the owner's rule of 2026-10-17). Checks the text of the tag, then asks the browser: a tiny WebAssembly module compiles in a script of the page (it is refused without the token).
   Usage: node csp.js [chromium|firefox|webkit]   (WEBKIT=epiphany node csp.js webkit  runs it in GNOME Web)   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs'), path = require('path');
const EDITOR_FILE = process.env.QA_EDITOR || path.join(__dirname, '..', 'story-editor.html');
const EDITOR = require('url').pathToFileURL(EDITOR_FILE).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  /* the delivered file is packed (compressed), so the policy text is read from the plain page it is made from */
  const PLAIN = EDITOR_FILE.replace(/\.html$/, '.plain.html');
  const html = fs.readFileSync(fs.existsSync(PLAIN) ? PLAIN : EDITOR_FILE, 'utf8');
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  ok(!!m, 'the editor file carries a Content-Security-Policy tag');
  const policy = m ? m[1] : '';
  const dir = {}; policy.split(';').map(s => s.trim()).filter(Boolean).forEach(s => { const [n, ...v] = s.split(/\s+/); dir[n] = v.join(' '); });
  ok(dir['script-src'] === "'unsafe-inline' 'wasm-unsafe-eval'", "script-src allows the page's own scripts and WebAssembly, nothing else: " + dir['script-src']);
  ok(dir['default-src'] === "'none'" && dir['connect-src'] === "'none'" && dir['form-action'] === "'none'" && dir['base-uri'] === "'none'", 'no network, no forms, no base tag: default-src, connect-src, form-action and base-uri stay none');
  ok(dir['style-src'] === "'unsafe-inline'" && dir['img-src'] === 'data:' && dir['font-src'] === 'data:', 'style-src, img-src and font-src are as before');
  ok(!/unsafe-eval'/.test(policy.replace("'wasm-unsafe-eval'", '')), "'unsafe-eval' is not in the policy");

  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 });
  /* the test code runs as a script inside the page, under its policy; the automation's own evaluate bypasses the policy and would prove nothing */
  await pg.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = `window.__csp = {};
      try { new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); window.__csp.wasm = 'ok'; } catch (e) { window.__csp.wasm = String(e && e.message || e).slice(0, 80); }
      window.__csp.done = 1;`;
    document.head.appendChild(s);
  });
  await pg.waitForFunction(() => window.__csp && window.__csp.done);
  const r = await pg.evaluate(() => window.__csp);
  ok(r.wasm === 'ok', 'a tiny WebAssembly module compiles in a script of the editor page' + (r.wasm === 'ok' ? '' : ': ' + r.wasm));
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));

  /* the same for a finished game: the policy line the games share (CSP_OFFLINE) carries the token, and the browser lets the game's page compile a module */
  const { buildGame, makeProject } = await import(path.join(__dirname, '..', '..', 'packages', 'story-player', 'dist', 'story-player.mjs'));
  const game = buildGame(makeProject('Policy test'));
  const gm = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(game);
  ok(!!gm && gm[1] === policy, 'an exported game carries the same policy as the editor page, token included');
  const GAME_FILE = path.join(__dirname, 'work', 'csp-game.html');
  fs.writeFileSync(GAME_FILE, game);
  const gp = pg; /* the same window: one window is all this needs, which GNOME Web (WEBKIT=epiphany) handles best */
  await gp.goto(require('url').pathToFileURL(GAME_FILE).href); await gp.waitForTimeout(500);
  await gp.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = `window.__csp = {};
      try { new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); window.__csp.wasm = 'ok'; } catch (e) { window.__csp.wasm = String(e && e.message || e).slice(0, 80); }
      window.__csp.done = 1;`;
    document.head.appendChild(s);
  });
  await gp.waitForFunction(() => window.__csp && window.__csp.done);
  const gr = await gp.evaluate(() => window.__csp);
  ok(gr.wasm === 'ok', 'a tiny WebAssembly module compiles in a script of an exported game' + (gr.wasm === 'ok' ? '' : ': ' + gr.wasm));
  ok(errs.length === 0, 'no page errors in the game' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
