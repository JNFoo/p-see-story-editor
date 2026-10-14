/* Text-size and spacing stress test: every page of the sample stories, drawn as a game at the narrowest phone width (320 px), with the reader's
   Larger text, Roomy spacing and Choice numbers, plus the text-spacing values of WCAG 1.4.12 (line height 1.5, paragraph spacing 2x, letters 0.12 em,
   words 0.16 em) forced on every element. Any page where text is cut off, a button's words overflow, or the page scrolls sideways is reported by name.
   Each page is drawn by making it the story's first page (so only text that does not depend on what the player holds is seen).
   Usage: node textstress.js [firefox|chromium]   Copyright (c) 2026 JNFoo. MIT License. */
const which = process.argv[2] || 'firefox';
const B = require('./engine').pick(which), fs = require('fs'), path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const STORIES = ['sample.story.json', 'sample-rich.story.json'];
const SPACING = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';
(async () => {
  const { buildGame } = await import('../../packages/story-player/src/index.js');
  const b = await B.launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 320, height: 568 } });
  await ctx.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('story-editor-comfort', JSON.stringify({ size: '2', space: '1', nums: '1' })); } catch (e) {} });
  const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(e.message));
  let pages = 0; const bad = [];
  for (const name of STORIES) {
    const story = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
    story.game = { ...story.game, comfort: true, back: 'remember' };
    const ids = story.passages.map(p => p.id);
    let first = true;
    for (const id of ids) {
      const s = JSON.parse(JSON.stringify(story)); s.start = id;
      const file = path.join(__dirname, 'work', `textstress-${which}.html`);
      fs.writeFileSync(file, buildGame(s));
      await pg.goto('file://' + file + '?p=' + encodeURIComponent(name + id)); /* a new address each time, so nothing is reused */
      await pg.waitForSelector('.kl-page', { timeout: 15000 });
      await pg.evaluate(css => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, SPACING);
      const r = await pg.evaluate(() => {
        const out = []; const root = document.querySelector('.kl');
        const vw = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push('the page scrolls sideways (' + document.documentElement.scrollWidth + ' > ' + vw + ')');
        root.querySelectorAll('*').forEach(e => {
          const cs = getComputedStyle(e);
          const clip = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
          if (clip && e.clientWidth && e.scrollWidth > e.clientWidth + 1) out.push('cut off sideways: <' + e.tagName.toLowerCase() + ' class="' + e.className + '"> ' + (e.textContent || '').trim().slice(0, 30));
          if (clip && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' && e.clientHeight && e.scrollHeight > e.clientHeight + 1) out.push('cut off downward: <' + e.tagName.toLowerCase() + ' class="' + e.className + '"> ' + (e.textContent || '').trim().slice(0, 30));
          if (e.tagName === 'BUTTON' && e.getBoundingClientRect().right > vw + 1) out.push('a button reaches past the right edge: ' + (e.textContent || '').trim().slice(0, 30));
        });
        return out;
      });
      /* the Aa panel must fit on the screen when open (opened for real: its own toggle handler slides it into view, so wait for that) */
      await pg.evaluate(() => { const aa = document.querySelector('.kl-aa'); if (aa) aa.open = true; });
      await pg.waitForTimeout(60);
      r.push(...await pg.evaluate(() => {
        const out = []; const aa = document.querySelector('.kl-aa'); const vw = document.documentElement.clientWidth;
        if (aa) {
          const rc = aa.querySelector('.kl-aa-box').getBoundingClientRect();
          if (rc.left < -1 || rc.right > vw + 1) out.push('the Aa panel does not fit across the screen (' + Math.round(rc.left) + ' to ' + Math.round(rc.right) + ' of ' + vw + ')');
          if (rc.top + window.scrollY < -1) out.push('the Aa panel starts above the top of the page');
          aa.open = false;
        }
        return out;
      }));
      pages++;
      if (r.length) bad.push(`${name} page "${id}": ${r.slice(0, 3).join('; ')}`);
      if (first) { first = false; }
    }
  }
  ok(pages > 60, pages + ' pages drawn at 320 px, Larger text, Roomy spacing and WCAG 1.4.12 spacing');
  bad.slice(0, 12).forEach(x => console.log('  ' + x));
  ok(bad.length === 0, bad.length + ' page(s) with cut-off or sideways-scrolling text');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL crashed: ' + e.message); process.exit(1); });
