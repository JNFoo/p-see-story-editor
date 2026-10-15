/* The editor as a person sees it (the other suites remove the splash instead of waiting it out; this one uses a different test so it plays): with real animation (every other suite asks the browser for reduced motion, which is far cheaper), the opening
   splash plays for its full time, then leaves and the editor works. Usage: node motion.js [firefox|chromium]
   Copyright (c) 2026 LFC Foundry. MIT License. */
process.env.QA_MOTION = '1'; /* before engine.js is read */
const which = process.argv[2] || 'firefox';
const B = require('./engine').pick(which);
const FILE = require('url').pathToFileURL((process.env.QA_EDITOR || require('path').join(__dirname, '..', 'story-editor.html'))).href;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await B.launch(); const pg = await (await b.newContext()).newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const t = Date.now(); await pg.goto(FILE);
  await pg.waitForSelector('#splash', { timeout: 15000 });
  ok(true, 'the splash appears');
  const still = await pg.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  ok(!still, 'this run does not ask for reduced motion');
  await pg.waitForFunction(() => window.__editor && !document.querySelector('#splash'), null, { timeout: 20000 });
  const sec = (Date.now() - t) / 1000;
  ok(sec >= 3.5 && sec < 9, `the splash plays and leaves: ${sec.toFixed(1)} s`);
  await pg.click('#tabs button:has-text("Check")'); await pg.waitForTimeout(300);
  ok(errs.length === 0, 'no errors: ' + errs.join(' | '));
  await b.close(); console.log(fails ? 'FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
