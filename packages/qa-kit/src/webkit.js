/* ---------------------------------------------------------------------------
   webkit.js - lets the test suites drive WebKitGTK 2.52.6 (the engine of GNOME Web, the nearest thing to Safari on Linux)

   How: the suites speak a Playwright-style call surface. bidi.js already turns that into the small Puppeteer-shaped calls it needs for Firefox.
   This file gives the same shape on top of webkit-driver.js (a copy of JS-modules tools/webkit-driver 1.1.0, W3C WebDriver, no packages).

   What differs from Firefox and Chromium, and how it is handled:
   - WebDriver cannot add a script that runs before the page's own scripts. Every page is therefore loaded through a tiny local web server that puts
     the selector engine, the error hook and the suite's init scripts at the top of each HTML page. (file:// and http://127.0.0.1 pages both go through it.)
   - One WebKitWebDriver session is one window. Each new context (and each page) starts its own WebKitGTK, so contexts never share storage; two pages
     in one context are NOT one browser with two tabs, so a suite that needs shared storage between windows (twowin) is not run here.
   - No touch events, no phone emulation, no dialogs, no downloads or file pickers, no network events; suites that need them are not run here.
   - Pages are 'file' or 'http' on 127.0.0.1 only. Run one browser at a time (see qa.js); WebKitGTK paints on the CPU here.
   --------------------------------------------------------------------------- */
const http = require('http'), fs = require('fs'), path = require('path');
const WD = require('./webkit-driver.js');
const { Browser } = require('./bidi.js');

const TYPES = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8', wasm: 'application/wasm' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* the same error hook webkit-driver.js puts into every evaluate, but first in the page, so errors thrown while it loads are seen with their text */
const HOOK = 'if(!window.__wd){var L=window.__wd={l:[]};window.addEventListener("error",function(e){L.l.push({k:"pageerror",m:String(e.message||e)})});window.addEventListener("unhandledrejection",function(e){L.l.push({k:"pageerror",m:"unhandled rejection: "+String(e.reason&&e.reason.message||e.reason)})});var ce=console.error;console.error=function(){try{L.l.push({k:"console",t:"error",m:Array.prototype.map.call(arguments,String).join(" ")})}catch(x){}return ce.apply(console,arguments)}}';

/** A script tag; "</script" inside the source is split so it cannot end the tag early */
const tag = src => '<script>' + src.replace(/<\/script/gi, '<\\/script') + '</script>';

/** a window command to the driver (switch, new, close); logged with WK_TRACE=1, and never allowed to hang for ever */
async function win(s, method, tail, body, ms) {
  const t0 = Date.now();
  try { return await WD.call(s.wd.port, method, '/session/' + s.wd.sessionId + tail, body, ms || 30000); }
  finally { if (process.env.WK_TRACE) process.stderr.write(`wk ${method} ${tail} ${Date.now() - t0} ms\n`); }
}

class WKPp {
  /** one WebKitGTK window. The windows of one context share one browser (and so storage, locks and the local server); started on first use */
  constructor(ctx) { this.ctx = ctx; this.s = ctx.s; this.inits = []; this.view = null; this.handle = null; this.cur = 'about:blank'; this.held = new Set(); this.at = { x: 0, y: 0 }; this.closed = false; this.opening = null; }
  get page() { return this.s.page; }
  get wd() { return this.s.wd; }
  async _up() {
    if (this.closed) throw new Error('the page was closed');
    const s = this.s;
    if (!s.launch) {
      s.launch = (async () => {
        for (let tries = 0; ; tries++) { /* a start that is slow under load (or races the end of the browser before it) fails early or answers late; starting again works */
          try {
            s.wd = await WD.launch({ browser: process.env.WEBKIT === 'epiphany' ? 'epiphany' : undefined, width: (this.view && this.view.width) || 1280, height: (this.view && this.view.height) || 800, timeout: 120000, reducedMotion: !process.env.QA_MOTION });
            s.page = s.wd.page; s.cur = this;
            this.handle = await win(s, 'GET', '/window');
            s.first = this;
            await this._measure();
            break;
          } catch (e) {
            try { if (s.wd) await s.wd.close(); } catch (x) { /* gone */ } s.wd = null;
            if (tries >= 3 || !/did not start answering|terminated without a reply|socket hang up|ECONNRESET|ECONNREFUSED/.test(String(e && e.message))) throw e;
            await sleep(500);
          }
        }
      })();
    }
    await s.launch;
    if (!this.handle) { /* a second window of the same browser (or the window a closed page left) */
      if (!this.opening) this.opening = (async () => {
        await this._measure();
        this.handle = (await win(s, 'POST', '/window/new', { type: 'window' })).handle;
        s.cur = null; await this._switch(); if (this.view) await this._size();
        /* a new window takes a moment before it can load a page: asking at once hangs (3 of 3 runs alone), after half a second it works (3 of 3); busy machines need longer, so ask it something small until it answers */
        await sleep(500);
        for (let n = 0; n < 10; n++) { try { await win(s, 'GET', '/url', undefined, 3000); break; } catch (e) { await sleep(300); } }
      })();
      await this.opening;
    }
    if (s.cur !== this) await this._switch();
  }
  async _switch() { await win(this.s, 'POST', '/window', { handle: this.handle }); this.s.cur = this; }
  /* ----- pages go through a small server that adds the init scripts ----- */
  async _server(kind, upstream) {
    const key = kind + ':' + upstream, s = this.s;
    if (s.servers.has(key)) return s.servers.get(key);
    const p = new Promise(resolve => {
      const srv = http.createServer((q, r) => {
        const done = (status, type, body) => { r.statusCode = status; if (type) r.setHeader('Content-Type', type); r.setHeader('Cache-Control', 'no-store'); r.end(body); };
        const send = (type, body) => {
          if (/^text\/html/.test(type)) {
            const str = body.toString('utf8'), top = tag(HOOK) + s.nav.inits.map(tag).join('');
            body = Buffer.from(/<head[^>]*>/i.test(str) ? str.replace(/<head[^>]*>/i, m => m + top) : top + str);
          }
          done(200, type, body);
        };
        if (kind === 'file') {
          const f = path.join('/', decodeURIComponent(q.url.split('?')[0]));
          fs.readFile(f, (e, d) => (e ? done(404) : send(TYPES[path.extname(f).slice(1).toLowerCase()] || 'application/octet-stream', d)));
        } else {
          const u = http.request({ host: '127.0.0.1', port: upstream, method: q.method, path: q.url, headers: { ...q.headers, host: '127.0.0.1:' + upstream } }, res => {
            const chunks = []; res.on('data', c => chunks.push(c));
            res.on('end', () => { const t = res.headers['content-type'] || 'application/octet-stream'; if (res.statusCode === 200) send(t, Buffer.concat(chunks)); else done(res.statusCode, t, Buffer.concat(chunks)); });
          });
          u.on('error', () => done(502));
          q.pipe(u);
        }
      });
      srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, srv }));
    });
    s.servers.set(key, p);
    return p;
  }
  /** the address the browser really loads for the address the suite asked for */
  async _route(url) {
    let m = /^file:\/\/(\/[^#?]*)([?#].*)?$/.exec(url);
    if (m) return `http://127.0.0.1:${(await this._server('file', 0)).port}${m[1]}${m[2] || ''}`;
    m = /^http:\/\/(?:127\.0\.0\.1|localhost):(\d+)(\/[^#]*)?(#.*)?$/.exec(url);
    if (m) return `http://127.0.0.1:${(await this._server('http', +m[1])).port}${m[2] || '/'}${m[3] || ''}`;
    return url;
  }
  async goto(url) { await this._up(); this.s.nav = this; this.cur = url; await this.page.goto(await this._route(url)); await this._sizeNote(); }
  async reload() {
    await this._up(); this.s.nav = this;
    const real = await this.page.evaluate(() => location.href);
    if (/#/.test(real)) await this.page.goto('about:blank');
    await this.page.goto(real);
  }
  async setContent(html) { await this._up(); await this.page.evaluate(h => { document.open(); document.write(h); document.close(); }, html); }
  evaluateOnNewDocument(src) { this.inits.push(src); return Promise.resolve(); }
  /* ----- running code in the page ----- */
  /** a page that is being replaced (a click that reloads it) answers "no such frame"/"unload"; Playwright waits for the new page, so ask again until it is up */
  async _retry(f) {
    for (let n = 0; ; n++) {
      try { return await f(); }
      catch (e) { if (n >= 200 || !/no such frame|before the unload|no such window|not.* in the current frame/i.test(String(e && e.message))) throw e; await sleep(50); }
    }
  }
  async evaluate(fn, ...args) { return this._retry(() => this._evaluate(fn, ...args)); }
  async _evaluate(fn, ...args) {
    await this._up();
    if (typeof fn === 'string') { const src = fn.replace(/[\s;]+$/, ''), w = function () {}; w.toString = () => 'function () { return (\n' + src + '\n); }'; return this.page.evaluate(w); }
    if (args.length <= 1) return this.page.evaluate(fn, args[0]);
    const w = function () {}; w.toString = () => 'function (a) { return (' + fn.toString() + ').apply(null, a); }';
    return this.page.evaluate(w, args);
  }
  /** a stand-in for Puppeteer's element handle: remembers how to find the element again and offers the few calls the suites use */
  async evaluateHandle(fn, ...args) {
    await this._up();
    const pp = this, find = `function (a) { return (${fn.toString()}).apply(null, a); }`;
    const run = (f, rest) => pp.page.evaluate(Object.assign(function () {}, { toString: () => `function (a) { var h = (${find})(a.a); return (${f})(h, a.r); }` }), { a: args, r: rest });
    const h = {
      jsonValue: async () => run('function (h) { return h ? true : null; }'),
      dispose: async () => {},
      evaluate: (f, r) => run(f.toString(), r),
      click: async () => {
        const pt = await run('function (h) { h.scrollIntoView({ block: "center", inline: "center" }); var b = h.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }');
        await pp.mouse.click(pt.x, pt.y);
      },
      boundingBox: () => run('function (h) { var b = h.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }'),
      isVisible: () => run('function (h) { var b = h.getBoundingClientRect(); return b.width > 0 && b.height > 0; }'),
      focus: () => run('function (h) { h.focus(); }'),
      textContent: () => run('function (h) { return h.textContent; }'),
      getProperty: n => ({ jsonValue: () => run(`function (h) { return h[${JSON.stringify(n)}]; }`) })
    };
    const ok = await run('function (h) { return !!h; }');
    return ok ? h : null;
  }
  async waitForFunction(fn, o, arg) {
    await this._up();
    const v = await this._retry(() => this.page.waitForFunction(fn, arg, { timeout: o && o.timeout }));
    return { jsonValue: async () => v, dispose: async () => {} };
  }
  on(ev, fn) { if (ev === 'pageerror' || ev === 'console') { this._up().then(() => this.page.on(ev, (...a) => { if (this.s.cur === this) fn(...a); }), () => {}); } return this; }
  once(ev, fn) { return this.on(ev, fn); }
  off() { return this; }
  removeAllListeners() { return this; }
  /* ----- input ----- */
  get keyboard() {
    const act = list => this._up().then(() => this.page._actions([{ type: 'key', id: 'keyboard', actions: list }]));
    const k = n => WD.keyChar(n === '\n' ? 'Enter' : n);
    const kb = {
      down: n => { this.held.add(n); return act([{ type: 'keyDown', value: k(n) }]); },
      up: n => { this.held.delete(n); return act([{ type: 'keyUp', value: k(n) }]); },
      /* the driver may forget keys held in an earlier call, so a press repeats the held modifiers (Control, Shift ...) around the key */
      press: async n => { const m = [...this.held].filter(x => x !== n); await act([...m.map(x => ({ type: 'keyDown', value: k(x) })), { type: 'keyDown', value: k(n) }, { type: 'keyUp', value: k(n) }, ...m.reverse().map(x => ({ type: 'keyUp', value: k(x) }))]); },
      /* capitals and shifted symbols are typed with Shift held explicitly: after a right-click the driver stops adding the Shift itself and types the plain key (C as c, ? as /) */
      type: async t => {
        const l = [], S = '~!@#$%^&*()_+{}|:"<>?', P = '`1234567890-=[]\\;\',./';
        for (const c of String(t)) {
          const base = S.includes(c) ? P[S.indexOf(c)] : (c !== c.toLowerCase() && c.toLowerCase() !== c.toUpperCase() && c.length === 1 && /[A-Z]/.test(c) ? c.toLowerCase() : null);
          if (base) l.push({ type: 'keyDown', value: k('Shift') }, { type: 'keyDown', value: k(base) }, { type: 'keyUp', value: k(base) }, { type: 'keyUp', value: k('Shift') });
          else l.push({ type: 'keyDown', value: k(c) }, { type: 'keyUp', value: k(c) });
        }
        if (l.length) await act(l);
      },
      sendCharacter: async t => { await this.evaluate(s => { document.execCommand('insertText', false, s); }, String(t)); }
    };
    Object.defineProperty(this, 'keyboard', { value: kb });
    return kb;
  }
  get mouse() {
    const m = f => async (...a) => { await this._up(); if (typeof a[0] === 'number') this.at = { x: a[0], y: a[1] }; return this.page.mouse[f](...a); };
    /* the wheel is sent as a script event (the driver's own wheel action does not carry held keys), with Ctrl, Shift, Alt and Meta as held down by keyboard.down */
    const wheel = async (d, y) => {
      await this._up();
      const dx = typeof d === 'object' ? d.deltaX || 0 : d, dy = typeof d === 'object' ? d.deltaY || 0 : y;
      const mod = { ctrlKey: this.held.has('Control') || this.held.has('ControlOrMeta'), shiftKey: this.held.has('Shift'), altKey: this.held.has('Alt'), metaKey: this.held.has('Meta') };
      if (!Object.values(mod).some(Boolean)) return this.page.mouse.wheel(dx, dy);
      return this.page.evaluate(a => { const t = document.elementFromPoint(a.x, a.y) || document.body; t.dispatchEvent(new WheelEvent('wheel', Object.assign({ deltaX: a.dx, deltaY: a.dy, clientX: a.x, clientY: a.y, bubbles: true, cancelable: true }, a.mod))); }, { x: this.at.x, y: this.at.y, dx, dy, mod });
    };
    const mouse = { move: m('move'), down: m('down'), up: m('up'), click: m('click'), wheel };
    Object.defineProperty(this, 'mouse', { value: mouse });
    return mouse;
  }
  /** bidi.js click(): a move to the point, then one or more press-and-release pairs */
  async pointer(acts) {
    await this._up();
    const mv = acts.find(a => a.type === 'pointerMove'); if (mv) this.at = { x: mv.x, y: mv.y };
    const rest = acts.filter(a => a.type !== 'pointerMove');
    if (mv && rest.length === 2 && !rest[0].button) return this.page.mouse.click(mv.x, mv.y);
    if (mv) await this.page.mouse.move(mv.x, mv.y);
    const r = await this.page._actions([{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: rest }]);
    /* after a right or middle button the driver keeps its input state (typed capitals then arrive as small letters); Release Actions clears it */
    if (rest.some(a => a.button)) await WD.call(this.wd.port, 'DELETE', '/session/' + this.wd.sessionId + '/actions').catch(() => {});
    return r;
  }
  /* ----- the window ----- */
  /** window size minus page size, measured once when the browser starts (its only window), so any window can be sized later without asking an empty page anything */
  async _measure() {
    const s = this.s;
    if (s.delta) return;
    const rect = await win(s, 'GET', '/window/rect'), inner = await s.page.evaluate(() => [innerWidth, innerHeight]);
    s.delta = { w: rect.width - inner[0], h: rect.height - inner[1] };
  }
  async _size() { await this._measure(); await win(this.s, 'POST', '/window/rect', { width: this.view.width + this.s.delta.w, height: this.view.height + this.s.delta.h }); }
  async setViewport(v) { this.view = v; if (this.s.wd && this.handle) { await this._up(); await this._size(); } }
  /** WebKitGTK's window cannot be made narrower than about 447 px; say so in the suite's output when a suite asked for less */
  async _sizeNote() {
    if (!this.view || this.noted) return;
    const got = await this.page.evaluate(() => [innerWidth, innerHeight]).catch(() => null);
    if (got && (got[0] !== this.view.width || got[1] !== this.view.height)) { this.noted = true; console.log(`NOTE WebKitGTK window is ${got[0]}x${got[1]}, not the ${this.view.width}x${this.view.height} asked for (its window has a smallest size)`); }
  }
  viewport() { return this.view; }
  async bringToFront() {}
  async title() { return this.evaluate(() => document.title); }
  url() { return this.cur; }
  async content() { return this.evaluate(() => document.documentElement.outerHTML); }
  async screenshot(o) { await this._up(); return this.page.screenshot(o); }
  async close() {
    if (this.closed) return; this.closed = true;
    const s = this.s; s.open--;
    try {
      if (s.launch) await s.launch.catch(() => {});
      if (!s.wd || !this.handle) return;
      if (s.open > 0) {
        await this._switch(); await win(s, 'DELETE', '/window'); s.cur = null;
        /* with its current window gone the driver cannot open a new one ("no such window"), so move to a window that is still there */
        const live = this.ctx.pages.find(p => p !== this && !p.closed && p.handle);
        if (live) await live._switch();
      }
      else { /* the last page of the context closed: its WebKit ends too (a page opened later starts a fresh one, with empty storage). Keeping the window for reuse made the next load hang about half the time */
        for (const p of s.servers.values()) { try { (await p).srv.close(); } catch (e) { /* closed */ } }
        this.ctx.s = freshSession();
        await s.wd.close();
      }
    } catch (e) { /* already gone */ }
  }
}

const freshSession = () => ({ launch: null, wd: null, page: null, cur: null, nav: null, servers: new Map(), open: 0 });

class WKContext {
  constructor(browser) { this.browser = browser; this.pages = []; this.s = freshSession(); }
  async newPage() { const p = new WKPp(this); this.s.open++; this.s.nav = this.s.nav || p; this.pages.push(p); return p; }
  async close() {
    await Promise.all(this.pages.map(p => p.close()));
    const s = this.s;
    try {
      for (const p of s.servers.values()) { try { (await p).srv.close(); } catch (e) { /* closed */ } }
      if (s.launch) await s.launch.catch(() => {});
      if (s.wd) await s.wd.close();
    } catch (e) { /* already gone */ }
  }
}
class WKBrowser {
  constructor() { this.ctxs = []; }
  async createBrowserContext() { const c = new WKContext(this); this.ctxs.push(c); return c; }
  version() { return 'WebKitGTK'; }
  async close() { await Promise.all(this.ctxs.map(c => c.close())); }
}

exports.webkit = {
  async launch() {
    const b = new WKBrowser();
    return new Browser(b);
  }
};
exports.version = () => {
  if (process.env.WEBKIT === 'epiphany') { /* GNOME Web: its own version, and the WebKitGTK under it */
    const e = require('child_process').spawnSync('dpkg-query', ['-W', '-f', '${Version}', 'epiphany-browser'], { encoding: 'utf8' });
    const w = require('child_process').spawnSync('dpkg-query', ['-W', '-f', '${Version}', 'libwebkit2gtk-4.1-0'], { encoding: 'utf8' });
    return 'GNOME Web (Epiphany) ' + (e.status === 0 ? e.stdout.trim().replace(/-.*$/, '') : '(version not found)') + ' on WebKitGTK ' + (w.status === 0 ? w.stdout.trim().replace(/-.*$/, '') : '(version not found)');
  }
  const r = require('child_process').spawnSync('dpkg-query', ['-W', '-f', '${Version}', 'libwebkit2gtk-4.1-0'], { encoding: 'utf8' });
  return r.status === 0 ? 'WebKitGTK ' + r.stdout.trim().replace(/-.*$/, '') : 'WebKitGTK (version not found)';
};

/* WK_TRACE=1 node suite.js webkit: one line when each page call starts and ends, to see where a run is stuck */
if (process.env.WK_TRACE) {
  for (const name of Object.getOwnPropertyNames(WKPp.prototype)) {
    const d = Object.getOwnPropertyDescriptor(WKPp.prototype, name), f = d && d.value;
    if (typeof f !== 'function' || name === 'constructor' || name.startsWith('_')) continue;
    WKPp.prototype[name] = function (...a) {
      const id = ++WKPp.n || (WKPp.n = 1), t = Date.now(), w = `${name}(${typeof a[0] === 'string' ? a[0].slice(0, 50) : typeof a[0] === 'function' ? String(a[0]).slice(0, 50).replace(/\s+/g, ' ') : ''})`;
      process.stderr.write(`wk> ${id} ${w}\n`);
      const r = f.apply(this, a);
      if (r && r.then) r.then(() => process.stderr.write(`wk< ${id} ${Date.now() - t} ms\n`), e => process.stderr.write(`wk! ${id} ${e && e.message}\n`));
      return r;
    };
  }
}
