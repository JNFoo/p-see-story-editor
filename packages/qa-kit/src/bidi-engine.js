/* The selector engine that bidi.js puts into every page (read as text, so it is ordinary JavaScript here).
   It understands the Playwright selector forms the suites use; see the top of bidi.js. */
(() => {
  if (window.__pwq) return;
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();

  /** splits 'a >> b >> nth=0' on " >> " outside quotes and brackets */
  const splitChain = sel => {
    const out = [];
    let cur = '', q = '', depth = 0;
    for (let i = 0; i < sel.length; i++) {
      const c = sel[i];
      if (q) { cur += c; if (c === '\\') cur += sel[++i]; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (depth === 0 && sel.startsWith(' >> ', i)) { out.push(cur); cur = ''; i += 3; continue; }
      cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  /** text=foo (case-insensitive substring) | text="foo" (exact) | text=/re/i */
  const textTest = spec => {
    let m = spec.match(/^\/(.*)\/([a-z]*)$/s);
    if (m) { const re = new RegExp(m[1], m[2]); return t => re.test(norm(t)); }
    m = spec.match(/^"(.*)"$/s) || spec.match(/^'(.*)'$/s);
    if (m) { const w = norm(m[1]); return t => norm(t) === w; }
    const w = norm(spec).toLowerCase();
    return t => norm(t).toLowerCase().includes(w);
  };

  /** the smallest elements whose text matches (not scripts, styles or the head) */
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|HEAD|TITLE|META|LINK)$/;
  const findText = (scope, test) => {
    const out = [];
    const all = scope.querySelectorAll ? [...scope.querySelectorAll('*')].filter(e => !SKIP.test(e.tagName) && !e.closest('head')) : [];
    for (const el of all) {
      if (!test(el.textContent)) continue;
      if ([...el.children].some(k => test(k.textContent))) continue;
      out.push(el);
    }
    return out;
  };

  const TEXT_PSEUDO = /:(has-text|text-is|text)\(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\)/;
  const makeTest = (kind, arg) => {
    const w = norm(JSON.parse(arg[0] === "'" ? '"' + arg.slice(1, -1).replace(/"/g, '\\"') + '"' : arg));
    return kind === 'text-is' ? t => norm(t) === w : t => norm(t).toLowerCase().includes(w.toLowerCase());
  };

  /** css, where :has-text("x") / :text-is("x") may sit on any part: dialog label:has-text("Map") input */
  const splitCommas = css => {
    const out = [];
    let cur = '', q = '', depth = 0;
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (q) { cur += c; if (c === '\\') cur += css[++i]; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (depth === 0 && c === ',') { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  };
  const findCss = (scope, css) => {
    if (!TEXT_PSEUDO.test(css)) return [...scope.querySelectorAll(css.trim() || '*')];
    const alts = splitCommas(css);
    if (alts.length > 1) { const all = []; for (const a of alts) for (const e of findCss(scope, a)) if (!all.includes(e)) all.push(e); return all; }
    const steps = [];
    let cur = '', q = '', depth = 0, comb = ' ';
    for (let i = 0; i < css.length; i++) {
      const c = css[i];
      if (q) { cur += c; if (c === '\\') cur += css[++i]; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === '(' || c === '[') depth++;
      if (c === ')' || c === ']') depth--;
      if (depth === 0 && (c === ' ' || c === '>')) {
        if (cur.trim()) { steps.push({ comb, css: cur.trim() }); cur = ''; comb = ' '; }
        if (c === '>') comb = '>';
        continue;
      }
      cur += c;
    }
    if (cur.trim()) steps.push({ comb, css: cur.trim() });
    let set = [scope];
    for (const st of steps) {
      const tests = [];
      const bare = st.css.replace(new RegExp(TEXT_PSEUDO.source, 'g'), (_, k, a) => { tests.push(makeTest(k, a)); return ''; });
      const next = [];
      for (const el of set) {
        const hits = st.comb === '>' ? [...el.children].filter(k => k.matches(bare || '*')) : [...el.querySelectorAll(bare || '*')];
        for (const h of hits) if (!next.includes(h) && tests.every(t => t(h.textContent))) next.push(h);
      }
      set = next;
    }
    return set;
  };

  const resolve = sel => {
    let cur = [document];
    for (const part of splitChain(sel)) {
      const m = part.match(/^nth=(-?\d+)$/);
      if (m) { const i = +m[1]; const e = cur[i < 0 ? cur.length + i : i]; cur = e ? [e] : []; continue; }
      const next = [];
      for (const scope of cur) {
        const found = part.startsWith('text=') ? findText(scope, textTest(part.slice(5))) : findCss(scope, part);
        for (const e of found) if (!next.includes(e)) next.push(e);
      }
      cur = next;
    }
    return cur;
  };

  const visible = e => {
    const r = e.getBoundingClientRect();
    const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  /* ---- quiet waiting: the pending one-shot timers of the page, so a test can wait "until it has settled" instead of a fixed time ---- */
  const timers = new Map(); // timer id -> time it is due
  const nativeSet = window.setTimeout, nativeClear = window.clearTimeout;
  window.setTimeout = function (fn, d, ...a) {
    if (typeof fn !== 'function') return nativeSet.call(window, fn, d, ...a);
    const delay = +d || 0;
    const id = nativeSet.call(window, function () { timers.delete(id); return fn.apply(this, a); }, delay);
    timers.set(id, performance.now() + delay);
    return id;
  };
  window.clearTimeout = id => { timers.delete(id); return nativeClear.call(window, id); };
  const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  /** Waits up to `ms`, but returns as soon as nothing that would happen within `ms` is left: every timer due in that window has run
   *  and every CSS animation that ends in it has ended. Intervals and endless animations are ignored. */
  const settle = async ms => {
    const deadline = performance.now() + ms;
    for (;;) {
      await frames();
      const now = performance.now();
      let next = -1; // -1: nothing pending in the window
      for (const due of timers.values()) if (due <= deadline && due > next) next = due;
      for (const an of document.getAnimations()) {
        const t = an.effect && an.effect.getComputedTiming && an.effect.getComputedTiming();
        if (an.playState === 'running' && t && isFinite(t.endTime)) { const end = now + (t.endTime - (t.localTime || 0)); if (end <= deadline && end > next) next = end; }
      }
      if (next < 0 || now >= deadline) return;
      await new Promise(r => nativeSet.call(window, r, Math.max(1, Math.min(Math.max(0, next - now) + 4, deadline - now))));
    }
  };

  /** Cheaper than settle: no waiting for frames. Returns at once if no timer is due within `ms`; otherwise waits until those have run. */
  const idle = async ms => {
    const deadline = performance.now() + ms, giveUp = performance.now() + 10000; /* a busy or background page runs its timers late, so wait for them rather than count rounds */
    for (;;) {
      let next = -1; // -1: nothing pending in the window
      for (const due of timers.values()) if (due <= deadline && due > next) next = due;
      if (next < 0 || performance.now() > giveUp) { await new Promise(r => nativeSet.call(window, r, 0)); return; }
      await new Promise(r => nativeSet.call(window, r, Math.max(5, next - performance.now() + 2)));
    }
  };

  /** One call for everything a click needs: scroll it into view, wait for it to stop moving, check nothing covers it and it is
   *  enabled, and return the point to click. state is 'ok', or why not ('missing', 'hidden', 'covered', 'disabled'). */
  const prepare = async (sel, align, pos, force) => {
    const e = resolve(sel)[0];
    if (!e) return { state: 'missing' };
    if (!visible(e)) return { state: 'hidden' };
    e.scrollIntoView({ block: align, inline: 'nearest' });
    let r = e.getBoundingClientRect();
    /* nothing animating it or around it: it cannot be moving, so there is nothing to wait for */
    const moving = document.getAnimations().some(an => an.playState === 'running' && an.effect && an.effect.target && (an.effect.target.contains(e) || e.contains(an.effect.target)));
    for (let i = 0; moving && i < 8; i++) {
      await frames();
      const r2 = e.getBoundingClientRect();
      const still = Math.abs(r.x - r2.x) < 0.5 && Math.abs(r.y - r2.y) < 0.5 && Math.abs(r.width - r2.width) < 0.5;
      r = r2;
      if (still) break;
    }
    if (!force && (e.disabled || e.closest('fieldset:disabled'))) return { state: 'disabled' };
    const p = pos ? { x: r.x + pos.x, y: r.y + pos.y } : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    if (!force) {
      const top = document.elementFromPoint(p.x, p.y);
      const lab = top && top.closest && top.closest('label');
      if (!top || !(top === e || e.contains(top) || top.contains(e) || (lab && lab.contains(e)))) return { state: 'covered', p };
    }
    return { state: 'ok', p };
  };

  window.__pwq = { pending: () => [...timers.values()].map(d => Math.round(d - performance.now())), all: resolve, first: sel => resolve(sel)[0] || null, visible, norm, settle, idle, prepare };
})();
