/* The offline writing helpers: the outline reader and the writing checks as pure functions (run on the built source), then in the editor:
   File → Paste an outline, one Undo, and the Writing notes in the Check tab with Ignore and the status-line count.
   Usage: node helpers.js [chromium|firefox]   Copyright (c) 2026 JNFoo. MIT License. */
const which = process.argv[2] || 'firefox'; const B = require('./engine').pick(which);
const fs = require('fs'); const vm = require('vm');
const EDITOR = require('url').pathToFileURL(process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html')).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

/* ---- the pure part ---- */
const ctx0 = vm.createContext({});
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'helpers.js'), 'utf8') + '\nthis.parseOutline = parseOutline; this.writingChecks = writingChecks; this.oneOff = oneOff;', ctx0);
const { parseOutline, writingChecks, oneOff } = ctx0;
const j = x => JSON.parse(JSON.stringify(x));
{
  const o = j(parseOutline('Start\n  The door is open.\n  Go in → Hall\n  Wait -> Cold night (bad ending)\n\nHall (ending)\n  Climb up => Start\n'));
  ok(o.pages.length === 2 && o.pages[0].name === 'Start' && o.pages[1].ending, 'two pages read, the second an ending');
  ok(o.pages[0].texts[0] === 'The door is open.' && o.pages[0].choices.length === 2, 'an indented line without an arrow is a paragraph, with an arrow a choice');
  ok(o.pages[0].choices[1].to === 'Cold night (bad ending)', 'an ending marker belongs to page lines only; in a choice it stays part of the target');
  const b = j(parseOutline('- Start\n    - Go → Hall\n- Hall (good ending)\n'));
  ok(b.pages.length === 2 && b.pages[1].valence === 'good' && b.pages[0].choices[0].to === 'Hall', 'bullets are ignored and "(good ending)" sets the valence');
  const t = j(parseOutline('Start\n\tGo → Hall\n'));
  ok(t.pages[0].choices.length === 1, 'tabs count as indents');
  const d = j(parseOutline('A\n B → B\nA\n C → C\n'));
  ok(d.pages.length === 1 && d.pages[0].choices.length === 2 && d.issues.length === 1, 'a page listed twice is joined and said so');
  const e = j(parseOutline('Start\n  → Hall\n  Go →\n'));
  ok(e.pages[0].choices.length === 1 && e.pages[0].choices[0].to === '' && e.issues.length === 2, 'a choice with no words is skipped, one with no target leads nowhere yet');
  ok(j(parseOutline('')).pages.length === 0 && j(parseOutline('   \n# note\n')).pages.length === 0, 'empty input gives no pages and no error');
  ok(j(parseOutline('x\n'.repeat(5000))).issues.length >= 1, 'a huge paste is cut off and says so');
}
ok(oneOff('pell', 'pel') && oneOff('pell', 'bell') && oneOff('pell', 'pelk') && oneOff('mara', 'mraa') && !oneOff('pell', 'pell') && !oneOff('pell', 'peel1') && !oneOff('cat', 'dog'), 'oneOff: a letter added, dropped, changed or two swapped');
{
  const P = (id, name, texts, choices, ending) => ({ id, name, ending: !!ending, blocks: texts.map(text => ({ text })), choices: (choices || []).map(label => ({ label })) });
  const long = ('lamp ' + 'fog door cold sea rock wind salt rope tide ').repeat(1).trim();
  const story = { passages: [
    P('a', 'Start', ['The the keeper said Pell was late. Pell waved. Pell sat. Pell left and Pel came back. Pell grinned.', 'He had had enough. That that is fine.'], ['Take the lantern', 'Take lantern.', 'Take the lantern', 'Run away fast now', 'Climb the old tower']),
    P('b', 'Lamp', ['A lantern hung by the sea. The salt wind shook the lantern all night and nobody slept. Fog came in over the rock and the old lantern flickered; a boy carried the lantern up to the gallery while his mother watched the dark water beyond the glass. The lantern burned low, and the keeper trimmed the wick of the lantern with steady hands. Morning found them cold, thin and proud of the small light they had kept going through the long storm.']),
    P('c', 'Wall', [Array.from({ length: 200 }, (_, i) => 'w' + 'abcdefghij'[i % 10] + 'xyz'[(i / 10 | 0) % 3] + 'k' + (i % 7)).join(' ')]),
    P('d', 'Ending', ['Done.'], ['Take the lantern', 'Take lantern'], true)
  ] };
  const r = j(writingChecks(story, {}));
  const kinds = k => r.filter(x => x.kind === k);
  ok(kinds('repeat').length === 1 && /word “The” is typed twice/.test(kinds('repeat')[0].msg), 'a word typed twice in a row is found (and "had had", "that that" are not): ' + kinds('repeat').map(x => x.msg).join(' | '));
  ok(kinds('name').length === 1 && /“Pel”.*“Pell”/.test(kinds('name')[0].msg), 'a name spelled two ways is found: ' + kinds('name').map(x => x.msg).join(' | '));
  ok(kinds('alike').length === 1 && /Take the lantern.*Take lantern/.test(kinds('alike')[0].msg), 'choices that read alike are found once; exact repeats and endings are left to the checker: ' + kinds('alike').length);
  ok(kinds('long').some(x => /200 words/.test(x.msg)), 'a 200-word paragraph is long at the default 150');
  ok(!writingChecks(story, { para: 300 }).some(x => x.kind === 'long'), 'the limit can be raised');
  ok(kinds('overuse').length === 1 && /lantern/.test(kinds('overuse')[0].msg), 'a word used again and again on a page is found: ' + kinds('overuse').map(x => x.msg).join(' | '));
  const ign = new Set([kinds('name')[0].key]);
  ok(!writingChecks(story, { ignore: ign }).some(x => x.kind === 'name'), 'an ignored note stays away');
  ok(writingChecks({ passages: [] }, {}).length === 0 && writingChecks({}, {}).length === 0, 'an empty story gives no notes and no error');
}

/* ---- in the editor ---- */
const sample = fs.readFileSync(__dirname + '/fixtures/sample.story.json', 'utf8').replace('"s_keepers_light"', '"s_help_test"');
const SETTINGS = JSON.stringify({ chosen: true, remember: true, advanced: { write: true, map: true, items: true, game: true } });
(async () => {
  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1200, height: 850 }, locale: 'en-US' });
  await ctx.addInitScript(([s, st]) => { if (!localStorage.getItem('qa-seeded')) { localStorage.setItem('qa-seeded', '1'); localStorage.setItem('story-editor-v1-settings', st); localStorage.setItem('story-editor-v1', s); } }, [sample, SETTINGS]);
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(EDITOR); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(500);
  const n0 = await pg.evaluate(() => window.__editor.project.passages.length);
  await pg.locator('#menubtn').click(); await pg.locator('#menupop button:has-text("Paste an outline")').click(); await pg.waitForTimeout(300);
  const add = pg.locator('dialog.dlg button:has-text("Add the pages")');
  ok(await add.isDisabled(), 'Add is off while the box is empty');
  const outline = 'Cellar stairs\n  Damp air rises.\n  Go down → Wine cellar\n  Back up → Start\n  Look around → Nowhere page\nWine cellar (good ending)\n  Dust everywhere.\nWine cellar\n  More dust.';
  await pg.locator('dialog.dlg textarea').fill(outline); await pg.waitForTimeout(300);
  const prev = await pg.evaluate(() => document.querySelector('dialog.dlg .outprev').innerText.replace(/\s+/g, ' '));
  ok(/2 pages with 3 choices/.test(prev) && /1 empty page/.test(prev) && /listed twice/.test(prev), 'the preview counts pages, choices and empty pages, and warns about the repeat: ' + prev);
  await add.click(); await pg.waitForTimeout(600);
  const after = await pg.evaluate(() => { const E = window.__editor, P = E.project; const byN = n => P.passages.find(p => p.name === n); const s = byN('Cellar stairs'); return { n: P.passages.length, ids: !!s, toWine: s && s.choices[0].to === byN('Wine cellar').id, toStart: s && s.choices[1].to === P.start, text: s && s.blocks[0].text, ending: byN('Wine cellar').ending, valence: byN('Wine cellar').valence, nowhere: !!byN('Nowhere page'), selName: (document.getElementById('pname') || {}).value }; });
  ok(after.n === n0 + 3 && after.toWine && after.toStart && after.text === 'Damp air rises.', 'three pages were added and the choices point at them and at the existing Start: ' + JSON.stringify(after));
  ok(after.ending && after.valence === 'good' && after.nowhere, 'the ending kept its valence, and the empty target page exists');
  ok(after.selName === 'Cellar stairs', 'the first new page is open');
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
  ok((await pg.evaluate(() => window.__editor.project.passages.length)) === n0, 'one Undo removes all of it');
  await pg.keyboard.press('Control+y'); await pg.waitForTimeout(400);
  ok((await pg.evaluate(() => window.__editor.project.passages.length)) === n0 + 3, 'and Redo brings it back');

  /* a blank story takes the outline as its own first pages */
  const blank = await pg.evaluate(() => { const E = window.__editor; E.project.passages = [E.project.passages[0]]; Object.assign(E.project.passages[0], { name: 'Untitled page', blocks: [{ text: '', needs: [], forbid: [], orPrev: false }], choices: [], gives: [], takes: [], heading: '', note: '', todo: false, ending: false }); E.project.start = E.project.passages[0].id; E.refresh(); return E.project.passages.length; });
  await pg.locator('#menubtn').click(); await pg.locator('#menupop button:has-text("Paste an outline")').click(); await pg.waitForTimeout(300);
  await pg.locator('dialog.dlg textarea').fill('First\n  On → Second\nSecond (ending)'); await pg.waitForTimeout(300);
  await pg.locator('dialog.dlg button:has-text("Add the pages")').click(); await pg.waitForTimeout(500);
  const b2 = await pg.evaluate(() => { const P = window.__editor.project; return { names: P.passages.map(p => p.name), startName: P.passages.find(p => p.id === P.start).name }; });
  ok(blank === 1 && b2.names.join() === 'First,Second' && b2.startName === 'First', 'in a story with only the empty first page, the outline replaces it and its first page becomes the start: ' + JSON.stringify(b2));

  /* writing notes in the Check tab */
  await pg.evaluate(() => { const E = window.__editor, P = E.project; P.passages[0].blocks[0].text = 'Pell said the the plan was fine. Pell nodded, Pell sat. Pell smiled and Pel frowned. Pell left.'; E.refresh(); });
  await pg.waitForTimeout(2500);
  const chip = await pg.evaluate(() => document.getElementById('statusline').innerText.replace(/\s+/g, ' '));
  ok(/writing note/.test(chip), 'the status line counts the writing notes: ' + chip);
  await pg.locator('#tabs button:has-text("Check")').click(); await pg.waitForTimeout(600);
  const card = await pg.evaluate(() => { const d = [...document.querySelectorAll('#main details.notes')].find(x => /Writing notes/.test(x.innerText)); return d ? { open: d.open, text: d.innerText.replace(/\s+/g, ' ') } : null; });
  ok(card && /typed twice/.test(card.text) && /may be a typo/.test(card.text), 'the Check tab shows the notes: ' + (card && card.text.slice(0, 260)));
  const cnt = () => pg.evaluate(() => { const d = [...document.querySelectorAll('#main details.notes')].find(x => /Writing notes/.test(x.innerText)); return +(/Writing notes \((\d+)\)/.exec(d.innerText) || [])[1]; });
  const c1 = await cnt();
  await pg.evaluate(() => { const d = [...document.querySelectorAll('#main details.notes')].find(x => /Writing notes/.test(x.innerText)); d.open = true; });
  await pg.evaluate(() => { const d = [...document.querySelectorAll('#main details.notes')].find(x => /Writing notes/.test(x.innerText)); d.querySelector('button[title^="Stop showing"]').click(); });
  await pg.waitForTimeout(500);
  ok((await cnt()) === c1 - 1, `Ignore removes one note (${c1} to ${c1 - 1})`);
  await pg.reload(); await pg.waitForFunction(() => window.__editor && !document.getElementById('splash'), null, { timeout: 20000 }); await pg.waitForTimeout(800);
  const ig = await pg.evaluate(() => { try { return JSON.parse(localStorage.getItem('story-editor-v1-prefs') || '{}').writingIgnore.length; } catch { return -1; } });
  ok(ig === 1, 'the ignored note is remembered in this browser: ' + ig);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log(fails ? `${fails} FAIL` : 'all pass'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
