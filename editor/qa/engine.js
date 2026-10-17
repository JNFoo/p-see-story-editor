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
/* CHROMIUM_PATH names the Chromium to drive (the approved ungoogled build). If it is set, that program is used or the run stops: there is no quiet
   fallback to Playwright's own Chromium, because a run labelled with one browser must really be that browser. Without it, Playwright's stock Chromium
   is used and qa.js says so on its first line. */
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '';
if (CHROMIUM_PATH && !require('fs').existsSync(CHROMIUM_PATH)) throw new Error('CHROMIUM_PATH is set to ' + CHROMIUM_PATH + ' but there is no such file; refusing to fall back to another Chromium');
const chromium = {
  async launch(o = {}) {
    const b = await pw.chromium.launch(CHROMIUM_PATH ? { ...o, executablePath: CHROMIUM_PATH, args: [...(o.args || []), '--no-sandbox'] } : o);
    const nc = b.newContext.bind(b), np = b.newPage.bind(b);
    b.newContext = x => nc(calm(x));
    b.newPage = x => np(calm(x));
    return b;
  }
};
exports.pick = which => (which === 'firefox' ? require('../../packages/qa-kit/src/bidi.js').firefox : chromium);
exports.devices = pw.devices;
exports.chromiumPath = () => CHROMIUM_PATH || pw.chromium.executablePath();
