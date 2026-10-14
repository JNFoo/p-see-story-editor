/* The phone layout: bottom icon tab bar, one-row top bar with a ⋯ menu, the pinned page-name bar (‹ › history, swipe, ↑ settings),
   typing mode (a slim key row), the folded page type, and tour / guide wording with no keyboard or mouse in it.
   Usage: node phone.js [chromium|firefox]   Copyright (c) 2026 JNFoo. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_phone_test"');
const SETTINGS = JSON.stringify({ chosen: true, remember: true, tourDone: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  await ctx.addInitScript(([s, st]) => { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); localStorage.setItem('story-editor-v1', s); } }, [sample, SETTINGS]);
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(600);
  await pg.evaluate(() => window.__editor.touch(true)); await pg.waitForTimeout(200);
  const box = sel => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: r.x, y: r.y, w: r.width, h: r.height, shown: !!e.getClientRects().length && cs.visibility !== 'hidden' && cs.display !== 'none' }; }, sel);
  const esc = async () => { await pg.keyboard.press('Escape'); await pg.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))); }; /* a phone has no keys: the last input counts as touch */
  const pname = () => pg.evaluate(() => document.querySelector('#pname') && document.querySelector('#pname').value);

  /* bottom tab bar */
  const tr = await box('#tabrow');
  ok(tr && tr.shown && Math.abs(tr.y + tr.h - 844) < 4, 'the tabs sit along the bottom edge: ' + JSON.stringify(tr));
  const sw = await pg.evaluate(() => { const t = document.getElementById('tabs') || document.getElementById('tabrow'); return [t.scrollWidth, t.clientWidth]; });
  ok(sw[0] <= sw[1] + 1, 'the tabs need no sideways scroll: ' + sw.join(' / '));
  const nt = await pg.evaluate(() => document.querySelectorAll('#tabs button').length);
  ok(nt === 6, 'six tabs: ' + nt);
  const small = await pg.evaluate(() => [...document.querySelectorAll('#tabs button')].filter(x => x.getBoundingClientRect().height < 40).length);
  ok(small === 0, 'every tab is at least 40 px tall');

  /* one-row top bar */
  const top = await box('#top');
  ok(top && top.h <= 62, 'the top bar is one row: ' + (top && top.h));
  ok((await box('#morebtn')).shown, 'the ⋯ button shows');
  ok(!(await box('#export')).shown && !(await box('#help')).shown, 'Export and the help button are not in the top bar');
  await pg.locator('#morebtn').click(); await pg.waitForTimeout(250);
  const mt = await pg.evaluate(() => document.getElementById('morepop').innerText);
  ok(/Export game/.test(mt) && /History/.test(mt) && /words/.test(mt), 'the ⋯ menu holds Export game, History and the story size: ' + mt.replace(/\s+/g, ' ').slice(0, 120));
  ok(!/Keyboard shortcuts/.test(mt), 'no Keyboard shortcuts entry on a touch device');
  await esc(); await pg.waitForTimeout(150);

  /* the pinned bar and the room for text */
  const db = await box('#drawerbar');
  ok(db && db.shown && db.y < 70 && db.h <= 56, 'the page-name bar is pinned under the top bar: ' + JSON.stringify(db));
  const ta = await pg.evaluate(() => { const t = document.querySelector('#main textarea'); return t ? t.getBoundingClientRect().top : -1; });
  ok(ta > 0 && ta < 400, 'the first paragraph starts in the upper half of the screen: ' + ta);
  const fx = await pg.evaluate(() => { const d = document.querySelector('#main details.fxfold'); return d ? [d.open, d.querySelector('summary').textContent] : null; });
  ok(fx && fx[0] === false && /Page type and effects/.test(fx[1]), 'page type and effects are folded to one line: ' + JSON.stringify(fx));

  /* history ‹ › and the ↑ settings button */
  const first = await pname();
  await pg.evaluate(() => { const E = window.__editor; E.openPage(E.project.passages[2]); }); await pg.waitForTimeout(300);
  const second = await pname();
  ok(first !== second, 'another page opened: ' + first + ' -> ' + second);
  await pg.locator('#drawerbar .dback').click(); await pg.waitForTimeout(300);
  ok((await pname()) === first, 'the ‹ button goes back to the page before');
  await pg.locator('#drawerbar .dfwd').click(); await pg.waitForTimeout(300);
  ok((await pname()) === second, 'the › button goes forward again');
  await pg.evaluate(() => { document.getElementById('main').scrollTop = 600; });
  await pg.locator('#drawerbar .dsettings').click(); await pg.waitForTimeout(400);
  const st = await pg.evaluate(() => [document.getElementById('main').scrollTop, document.querySelector('#main details.fxfold').open]);
  ok(st[0] < 20 && st[1] === true, '↑ scrolls to the top and opens the page type and effects: ' + st.join(' '));

  /* swipe the bar */
  const order = await pg.evaluate(() => [...document.querySelectorAll('#side li button.pg, #side .pgrow, #side li[data-id]')].length);
  const swipe = async dx => {
    const r = await box('#drawerbar .pagepick');
    const y = r.y + r.h / 2, x0 = dx < 0 ? r.x + r.w - 10 : r.x + 10;
    await pg.evaluate(([x0, y, dx]) => {
      const el = document.getElementById('drawerbar'); const mk = (t, x) => new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: t === 'pointerup' ? 0 : 1 });
      el.dispatchEvent(mk('pointerdown', x0)); el.dispatchEvent(mk('pointermove', x0 + dx / 2)); el.dispatchEvent(mk('pointermove', x0 + dx)); el.dispatchEvent(mk('pointerup', x0 + dx));
    }, [x0, y, dx]);
    await pg.waitForTimeout(350);
  };
  const p0 = await pname(); await swipe(-120); const p1 = await pname();
  ok(p1 !== p0, 'swiping the bar left opens another page: ' + p0 + ' -> ' + p1);
  await swipe(120); const p2 = await pname();
  ok(p2 === p0, 'swiping right comes back: ' + p2);

  /* typing mode: only a slim key row stays */
  await pg.evaluate(() => window.__editor.typing(true)); await pg.waitForTimeout(250);
  const kr = await box('#keyrow');
  ok(kr && kr.shown && kr.h <= 56, 'the key row shows while typing: ' + JSON.stringify(kr));
  ok(!(await box('#top')).shown && !(await box('#tabrow')).shown && !(await box('#drawerbar')).shown, 'the top bar, the tabs and the page bar fold away while typing');
  const kt = await pg.evaluate(() => [...document.querySelectorAll('#keyrow button')].map(x => x.textContent.trim()));
  ok(/Paragraph/.test(kt.join('|')) && /Choice/.test(kt.join('|')) && /Done/.test(kt.join('|')), 'the key row has + Paragraph, + Choice and Done: ' + kt.join('|'));
  const nb = await pg.evaluate(() => window.__editor.project.passages.find(p => document.querySelector('#pname').value === p.name)); 
  const cnt = () => pg.evaluate(() => { const p = window.__editor.project.passages.find(p => p.name === document.querySelector('#pname').value); return p ? [p.blocks.length, p.choices.length] : null; });
  const c0 = await cnt();
  await pg.locator('#keyrow button:has-text("Paragraph")').click(); await pg.waitForTimeout(300);
  const c1 = await cnt();
  ok(c1 && c0 && c1[0] === c0[0] + 1, '+ Paragraph adds a paragraph: ' + c0 + ' -> ' + c1);
  await pg.locator('#keyrow button:has-text("Done")').click(); await pg.waitForTimeout(300);
  ok((await box('#tabrow')).shown && (await box('#drawerbar')).shown && !(await box('#keyrow')).shown, 'Done brings the tabs and page bar back');

  /* tour and guide have no keyboard in them on touch */
  await pg.evaluate(() => { const e = [...document.querySelectorAll('#morepop button')]; }); 
  await pg.locator('#morebtn').click(); await pg.waitForTimeout(200);
  await pg.locator('#morepop button:has-text("Take the tour")').click(); await pg.waitForTimeout(500);
  const texts = [];
  for (let i = 0; i < 12; i++) {
    const t = await pg.evaluate(() => { const d = document.querySelector('.tour, #tour'); return d ? d.innerText : ''; });
    if (!t) break; texts.push(t);
    const nx = pg.locator('.tour button:has-text("Next"), #tour button:has-text("Next")');
    if (!(await nx.count())) break; await nx.first().click(); await pg.waitForTimeout(350);
  }
  ok(texts.length >= 5, 'the tour ran: ' + texts.length + ' steps');
  const bad = texts.filter(t => /Ctrl|Shift\+|Shift click|right-click|hover|every shortcut/i.test(t));
  ok(bad.length === 0, 'no tour step mentions keys, right-click or hover: ' + JSON.stringify(bad.map(t => t.slice(0, 80))));
  await esc(); await pg.waitForTimeout(300);
  await pg.evaluate(() => window.__editor.xl && 0);
  await pg.locator('#morebtn').click(); await pg.waitForTimeout(200);
  await pg.locator('#morepop button:has-text("Quick guide")').click(); await pg.waitForTimeout(400);
  const g = await pg.evaluate(() => { const d = document.querySelector('dialog.guide[open]'); return d ? d.innerText : ''; });
  ok(/Using a phone or tablet/.test(g), 'the guide opens with a phone section');
  const gl = g.split('\n').filter(l => /Ctrl\+|Shift\+click|Alt\+|Right-click a page|Hover a page/.test(l));
  ok(gl.length === 0, 'the guide has no keyboard shortcut lines on touch: ' + JSON.stringify(gl.map(l => l.slice(0, 70))));
  await esc(); await pg.waitForTimeout(200);

  /* item menu: Gets / Loses by press and hold menu */
  await pg.evaluate(() => { document.body.classList.remove('typing'); });
  const im = await pg.evaluate(() => { const E = window.__editor; return E.project.items.length; });
  if (im) {
    await pg.locator('#drawerbar .dbtn').last().click(); await pg.waitForTimeout(500);
    const r = await pg.evaluate(() => { const e = [...document.querySelectorAll('#itemlist li button')].find(x => x.querySelector('.nm')); if (!e) return null; const q = e.getBoundingClientRect(); return [q.x + 20, q.y + 10]; });
    if (r) {
      await pg.evaluate(([x, y]) => { const e = [...document.querySelectorAll('#itemlist li button')].find(x => x.querySelector('.nm')); e.dispatchEvent(new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true, cancelable: true })); }, r); await pg.waitForTimeout(300);
      const cm = await pg.evaluate(() => (document.querySelector('.ctx') || {}).innerText || '');
      ok(/Gets|Add a change/.test(cm) && (/Loses/.test(cm) || /Add a change/.test(cm)), 'an item’s menu offers Gets and Loses: ' + cm.replace(/\s+/g, ' ').slice(0, 100));
    } else ok(false, 'no item button found');
  }

  /* desktop widths are unchanged */
  await pg.setViewportSize({ width: 1200, height: 850 }); await pg.evaluate(() => window.__editor.touch(null)); await pg.waitForTimeout(500);
  const dt = await box('#tabrow');
  ok(dt && dt.y < 200 && !(await box('#morebtn')).shown, 'at desktop width the tabs are at the top and there is no ⋯ button: ' + JSON.stringify(dt));
  ok(errs.length === 0, 'no script errors: ' + errs.join(' | '));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
