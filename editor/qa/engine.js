/* Which browser a suite drives.
     'firefox'  stock Firefox through ../../packages/qa-kit/src/bidi.js (the main browser for every check)
     'chromium' Playwright's Chromium (the full check only, and the phone-shaped touch tests, which Firefox cannot emulate)
   Usage in a suite:  const B = require('./engine').pick(which);
   Screenshots are skipped unless SHOTS=1 is set: nobody looks at them during a routine run and each costs time. */
const pw = require('../../packages/qa-kit/src/resolve.cjs').load('playwright');
if (!process.env.SHOTS) {
  try { require(require('path').join(require('../../packages/qa-kit/src/resolve.cjs').dirOf('playwright-core'), 'lib/client/page')).Page.prototype.screenshot = async () => Buffer.alloc(0); } catch (e) { /* different Playwright layout: screenshots just stay on */ }
}
exports.pick = which => (which === 'firefox' ? require('../../packages/qa-kit/src/bidi.js').firefox : pw.chromium);
exports.devices = pw.devices;
