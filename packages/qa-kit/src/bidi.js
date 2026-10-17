/* ---------------------------------------------------------------------------
   bidi.js - lets the test suites drive the real Firefox 158 (stock, not a patched build)

   Why: Playwright can only drive its own patched Firefox, and the newest one it ships is Firefox 142. Puppeteer talks
   to ordinary Firefox through WebDriver BiDi, so this file gives Puppeteer the small part of Playwright's calls that
   the suites use (page.click('text=Save'), page.locator(...).first(), $$eval, fill, keyboard.press('Control+z') ...).

   What it does NOT do: phone emulation (devices['iPhone 13']), HTML5 drag and drop, file pickers and downloads.
   Suites that need those stay on Chromium.

   Selectors understood (the Playwright ones the suites use):
     css                       '#menubtn', '.kl-choices button'
     text=Foo  text="Foo"  text=/re/i
     css:has-text("Foo")       css:text-is("Foo")
     a >> b                    search b inside what a found
     nth=0                     the 0th of what came before ('>> nth=-1' is the last)
   The opening animation lasts 4 s and never blocks clicks. A wait for it to finish (waitForFunction that mentions
   getElementById('splash')) removes it at once instead, so a test does not sit through it. Tests of the opening itself
   do not use that wait.
   --------------------------------------------------------------------------- */
/* Puppeteer is found the normal way (npm i puppeteer; NODE_PATH works), else in QA_NODE_MODULES (see resolve.cjs). The Firefox program comes from FIREFOX_PATH (or FIREFOX_158). */
/* (loaded when Firefox is launched, so webkit.js can reuse the classes below without Puppeteer or a Firefox program) */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The selector engine, injected into every page (one call finds, filters and counts). Plain JavaScript in its own file. */
const ENGINE = require('fs').readFileSync(__dirname + '/bidi-engine.js', 'utf8');

/* Playwright-style key chords ('Control+Shift+z') on top of Puppeteer's single keys */
const KEYMAP = { ControlOrMeta: 'Control' };
async function pressChord(kb, chord) {
  const parts = chord.length > 1 && chord.includes('+') && !chord.endsWith('++') ? chord.split('+') : [chord];
  const keys = parts.map(k => KEYMAP[k] || k);
  const last = keys.pop();
  for (const k of keys) await kb.down(k);
  await kb.press(last);
  for (const k of keys.reverse()) await kb.up(k);
}

/** An expression that calls fn with JSON arguments (page code cannot use eval or new Function: the editor's Content-Security-Policy forbids them) */
const call = (fn, ...args) => `(${String(fn)})(${args.map(a => (a === undefined ? 'undefined' : JSON.stringify(a))).join(',')})`;

class Locator {
  constructor(page, sel) { this.page = page; this.sel = sel; }
  locator(s) { return new Locator(this.page, `${this.sel} >> ${s}`); }
  first() { return new Locator(this.page, `${this.sel} >> nth=0`); }
  last() { return new Locator(this.page, `${this.sel} >> nth=-1`); }
  nth(i) { return new Locator(this.page, `${this.sel} >> nth=${i}`); }
  count() { return this.page._count(this.sel); }
  click(o) { return this.page.click(this.sel, o); }
  tap(o) { return this.page.click(this.sel, o); }
  hover(o) { return this.page.hover(this.sel, o); }
  fill(v, o) { return this.page.fill(this.sel, v, o); }
  type(v, o) { return this.page.type(this.sel, v, o); }
  press(k, o) { return this.page.press(this.sel, k, o); }
  check(o) { return this.page.check(this.sel, o); }
  uncheck(o) { return this.page.uncheck(this.sel, o); }
  focus() { return this.page.focus(this.sel); }
  selectOption(v, o) { return this.page.selectOption(this.sel, v, o); }
  innerText(o) { return this.page.innerText(this.sel, o); }
  textContent(o) { return this.page.textContent(this.sel, o); }
  inputValue(o) { return this.page.inputValue(this.sel, o); }
  getAttribute(n, o) { return this.page.getAttribute(this.sel, n, o); }
  isVisible() { return this.page.isVisible(this.sel); }
  isEnabled() { return this.page.isEnabled(this.sel); }
  async isDisabled() { return !(await this.page.isEnabled(this.sel)); }
  async isHidden() { return !(await this.page.isVisible(this.sel)); }
  dragTo(t, o) { return this.page.dragAndDrop(this.sel, t.sel, o); }
  isChecked() { return this.page.isChecked(this.sel); }
  boundingBox() { return this.page._box(this.sel); }
  evaluate(fn, arg) { return this.page.$eval(this.sel, fn, arg); }
  dispatchEvent(t, init) { return this.page.dispatchEvent(this.sel, t, init); }
  waitFor(o) { return this.page.waitForSelector(this.sel, o); }
  async evaluateAll(fn, arg) { return this.page.$$eval(this.sel, fn, arg); }
  async allInnerTexts() { return this.page.$$eval(this.sel, els => els.map(e => e.innerText)); }
  async allTextContents() { return this.page.$$eval(this.sel, els => els.map(e => e.textContent)); }
}

class Page {
  constructor(pp, ctx) {
    this.pp = pp; this.ctxw = ctx; this.timeout = 30000;
    /* Pages in a headless Firefox share one window: only the front one gets frames, mouse and keys. Playwright pages are
       independent, so the suites never ask; this brings a page forward when it is about to be used and is not in front. */
    ctx.browser.front = pp;
    const fr = async () => this._front();
    this.keyboard = {
      press: async k => { await fr(); return pressChord(pp.keyboard, k); }, down: async k => { await fr(); return pp.keyboard.down(KEYMAP[k] || k); }, up: async k => { await fr(); return pp.keyboard.up(KEYMAP[k] || k); },
      type: async (t, o) => { await fr(); return pp.keyboard.type(t, o && o.delay ? { delay: o.delay } : undefined); }, insertText: async t => { await fr(); return pp.keyboard.sendCharacter(t); }
    };
    this.mouse = {
      move: async (x, y, o) => { await fr(); return pp.mouse.move(x, y, o && o.steps ? { steps: o.steps } : undefined); },
      click: async (x, y) => { await fr(); return pp.mouse.click(x, y); }, down: async () => { await fr(); return pp.mouse.down(); }, up: async () => { await fr(); return pp.mouse.up(); },
      wheel: async (dx, dy) => { await fr(); return typeof dx === 'object' ? pp.mouse.wheel(dx) : pp.mouse.wheel({ deltaX: dx, deltaY: dy }); }
    };
  }
  async _front() { if (this.ctxw.browser.front !== this.pp) { this.ctxw.browser.front = this.pp; await this.pp.bringToFront(); } }
  on(ev, fn) { this.pp.on(ev, fn); return this; }
  once(ev, fn) { this.pp.once(ev, fn); return this; }
  off(ev, fn) { this.pp.off(ev, fn); return this; }
  removeAllListeners(ev) { this.pp.removeAllListeners(ev); return this; }
  context() { return this.ctxw; }
  locator(sel) { return new Locator(this, sel); }
  async goto(url, o) { await this.pp.goto(url, { waitUntil: 'load', timeout: this.timeout }); return null; }
  async reload() { await this.pp.reload({ waitUntil: 'load' }); await this._inject(); }
  async _inject() { /* the selector engine goes in again after every navigation */
    await this.pp.evaluate(ENGINE);
  }
  async setContent(html) { await this.pp.setContent(html); await this._inject(); }
  async close() { try { await this.pp.close(); } catch (e) { /* already closed */ } }
  title() { return this.pp.title(); }
  url() { return this.pp.url(); }
  content() { return this.pp.content(); }
  async setViewportSize(v) { await this.pp.setViewport(v); }
  viewportSize() { return this.pp.viewport(); }
  /** Waits up to `ms` but stops early once the page has settled (see settle in bidi-engine.js); a short wait is just a wait. */
  async waitForTimeout(ms) {
    if (ms < 60 || process.env.FIXED_WAITS) return sleep(ms);
    try {
      await this._front();
      await this._ensure();
      await Promise.race([this.pp.evaluate(call(m => window.__pwq.settle(m), ms)), sleep(ms + 1500)]);
    } catch (e) { await sleep(ms); } /* the page went away or was reloaded under us */
  }
  async screenshot(o = {}) { if (!process.env.SHOTS) return null; await this._front(); return this.pp.screenshot({ path: o.path, fullPage: !!o.fullPage }); }
  addInitScript(fn, arg) { return this.pp.evaluateOnNewDocument(initSource(fn, arg)); }
  async evaluate(fn, arg) { await this._ensure(); return this.pp.evaluate(fn, arg); }
  /** evaluates an expression that uses the engine; if the page does not have it yet (it was just reloaded), puts it in and retries */
  async _ev(expr) {
    try { return await this.pp.evaluate(expr); }
    catch (e) { if (!/__pwq/.test(String(e && e.message))) throw e; await this._inject(); return this.pp.evaluate(expr); }
  }
  async _ensure() { if (!(await this.pp.evaluate('!!window.__pwq'))) await this._inject(); }
  async waitForFunction(fn, arg, o = {}) {
    const src = String(fn);
    if (src.includes("getElementById('splash')") || src.includes('getElementById("splash")')) {
      /* the opening never blocks anything; do not sit through it (see the top of this file) */
      await this.pp.evaluate(() => { document.getElementById('splash')?.remove(); document.body && document.body.classList.remove('splashing'); }).catch(() => {});
    }
    await this._front();
    const h = await this.pp.waitForFunction(fn, { timeout: o.timeout ?? this.timeout, polling: o.polling || 'raf' }, arg);
    const v = await h.jsonValue().catch(() => true); await h.dispose(); return v;
  }
  /* ---- finding things ---- */
  async _count(sel) { await this._ensure(); return this.pp.evaluate(s => window.__pwq.all(s).length, sel); }
  /** waits (up to the timeout) until the selector finds something that is visible (or any, if visible is false) */
  async _wait(sel, { visible = true, timeout } = {}) {
    const t0 = Date.now(); const lim = timeout ?? this.timeout;
    await this._ensure();
    for (;;) {
      const ok = await this.pp.evaluate((s, v) => { const e = window.__pwq.first(s); return !!e && (!v || window.__pwq.visible(e)); }, sel, visible);
      if (ok) return;
      if (Date.now() - t0 > lim) throw new Error(`Timeout ${lim}ms exceeded waiting for ${sel}`);
      await sleep(25);
    }
  }
  async _handle(sel, o) {
    await this._wait(sel, o);
    return this.pp.evaluateHandle(s => window.__pwq.first(s), sel);
  }
  async _box(sel) {
    await this._ensure();
    return this.pp.evaluate(s => { const e = window.__pwq.first(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, sel);
  }
  async waitForSelector(sel, o = {}) {
    const state = o.state || 'visible';
    if (state === 'detached' || state === 'hidden') {
      const t0 = Date.now();
      for (;;) {
        await this._ensure();
        const gone = await this.pp.evaluate((s, st) => { const e = window.__pwq.first(s); return !e || (st === 'hidden' && !window.__pwq.visible(e)); }, sel, state);
        if (gone) return null;
        if (Date.now() - t0 > (o.timeout ?? this.timeout)) throw new Error(`Timeout waiting for ${sel} to be ${state}`);
        await sleep(25);
      }
    }
    await this._wait(sel, { visible: state === 'visible', timeout: o.timeout });
    return null;
  }
  /* ---- acting ---- */
  /** The point to click on an element: one call into the page scrolls it into view, waits for it to stop moving and checks that it
   *  is enabled and not covered (see prepare in bidi-engine.js). It tries other scroll positions if a sticky bar covers it and
   *  waits, up to the timeout, if the element is not ready yet. */
  async _centre(sel, o = {}) {
    await this._front();
    const t0 = Date.now();
    const lim = o.timeout ?? this.timeout;
    const aligns = ['center', 'start', 'end', 'nearest'];
    for (let n = 0; ; n++) {
      const r = await this._ev(call((s, a, p, f) => window.__pwq.prepare(s, a, p, f), sel, aligns[n % aligns.length], o.position || null, !!o.force));
      if (r.state === 'ok') return r.p;
      if (Date.now() - t0 > lim) throw new Error(`Timeout ${lim}ms: ${sel} is ${r.state}`);
      if (n >= aligns.length || r.state !== 'covered') await sleep(25);
    }
  }
  async click(sel, o = {}) {
    const p = await this._centre(sel, o);
    await this._front();
    /* press and release in one message to the browser (Puppeteer's own click sends three, about 50 ms against 28 ms) */
    const button = o.button === 'right' ? 2 : o.button === 'middle' ? 1 : 0;
    const acts = [{ type: 'pointerMove', x: Math.round(p.x), y: Math.round(p.y) }];
    for (let i = 0; i < (o.clickCount || 1); i++) acts.push({ type: 'pointerDown', button }, { type: 'pointerUp', button });
    const mods = (o.modifiers || []).map(m => (m === 'Shift' ? 'Shift' : m === 'Control' ? 'Control' : m === 'Alt' ? 'Alt' : m));
    for (const m of mods) await this.pp.keyboard.down(m);
    try { await (this.pp.pointer ? this.pp.pointer(acts) : this.pp.mainFrame().browsingContext.performActions([{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: acts }])); }
    finally { for (const m of mods.reverse()) await this.pp.keyboard.up(m); }
  }
  async dblclick(sel, o) { return this.click(sel, { ...o, clickCount: 2 }); }
  async hover(sel, o = {}) { const p = await this._centre(sel, o); await this._front(); await this.pp.mouse.move(p.x, p.y); }
  async tap(sel, o) { return this.click(sel, o); }
  /** Drag and drop. Headless Firefox does not start a native drag from a mouse press, so the drag events are sent the way a
   *  browser sends them (dragstart, dragenter, dragover, drop, dragend, sharing one DataTransfer) at the real positions. This
   *  tests the editor's handlers, not Firefox's own drag. */
  async dragAndDrop(src, dst, o = {}) {
    const a = await this._centre(src, o);
    const b = o.targetPosition ? await (async () => { const bx = await this._box(dst); return { x: bx.x + o.targetPosition.x, y: bx.y + o.targetPosition.y }; })() : await this._centre(dst, o);
    await this._front();
    await this.pp.evaluate(`((s, d, a, b) => {
      const S = window.__pwq.first(s), D = window.__pwq.first(d), dt = new DataTransfer();
      const fire = (el, type, p) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: p.x, clientY: p.y }));
      fire(S, 'dragstart', a); fire(D, 'dragenter', b); fire(D, 'dragover', b); fire(D, 'drop', b); fire(S, 'dragend', b);
    })(${JSON.stringify(src)}, ${JSON.stringify(dst)}, ${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  }
  async focus(sel) { await this._wait(sel, { visible: false }); await this.pp.evaluate(s => window.__pwq.first(s).focus(), sel); }
  async fill(sel, value, o = {}) {
    await this._wait(sel, { visible: true, timeout: o.timeout });
    /* select what is there and replace it with a real edit (so an "input" event and, later, "change" happen as for a person) */
    await this.pp.evaluate((s, v) => {
      const e = window.__pwq.first(s); e.focus();
      if (e.select) e.select(); else document.getSelection().selectAllChildren(e);
      if (v === '') { document.execCommand('delete'); }
      else if (!document.execCommand('insertText', false, v)) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
    }, sel, String(value));
  }
  async type(sel, text, o = {}) { await this.focus(sel); await this.pp.keyboard.type(String(text), o.delay ? { delay: o.delay } : undefined); }
  async press(sel, key) { await this.focus(sel); await pressChord(this.pp.keyboard, key); }
  async check(sel, o) { if (!(await this.isChecked(sel))) await this.click(sel, o); }
  async uncheck(sel, o) { if (await this.isChecked(sel)) await this.click(sel, o); }
  async isChecked(sel) { await this._wait(sel, { visible: false }); return this.pp.evaluate(s => !!window.__pwq.first(s).checked, sel); }
  async selectOption(sel, v) {
    await this._wait(sel, { visible: true });
    const want = Array.isArray(v) ? v : [v];
    return this.pp.evaluate((s, w) => {
      const e = window.__pwq.first(s); const picked = [];
      for (const o of e.options) { const hit = w.some(x => typeof x === 'string' ? (o.value === x || o.label === x) : (x.value !== undefined ? o.value === x.value : x.label !== undefined ? o.label === x.label : x.index !== undefined ? o.index === x.index : false)); if (hit) { o.selected = true; picked.push(o.value); } else if (e.multiple) o.selected = false; }
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return picked;
    }, sel, want);
  }
  async dispatchEvent(sel, type, init) {
    await this._wait(sel, { visible: false });
    await this.pp.evaluate((s, t, i) => window.__pwq.first(s).dispatchEvent(new Event(t, { bubbles: true, ...(i || {}) })), sel, type, init);
  }
  /* ---- reading ---- */
  async _read(sel, fn, o) { await this._wait(sel, { visible: false, timeout: o && o.timeout }); return this.pp.evaluate(`((s) => (${fn})(window.__pwq.first(s)))(${JSON.stringify(sel)})`); }
  innerText(sel, o) { return this._read(sel, 'e => e.innerText', o); }
  textContent(sel, o) { return this._read(sel, 'e => e.textContent', o); }
  inputValue(sel, o) { return this._read(sel, 'e => e.value', o); }
  getAttribute(sel, n, o) { return this._read(sel, `e => e.getAttribute(${JSON.stringify(n)})`, o); }
  async isHidden(sel) { return !(await this.isVisible(sel)); }
  async isDisabled(sel) { return !(await this.isEnabled(sel)); }
  async isVisible(sel) { await this._ensure(); return this.pp.evaluate(s => { const e = window.__pwq.first(s); return !!e && window.__pwq.visible(e); }, sel); }
  async isEnabled(sel) { await this._wait(sel, { visible: false }); return this.pp.evaluate(s => { const e = window.__pwq.first(s); return !(e.disabled || e.closest('fieldset:disabled')); }, sel); }
  async $eval(sel, fn, arg) {
    await this._wait(sel, { visible: false, timeout: 2000 });
    return this.pp.evaluate(`((s, a) => (${String(fn)})(window.__pwq.first(s), a))(${JSON.stringify(sel)}, ${arg === undefined ? 'undefined' : JSON.stringify(arg)})`);
  }
  async $$eval(sel, fn, arg) {
    await this._ensure();
    return this.pp.evaluate(`((s, a) => (${String(fn)})(window.__pwq.all(s), a))(${JSON.stringify(sel)}, ${arg === undefined ? 'undefined' : JSON.stringify(arg)})`);
  }
  async $(sel) { return (await this._count(sel)) ? this.pp.evaluateHandle(s => window.__pwq.first(s), sel) : null; }
  async $$(sel) { const n = await this._count(sel); const out = []; for (let i = 0; i < n; i++) out.push(await this.pp.evaluateHandle((s, i) => window.__pwq.all(s)[i], sel, i)); return out; }
}

/* addInitScript(fn, arg) runs fn(arg) before the page's own scripts; strings run as they are */
function initSource(fn, arg) {
  /* Puppeteer also runs these in the blank starting document (about:blank), where Firefox refuses storage; Playwright does not */
  const body = typeof fn === 'function' ? `(${String(fn)})(${arg === undefined ? 'undefined' : JSON.stringify(arg)})` : String(fn);
  return `if (/^(file|https?):$/.test(location.protocol)) { ${body} }`;
}

class Context {
  constructor(browser, ctx, opts) { this.browser = browser; this.ctx = ctx; this.opts = opts || {}; this.inits = []; this.list = []; }
  async newPage() {
    let pp; /* Firefox sometimes answers a page request made while another window is closing with "no such frame"; asking again works */
    for (let tries = 0; ; tries++) { try { pp = await this.ctx.newPage(); break; } catch (e) { if (tries >= 3 || !/no such frame|does no longer exist/.test(String(e))) throw e; await new Promise(r => setTimeout(r, 100)); } }
    if (this.opts.viewport) await pp.setViewport(this.opts.viewport);
    await pp.evaluateOnNewDocument(ENGINE);
    for (const s of this.inits) await pp.evaluateOnNewDocument(s);
    const p = new Page(pp, this); this.list.push(p); return p;
  }
  async addInitScript(fn, arg) { this.inits.push(initSource(fn, arg)); }
  pages() { return this.list; }
  async close() { try { await this.ctx.close(); } catch (e) { /* closed */ } }
}

class Browser {
  constructor(b, cleanup) { this.b = b; this.cleanup = cleanup; }
  async newContext(opts = {}) { return new Context(this, await this.b.createBrowserContext(), opts); }
  async newPage(opts) { return (await this.newContext(opts)).newPage(); }
  version() { return this.b.version(); }
  async close() { try { await this.b.close(); } catch (e) { /* closed */ } if (this.cleanup) this.cleanup(); }
}

/* A started-once Firefox profile, copied for each launch: Firefox starts in about half the time with its start-up files already built
   (measured Oct 17 on 4 cores: launch 1.7 s -> 0.85 s, close 0.45 s -> 0.2 s, 3 runs each) and nothing else differs: the same program,
   the same prefs (they are written fresh on every launch), and no page data in the template. QA_FF_COLD=1 starts with an empty profile as before. */
function warmProfile(puppeteer, FIREFOX) {
  const fs = require('fs'), os = require('os'), path = require('path');
  const st = fs.statSync(FIREFOX);
  const key = require('crypto').createHash('sha1').update(fs.realpathSync(FIREFOX) + st.size + st.mtimeMs).digest('hex').slice(0, 12);
  const tmpl = path.join(os.tmpdir(), 'qa-ff-template-' + key);
  const make = async () => {
    const part = tmpl + '.' + process.pid;
    fs.rmSync(part, { recursive: true, force: true }); fs.mkdirSync(part);
    const b = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true, args: [], userDataDir: part });
    await b.close();
    try { fs.renameSync(part, tmpl); } catch (e) { fs.rmSync(part, { recursive: true, force: true }); } /* another run made it first */
  };
  return { exists: () => fs.existsSync(tmpl), make, copy: () => {
    const dir = path.join(os.tmpdir(), 'qa-ff-run-' + process.pid + '-' + Date.now());
    fs.cpSync(tmpl, dir, { recursive: true });
    return dir;
  } };
}

exports.firefox = {
  async launch(o = {}) {
    const puppeteer = require('./resolve.cjs').load('puppeteer');
    const FIREFOX = process.env.FIREFOX_PATH || process.env.FIREFOX_158;
    if (!FIREFOX) throw new Error('Set FIREFOX_PATH to the Firefox program (stock Firefox 129 or newer speaks WebDriver BiDi), e.g. FIREFOX_PATH=/usr/bin/firefox');
    let dir = '', warm = null;
    if (!process.env.QA_FF_COLD) {
      try { warm = warmProfile(puppeteer, FIREFOX); if (!warm.exists()) await warm.make(); dir = warm.exists() ? warm.copy() : ''; } catch (e) { dir = ''; } /* any trouble: start cold, as before */
    }
    const cleanup = dir ? () => { try { require('fs').rmSync(dir, { recursive: true, force: true }); } catch (e) { /* gone */ } } : undefined;
    if (cleanup) process.on('exit', cleanup);
    const b = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: o.headless !== false, args: [], ...(dir ? { userDataDir: dir } : {}), extraPrefsFirefox: { ...JSON.parse(process.env.QA_FIREFOX_PREFS || '{}'), ...(o.prefs || {}) } });
    return new Browser(b, cleanup);
  }
};

/* for webkit.js, which drives WebKitGTK through the same call surface */
exports.Page = Page; exports.Context = Context; exports.Browser = Browser; exports.ENGINE = ENGINE; exports.initSource = initSource;

/* PROFILE=1 node suite.js firefox  ->  at exit, where the time went (per kind of call), to find what to trim */
if (process.env.PROFILE) {
  const T = {};
  for (const name of Object.getOwnPropertyNames(Page.prototype)) {
    const f = Page.prototype[name];
    if (typeof f !== 'function' || name === 'constructor' || name.startsWith('_') || name === 'on' || name === 'once' || name === 'locator') continue;
    Page.prototype[name] = function (...a) {
      const t = Date.now(); const r = f.apply(this, a);
      if (!r || !r.then) return r;
      return r.finally(() => {
        const ms = Date.now() - t, k = (T[name] = T[name] || { n: 0, ms: 0 }); k.n++; k.ms += ms;
        if (ms >= 500) SLOW.push({ ms, what: `${name}(${typeof a[0] === 'string' ? JSON.stringify(a[0].slice(0, 70)) : ''})`, at: ((new Error().stack.split('\n').find(l => /\/qa\/[^/]+\.js/.test(l)) || '').match(/\/qa\/([^/]+\.js:\d+)/) || [])[1] || '' });
      });
    };
  }
  const SLOW = [];
  const t0 = Date.now();
  process.on('exit', () => {
    process.stderr.write(`PROFILE total ${Date.now() - t0} ms :: ` + Object.entries(T).sort((a, b) => b[1].ms - a[1].ms).slice(0, 7).map(([k, v]) => `${k} ${v.n}x ${v.ms}ms`).join(' | ') + '\n');
    /* the single calls that took half a second or more, slowest first: a sleep, or a wait that ran into its timeout, shows up here with the line that made it */
    SLOW.sort((x, y) => y.ms - x.ms).slice(0, 8).forEach(c => process.stderr.write(`  slow call ${String(c.ms).padStart(6)} ms  ${c.what}  ${c.at}\n`));
  });
}
