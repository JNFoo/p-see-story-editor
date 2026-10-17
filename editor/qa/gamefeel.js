/* Three small reader-facing features of the exported game:
   - a choice already taken in this run gets a check mark and lighter type (and it differs from a greyed-out locked choice);
   - the phone's back swipe or button (and Esc) does the game's Back while there is a page to go back to, then leaves normally (CloseWatcher);
   - contrast starts as the system asks (prefers-contrast: more) until the reader chooses, and a forced-colors rule exists.
   Usage: node gamefeel.js [firefox|chromium]   (needs "npm run build" at the repo root for packages/story-player)   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox';
const B = require('./engine').pick(which), fs = require('fs'), path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const { buildGame } = await import('../../packages/story-player/src/index.js');
  const story = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.story.json'), 'utf8'));
  story.game = { ...story.game, back: 'remember', comfort: true };
  const file = path.join(__dirname, 'work', `gamefeel-${which}.html`);
  fs.writeFileSync(file, buildGame(story));
  const url = 'file://' + file;
  const b = await B.launch(); const errs = [];
  async function open(init) {
    const ctx = await b.newContext({ viewport: { width: 420, height: 800 } }); if (init) await ctx.addInitScript(init);
    const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url); await pg.waitForSelector('.kl-page', { timeout: 15000 }); return { pg, ctx };
  }
  const head = pg => pg.evaluate(() => (document.querySelector('.kl-page h2, .kl-page p') || {}).textContent || '');
  const choices = pg => pg.locator('.kl-choices button');
  const settle = pg => pg.waitForTimeout(250);

  /* ---- 1. already-taken cue ---- */
  let t = await open(); let pg = t.pg;
  ok(await pg.locator('.kl-choices button.seen').count() === 0, 'nothing is marked on a page nobody has left');
  const first = await head(pg); const label = (await choices(pg).first().innerText()).trim();
  await choices(pg).first().click(); await settle(pg);
  const second = await head(pg);
  ok(second !== first, 'a choice moved to another page');
  await pg.locator('.kl-bar button', { hasText: 'Back' }).click(); await settle(pg);
  ok(await head(pg) === first, 'Back returned to the first page');
  const marked = await pg.locator('.kl-choices button.seen').count();
  ok(marked === 1, 'exactly the choice taken is marked on the way back (' + marked + ')');
  const info = await pg.evaluate(() => { const bt = document.querySelector('.kl-choices button.seen'); const o = document.querySelector('.kl-choices button:not(.seen)'); return { after: getComputedStyle(bt, '::after').content, w: getComputedStyle(bt).fontWeight, other: o ? getComputedStyle(o).fontWeight : '', otherAfter: o ? getComputedStyle(o, '::after').content : '' }; });
  ok(/✓/.test(info.after), 'the marked choice carries a check mark (' + info.after + ')');
  ok(info.other === '' || +info.w < +info.other, 'and lighter type than an untaken choice (' + info.w + ' vs ' + info.other + ')');
  ok(!/✓/.test(info.otherAfter), 'an untaken choice has no check mark');
  await t.ctx.close();

  /* ---- 2. back swipe (CloseWatcher; Esc is a close request too) ---- */
  t = await open(); pg = t.pg;
  const hasCW = await pg.evaluate(() => typeof window.CloseWatcher === 'function');
  /* WebKitGTK 2.52.6 has no CloseWatcher; the game uses it only where it exists, so there Esc must leave the page alone (checked below) */
  ok(hasCW || which === 'webkit', 'this browser has CloseWatcher' + (hasCW ? '' : ' (WebKit: it has not, so Esc does not go Back)'));
  const p1 = await head(pg);
  await pg.keyboard.press('Escape'); await settle(pg);
  ok(await head(pg) === p1, 'on the first page a close request changes nothing (nothing to go back to)');
  await choices(pg).first().click(); await settle(pg);
  const p2 = await head(pg);
  ok(p2 !== p1, 'moved on');
  /* the Aa panel: Esc closes only the panel */
  await pg.locator('.kl-aa summary').click(); await settle(pg);
  ok(await pg.locator('.kl-aa[open]').count() === 1, 'the Aa panel is open');
  await pg.keyboard.press('Escape'); await settle(pg);
  ok(await pg.locator('.kl-aa[open]').count() === 0 && await head(pg) === p2, 'Esc closed only the Aa panel: still on the second page');
  await pg.keyboard.press('Escape'); await settle(pg);
  ok(await head(pg) === (hasCW ? p1 : p2), hasCW ? 'a close request (Esc / back swipe) went Back to the first page' : 'without CloseWatcher, Esc does not go Back (still on the second page)');
  await pg.keyboard.press('Escape'); await settle(pg);
  ok(await head(pg) === (hasCW ? p1 : p2) && errs.length === 0, hasCW ? 'and on the first page it changes nothing again' : 'and a second Esc changes nothing either');
  await t.ctx.close();

  /* ---- 3. contrast follows the system until the reader chooses ---- */
  const sysMore = () => { const mm = window.matchMedia.bind(window); window.matchMedia = q => /prefers-contrast:\s*more/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q); };
  t = await open(); pg = t.pg;
  ok(await pg.locator('.kl.cf-hc').count() === 0, 'no system request: normal contrast');
  await t.ctx.close();
  t = await open(sysMore); pg = t.pg;
  ok(await pg.locator('.kl.cf-hc').count() === 1, 'the system asks for more contrast: the game starts in High');
  await pg.locator('.kl-aa summary').click();
  const hcRow = f => pg.evaluate(f => { const r = [...document.querySelectorAll('.kl-aa-row')].find(x => /Contrast/.test(x.textContent)); return f === 'pressed' ? [...r.querySelectorAll('button')].filter(x => x.getAttribute('aria-pressed') === 'true').map(x => x.textContent).join() : [...r.querySelectorAll('button')].find(x => x.textContent === f).click(); }, f);
  const pressed = await hcRow('pressed');
  ok(pressed === 'High', 'the Aa panel shows High pressed (' + pressed + ')');
  await hcRow('Normal');
  ok(await pg.locator('.kl.cf-hc').count() === 0, 'pressing Normal turns it off');
  await pg.reload(); await pg.waitForSelector('.kl-page');
  ok(await pg.locator('.kl.cf-hc').count() === 0, 'and the reader\'s choice beats the system after a reload');
  const forced = await pg.evaluate(() => [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.conditionText && /forced-colors/.test(r.conditionText)); } catch (e) { return false; } }));
  ok(forced, 'a forced-colors rule is in the game\'s styles');
  await t.ctx.close();
  /* ---- 4. "Roads not taken" in the ending's recap ---- */
  t = await open(); pg = t.pg;
  let rnd = 12345; /* a seeded pseudo-random player, so the run is the same every time */
  for (let n = 0; n < 300 && await pg.locator('.kl-end').count() === 0; n++) { const cn = await choices(pg).count(); rnd = (rnd * 1103515245 + 12345) % 2147483648; await choices(pg).nth(Math.floor(rnd / 2147483648 * cn)).click(); await pg.waitForTimeout(40); }
  if (!(await pg.locator('.kl-end').count())) console.log('STUCK', (await pg.evaluate(() => document.body.innerText)).slice(0, 400));
  ok(await pg.locator('.kl-end').count() === 1, 'a run that varies its choices reaches an ending');
  const roads = await pg.evaluate(() => [...document.querySelectorAll('.kl-roads li .kl-skip')].map(x => x.textContent.replace(/^→ /, '')));
  const open1 = await pg.evaluate(() => document.querySelector('.kl-recap summary').textContent);
  ok(/^See the path you took/.test(open1), 'the recap keeps its title: ' + open1);
  ok(roads.length > 0 && (await pg.locator('.kl-roads-h').textContent()) === 'Roads not taken', 'the recap lists roads not taken (' + roads.length + '): ' + roads.slice(0, 3).join(' | '));
  const anyone = new Map(); story.passages.forEach(q => q.choices.forEach(c => { if (!(c.needs || []).length && !(c.forbid || []).length) anyone.set(c.label, 1); }));
  ok(roads.every(r => anyone.has(r)), 'every listed road is a choice anyone could see: no choice that needs or forbids an item is listed');
  const gated = []; story.passages.forEach(q => q.choices.forEach(c => { if ((c.needs || []).length || (c.forbid || []).length) gated.push(c.label); }));
  ok(roads.every(r => !gated.includes(r) || anyone.has(r)), 'and no gated label leaks (' + gated.length + ' gated choices in this story)');
  await t.ctx.close();
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
