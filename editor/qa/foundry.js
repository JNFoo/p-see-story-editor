/* The LFC Foundry notices: the header comment at the top of the editor file and of every exported game (zipped or not), and the one
   visible credit, a footer inside the editor app (a line on wide windows, the last ⋯ menu entry on narrow ones). Games show no credit.
   Usage: node foundry.js [chromium|firefox]   Copyright (c) 2026 LFC Foundry. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs'), path = require('path');
const EDITOR_FILE = process.env.QA_EDITOR || path.join(__dirname, '..', 'story-editor.html');
const EDITOR = require('url').pathToFileURL(EDITOR_FILE).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const want = name => fs.readFileSync(path.join(__dirname, '..', 'foundry-header.txt'), 'utf8').replace(/\n$/, '').replace('{NAME}', name);
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_foundry_test"');
const SETTINGS = JSON.stringify({ chosen: true, remember: true, tourDone: true });
(async () => {
  /* the files themselves */
  for (const f of ['story-editor.html', 'story-editor.plain.html', 'story-editor.artifact.html']) {
    const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const head = t.slice(0, 2500);
    ok(head.includes(want('Story Editor')), f + ' starts with the LFC Foundry header, application name filled in');
  }
  const top = fs.readFileSync(EDITOR_FILE, 'utf8').slice(0, 2500);
  ok(/APPLICATION : Story Editor\n/.test(top) && top.includes('FORGED BY : LFC Foundry (https://github.com/lfcfoundry)') && top.includes('Copyright (c) 2026 LFC Foundry') && top.includes('BRANDING NOTICE'), 'the delivered file names the application, the forge, the copyright holder and the branding notice');
  ok(!/Copyright \(c\) 2026 JNFoo/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'LICENSE'), 'utf8')) && /Copyright \(c\) 2026 LFC Foundry/.test(fs.readFileSync(path.join(__dirname, '..', '..', 'LICENSE'), 'utf8')), 'LICENSE names LFC Foundry');

  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, locale: 'en-US' });
  await ctx.addInitScript(([s, st]) => { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); localStorage.setItem('story-editor-v1', s); } }, [sample, SETTINGS]);
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(600);
  const box = sel => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, shown: !!e.getClientRects().length && getComputedStyle(e).display !== 'none', text: e.textContent }; }, sel);

  /* the footer: visible on a wide window, at the bottom */
  const f = await box('#foundry');
  ok(f && f.shown && /^Forged by LFC Foundry • MIT Licensed$/.test(f.text.trim()), 'a wide window shows the footer "Forged by LFC Foundry • MIT Licensed": ' + (f && JSON.stringify(f.text)));
  ok(f && f.y + f.h >= 795 && f.h < 30, 'it is one slim line at the very bottom: ' + JSON.stringify(f));
  const href = await pg.evaluate(() => { const a = document.querySelector('#foundry a'); return a && [a.href, a.target, a.rel]; });
  ok(href && href[0] === 'https://github.com/lfcfoundry' && /noopener/.test(href[2]), 'the name links to https://github.com/lfcfoundry in a new tab, safely: ' + JSON.stringify(href));
  const ov = await pg.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.body.scrollHeight <= innerHeight + 1);
  ok(ov, 'the footer does not make the page scroll');

  /* narrow: no footer line, the credit is the last ⋯ entry */
  await pg.setViewportSize({ width: 390, height: 844 }); await pg.evaluate(() => window.__editor.touch(true)); await pg.waitForTimeout(400);
  ok(!(await box('#foundry')).shown, 'a narrow window has no footer line (the height is kept for the writing)');
  await pg.locator('#morebtn').click(); await pg.waitForTimeout(250);
  const last = await pg.evaluate(() => { const b = [...document.querySelectorAll('#morepop button')]; return b.length ? b[b.length - 1].textContent.trim() : ''; });
  ok(last === 'Forged by LFC Foundry • MIT Licensed', 'the ⋯ menu ends with the credit: ' + last);
  await pg.keyboard.press('Escape');

  /* exported games: header comment only, no visible credit, no change to the title */
  const mk = title => pg.evaluate(t => { const parts = JSON.parse(document.getElementById('game-parts').textContent); const p = normalizeProject(JSON.parse(JSON.stringify(window.__editor.project))); p.title = t; return buildGameHtml(p, { parts, fonts: '' }); }, title);
  const g = await mk('The Keeper’s Light');
  ok(g.startsWith('<!doctype html>\n' + want('The Keeper’s Light').replace('    BRANDING NOTICE', '    This notice covers the game program. The story’s words and art belong to the story’s author.\n\n    BRANDING NOTICE')), 'an exported game starts with the header, its own title as the application name, and the line that the story stays its author’s');
  ok(!/Forged by/.test(g.replace(/<!--[\s\S]*?-->/g, '')) && /<title>The Keeper’s Light<\/title>/.test(g), 'the game shows no credit and keeps its own title');
  const g2 = await mk('Dark --> <b>Night</b> -- the end');
  const hc = /^<!doctype html>\n<!--([\s\S]*?)\n    -->/.exec(g2);
  ok(hc && !/--/.test(hc[1].replace(/={3,}/g, '')) && hc[1].includes('APPLICATION : Dark - -&gt; &lt;b&gt;Night&lt;/b&gt; - - the end') && !/<\/?b>/.test(hc[1]), 'a title with dashes or tags in it cannot close the header comment early or add markup');
  const z = await pg.evaluate(async html => { const t = await zipPage(html); return t; }, g);
  ok(z.startsWith('<!doctype html>\n<!--\n    ====') && z.includes('APPLICATION : The Keeper’s Light') && z.includes('<script type="text/plain" id="z">'), 'the zipped game file starts with the header too, readable without unzipping');
  ok(errs.length === 0, 'no script errors: ' + errs.join(' | '));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
