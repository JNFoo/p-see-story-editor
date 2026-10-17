/* Which browser a suite drives.
     'firefox'  stock Firefox through ../../packages/qa-kit/src/bidi.js (the main browser for every check)
     'chromium' Playwright's Chromium (the full check only, and the phone-shaped touch tests, which Firefox cannot emulate)
   Usage in a suite:  const B = require('./engine').pick(which);
   Screenshots are skipped unless SHOTS=1 is set: nobody looks at them during a routine run and each costs time. */
const pw = require('../../packages/qa-kit/src/resolve.cjs').load('playwright');
if (!process.env.SHOTS) {
  try { require(require('path').join(require('../../packages/qa-kit/src/resolve.cjs').dirOf('playwright-core'), 'lib/client/page')).Page.prototype.screenshot = async () => Buffer.alloc(0); } catch (e) { /* different Playwright layout: screenshots just stay on */ }
}
/* Reduced motion for every browser a suite opens, unless QA_MOTION=1. The editor's opening splash (a painted brush stroke and fades, about 4.4 s)
   plays on every page load, and without a graphics card the browser paints it on the CPU: measured Oct 12 2026, 3.9 CPU-seconds per load in
   Firefox against 0.5 with reduced motion (the editor honors the setting). Suites open the editor dozens of times, so this is most of a run's
   CPU, and the two browsers run side by side on two cores. QA_MOTION=1 plays the real animations (suite "motion" does, always). */
const MOTION = process.env.QA_MOTION === '1';
if (!MOTION && !process.env.QA_FIREFOX_PREFS) process.env.QA_FIREFOX_PREFS = JSON.stringify({ 'ui.prefersReducedMotion': 1 });
const calm = o => (MOTION || (o && o.reducedMotion) ? o : { ...(o || {}), reducedMotion: 'reduce' });
/* Firefox's engine (bidi.js) already removes the splash instead of waiting it out when a suite waits for it to be gone; Chromium's now does too. */
if (!MOTION) {
  try {
    const PG = require(require('path').join(require('../../packages/qa-kit/src/resolve.cjs').dirOf('playwright-core'), 'lib/client/page')).Page.prototype;
    const wf = PG.waitForFunction;
    PG.waitForFunction = async function (fn, ...rest) {
      if (/getElementById\((['"])splash\1\)/.test(String(fn))) await this.evaluate(() => { document.getElementById('splash')?.remove(); document.body && document.body.classList.remove('splashing'); }).catch(() => {});
      return wf.call(this, fn, ...rest);
    };
  } catch (e) { /* different Playwright layout: the splash is simply waited out */ }
}
/* Chromium redraws a page that is not the front tab only once a second, so every click on it waited about 2 s for the page to hold still (found Oct 17: suite real
   took 46 s in Chromium against 12 s with this; the Firefox engine already brings its page to the front, bidi.js _front). Before a page is acted on, bring it to the
   front, once per change of page. QA_NO_FRONT=1 turns it off. */
if (process.env.QA_NO_FRONT !== '1') {
  try {
    const dir = require('path').join(require('../../packages/qa-kit/src/resolve.cjs').dirOf('playwright-core'), 'lib/client/');
    const { Frame } = require(dir + 'frame'); const { Keyboard, Mouse } = require(dir + 'input');
    let front = null;
    const raise = async pg => { if (pg && front !== pg) { front = pg; await pg.bringToFront().catch(() => { front = null; }); } };
    const wrap = (proto, names, pageOf) => names.forEach(n => { const f = proto[n]; if (typeof f === 'function') proto[n] = async function (...a) { await raise(pageOf(this)); return f.apply(this, a); }; });
    wrap(Frame.prototype, ['click', 'dblclick', 'dragAndDrop', 'fill', 'focus', 'hover', 'press', 'selectOption', 'setInputFiles', 'tap', 'type', 'check', 'uncheck', 'waitForSelector', 'waitForFunction', 'evaluate'], f => f.page());
    wrap(Keyboard.prototype, ['down', 'up', 'insertText', 'type', 'press'], k => k._page);
    wrap(Mouse.prototype, ['move', 'down', 'up', 'click', 'dblclick', 'wheel'], m => m._page);
  } catch (e) { /* different Playwright layout: pages are simply not raised */ }
}
/* Waits that end early, as in Firefox: waitForTimeout(ms) in Chromium used to sleep the whole time. With the page's timer tracker (bidi-engine.js, the one the Firefox engine
   uses) it returns as soon as nothing that would happen within ms is left (every timer due in that window has run and every animation that ends in it has ended).
   QA_FIXED_WAITS=1 sleeps the whole time as before. */
const ENGINE_SRC = process.env.QA_FIXED_WAITS === '1' ? '' : require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'packages', 'qa-kit', 'src', 'bidi-engine.js'), 'utf8');
if (ENGINE_SRC) {
  try {
    const dir = require('path').join(require('../../packages/qa-kit/src/resolve.cjs').dirOf('playwright-core'), 'lib/client/');
    const { Page } = require(dir + 'page');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    Page.prototype.waitForTimeout = async function (ms) {
      if (ms < 60) return sleep(ms);
      try { await Promise.race([this.evaluate(m => (window.__pwq && window.__pwq.settle ? window.__pwq.settle(m) : new Promise(r => setTimeout(r, m))), ms), sleep(ms + 1500)]); } catch (e) { await sleep(ms); } /* the page went away or was reloaded under us */
    };
  } catch (e) { /* different Playwright layout: waits stay fixed */ }
}
/* CHROMIUM_PATH names the Chromium to drive (the approved ungoogled build). If it is set, that program is used or the run stops: there is no quiet
   fallback to Playwright's own Chromium, because a run labelled with one browser must really be that browser. Without it, Playwright's stock Chromium
   is used and qa.js says so on its first line. */
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '';
if (CHROMIUM_PATH && !require('fs').existsSync(CHROMIUM_PATH)) throw new Error('CHROMIUM_PATH is set to ' + CHROMIUM_PATH + ' but there is no such file; refusing to fall back to another Chromium');
const chromium = {
  async launch(o = {}) {
    const b = await pw.chromium.launch(CHROMIUM_PATH ? { ...o, executablePath: CHROMIUM_PATH, args: [...(o.args || []), '--no-sandbox', ...(process.env.QA_CHROMIUM_FLAGS || '').split(' ').filter(Boolean)] } : o);
    const nc = b.newContext.bind(b), np = b.newPage.bind(b);
    b.newContext = async x => { const c = await nc(calm(x)); if (ENGINE_SRC) await c.addInitScript(ENGINE_SRC); return c; };
    b.newPage = async x => { const p = await np(calm(x)); if (ENGINE_SRC) await p.context().addInitScript(ENGINE_SRC); return p; };
    return b;
  }
};
exports.pick = which => (which === 'firefox' ? require('../../packages/qa-kit/src/bidi.js').firefox : which === 'webkit' ? require('../../packages/qa-kit/src/webkit.js').webkit : chromium);
exports.devices = pw.devices;
exports.chromiumPath = () => CHROMIUM_PATH || pw.chromium.executablePath();
