/* Two tiny helpers for test suites.

     const { nap, waitFor } = require('qa-kit/src/wait.js');
     await nap(300);                                  // real time, for the rare moment nothing can be waited on
     await waitFor(() => page.locator('#done').count());   // polls until the condition is truthy, then returns its value

   Prefer waitFor (or the page's own waitForFunction / waitForSelector) to nap: wait for the thing you expect, never for a fixed time.

   Copyright (c) 2026 JNFoo. MIT License. */
const nap = ms => new Promise(r => setTimeout(r, ms));

/** Polls `condition` (sync or async) every `every` ms until it returns something truthy, and returns that value.
 *  Throws after `timeout` ms with `what` in the message, so a failure says what was being waited for. */
async function waitFor(condition, { timeout = 10000, every = 25, what = 'the condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await condition();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`Timeout ${timeout}ms waiting for ${what}`);
    await nap(every);
  }
}

module.exports = { nap, waitFor };
