/* Twine import, checked against a reference player. Random stories are written in SugarCube and in Harlowe from one abstract description
   (numbers, yes/no flags and pick-one words; if / else-if / else, nested; visited(); link setters; links in every spelling). A tiny player reads the
   abstract description directly and plays it the way Twine would; the story is also written out as Twine text, converted with code: 'rules', and played
   with the editor's own game rules. At every page and state reached, the words shown and the choices offered must be the same.
   Pages the converter flags as unfinished (a test too tangled to turn into rules) are not compared; they must stay a small share.
   Usage: node twine-diff.mjs [stories=200] [seed=1]   Exit code 1 and a message on any difference.   Copyright (c) 2026 LFC Foundry. MIT License. */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const ed = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ed), 'utf8');
const ctx = createContext({ console, TextDecoder });
runInContext(`${read('core.js')}\n${read('player.js')}\n${read('maplayout.js')}\n${read('twine.js')}\nthis.C = { importTwine, klVisibleBlocks, klShown, klArrive, klInit, klStatMap, klChoose, klCondOk };`, ctx);
const C = ctx.C;
let seed = Number(process.argv[3] || 1);
const N = Number(process.argv[2] || 200);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = a => a[Math.floor(rnd() * a.length)];
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

function genCond(vars, readable, pages, depth = 0) {
  const r = rnd();
  if (depth < 2 && r < 0.35) return { t: pick(['and', 'or']), a: genCond(vars, readable, pages, depth + 1), b: genCond(vars, readable, pages, depth + 1) };
  if (depth < 2 && r < 0.45) return { t: 'not', a: genCond(vars, readable, pages, depth + 1) };
  if (!readable.length) return { t: 'v', page: pick(pages) };
  const v = pick(readable);
  if (rnd() < 0.12) return { t: 'v', page: pick(pages) };
  if (v.type === 'bool') return { t: 'b', v: v.name, how: ri(0, 3) };
  if (v.type === 'num') return { t: 'n', v: v.name, op: pick(['>=', '>', '<', '<=', '==', '!=']), c: ri(0, 4) };
  return { t: 'w', v: v.name, op: pick(['==', '!=']), c: pick(v.vals) };
}
function genItems(ctx, depth, top) {
  const items = [];
  const n = ri(1, 4);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    if (r < 0.3) items.push({ k: 't', s: `w${ctx.w++}` });
    else if (r < 0.65 && depth < 2) {
      const br = [];
      const nb = ri(1, 3);
      for (let b = 0; b < nb; b++) br.push({ c: b === nb - 1 && nb > 1 && rnd() < 0.5 ? null : genCond(ctx.vars, ctx.readable, ctx.pages), body: genItems(ctx, depth + 1, false) });
      items.push({ k: 'i', br });
    } else if (r < 0.9) items.push(genLink(ctx));
    else if (ctx.writable.length && depth > 0 && ctx.csets < 2) { ctx.csets++; items.push(genSet(ctx.writable)); }
    else items.push({ k: 't', s: `w${ctx.w++}` });
  }
  return items;
}
function genSet(vars) {
  const v = pick(vars);
  if (v.type === 'bool') return { k: 's', v: v.name, op: 'set', val: rnd() < 0.5 };
  if (v.type === 'num') { const o = pick(['set', 'add', 'sub']); return { k: 's', v: v.name, op: o, val: o === 'set' ? ri(0, 4) : ri(1, 2) }; }
  return { k: 's', v: v.name, op: 'set', val: pick(v.vals) };
}
function genLink(ctx) {
  const to = pick(ctx.targets);
  const l = { k: 'l', label: `L${ctx.w++}`, to, form: ri(0, 2), setter: [] };
  if (ctx.writable.length && ctx.csets < 3 && rnd() < 0.3) { ctx.csets++; l.setter.push(genSet(ctx.writable)); }
  return l;
}
function genStory() {
  const vars = [];
  const nv = ri(2, 4);
  for (let i = 0; i < nv; i++) {
    const type = pick(['bool', 'num', 'str']);
    if (type === 'bool') vars.push({ name: `b${i}`, type, init: rnd() < 0.3 });
    else if (type === 'num') vars.push({ name: `n${i}`, type, init: ri(0, 3) });
    else { const vals = ['red', 'green', 'blue'].slice(0, ri(2, 3)); vars.push({ name: `s${i}`, type, vals, init: pick(vals) }); }
  }
  const np = ri(3, 6);
  const pages = Array.from({ length: np }, (_, i) => `P${i}`);
  const passages = pages.map((name, i) => {
    const wr = vars.filter(() => rnd() < 0.4);
    const readable = vars.filter(v => !wr.includes(v));
    const ctx = { vars, readable, writable: wr, pages, targets: pages.filter(p => p !== 'P0'), w: i * 100, csets: 0 };
    const uncond = [];
    const nu = ri(0, 2);
    for (let k = 0; k < nu; k++) uncond.push(genSet(vars));
    const items = uncond.concat(genItems(ctx, 0, true));
    return { name, items };
  });
  return { vars, passages };
}

/* ---- the reference player: reads the abstract story directly ---- */
function evalCond(c, st) {
  switch (c.t) {
    case 'and': return evalCond(c.a, st) && evalCond(c.b, st);
    case 'or': return evalCond(c.a, st) || evalCond(c.b, st);
    case 'not': return !evalCond(c.a, st);
    case 'v': return st.visited.has(c.page);
    case 'b': return c.how === 2 || c.how === 3 ? !st.vars[c.v] : !!st.vars[c.v];
    case 'n': { const x = st.vars[c.v]; return { '>=': x >= c.c, '>': x > c.c, '<': x < c.c, '<=': x <= c.c, '==': x === c.c, '!=': x !== c.c }[c.op]; }
    case 'w': return c.op === '==' ? st.vars[c.v] === c.c : st.vars[c.v] !== c.c;
  }
}
let RANGE = {};
function applySet(it, st) {
  if (it.op === 'set') st.vars[it.v] = it.val;
  else if (it.op === 'add') st.vars[it.v] += it.val;
  else st.vars[it.v] -= it.val;
}
function clampAll(st) {
  for (const k in RANGE) st.vars[k] = Math.max(RANGE[k][0], Math.min(RANGE[k][1], st.vars[k]));
}
function exec(items, st, out) {
  for (const it of items) {
    if (it.k === 't') out.text.push(it.s);
    else if (it.k === 's') applySet(it, st);
    else if (it.k === 'l') out.links.push(it);
    else if (it.k === 'i') {
      for (const b of it.br) if (b.c === null || evalCond(b.c, st)) { exec(b.body, st, out); break; }
    }
  }
}

/* ---- writers ---- */
function condText(c, d) {
  const sc = d === 'sc';
  switch (c.t) {
    case 'and': return `(${condText(c.a, d)}) ${sc && c.a.t !== 'or' ? '&&' : 'and'} (${condText(c.b, d)})`;
    case 'or': return `(${condText(c.a, d)}) ${sc ? '||' : 'or'} (${condText(c.b, d)})`;
    case 'not': return `${sc ? '!' : 'not '}(${condText(c.a, d)})`;
    case 'v': return sc ? `visited("${c.page}")` : `(history:) contains "${c.page}"`;
    case 'b': return [`$${c.v}`, `$${c.v} is true`, sc ? `!$${c.v}` : `not $${c.v}`, `$${c.v} is false`][c.how];
    case 'n': return `$${c.v} ${sc ? { '>=': 'gte', '>': 'gt', '<': 'lt', '<=': 'lte', '==': 'is', '!=': 'neq' }[c.op] : c.op === '==' ? 'is' : c.op === '!=' ? 'is not' : c.op} ${c.c}`;
    case 'w': return `$${c.v} ${c.op === '==' ? 'is' : sc ? 'isnot' : 'is not'} "${c.c}"`;
  }
}
function setText(it, d) {
  const val = typeof it.val === 'string' ? `"${it.val}"` : String(it.val);
  if (d === 'sc') return it.op === 'set' ? `<<set $${it.v} to ${val}>>` : `<<set $${it.v} ${it.op === 'add' ? '+=' : '-='} ${val}>>`;
  return it.op === 'set' ? `(set: $${it.v} to ${val})` : `(set: $${it.v} to it ${it.op === 'add' ? '+' : '-'} ${val})`;
}
function itemsText(items, d) {
  return items.map(it => {
    if (it.k === 't') return `${it.s} `;
    if (it.k === 's') return setText(it, d) + '\n';
    if (it.k === 'l') {
      if (d === 'hl' && it.form === 2) return `\n(link-goto: "${it.label}", "${it.to}")\n`;
      const set = d === 'sc' && it.setter.length ? `[${it.setter.map(s => setText(s, 'sc').replace(/^<<set |>>$/g, '')).join(', ')}]` : '';
      return '\n' + (it.form === 0 ? `[[${it.label}->${it.to}]]` : it.form === 1 ? `[[${it.label}|${it.to}]]` : `[[${it.to}<-${it.label}]]`).replace(/\]\]$/, `]]${''}`).replace(/\]\]$/, set ? `]${set}]` : ']]') + '\n';
    }
    if (d === 'sc') {
      return it.br.map((b, i) => (b.c === null ? '<<else>>' : `<<${i ? 'elseif' : 'if'} ${condText(b.c, d)}>>`) + '\n' + itemsText(b.body, d)).join('') + '<</if>>\n';
    }
    return it.br.map((b, i) => (b.c === null ? '(else:)' : `(${i ? 'else-if' : 'if'}: ${condText(b.c, d)})`) + '[\n' + itemsText(b.body, d) + ']').join('') + '\n';
  }).join('');
}
function twee(st, d) {
  const fmt = d === 'sc' ? 'SugarCube' : 'Harlowe';
  let out = `:: StoryTitle\nT\n\n:: StoryData\n{"ifid":"D674C58C-DEFA-4F70-B7A2-27742230C0FC","format":"${fmt}","format-version":"1","start":"P0"}\n\n`;
  const init = st.vars.map(v => setText({ v: v.name, op: 'set', val: v.init }, d)).join('\n');
  if (d === 'sc') out += `:: StoryInit\n${init}\n\n`;
  st.passages.forEach((p, i) => { out += `:: ${p.name}\n${i === 0 && d === 'hl' ? init + '\n' : ''}${itemsText(p.items, d)}\n\n`; });
  return out;
}

/* ---- compare ---- */
const norm = s => s.replace(/\s+/g, ' ').trim();
let bad = 0, flagged = 0, pagesTotal = 0, checked = 0, nodes = 0;
for (let n = 0; n < N; n++) {
  const st = genStory();
  for (const d of ['sc', 'hl']) {
    const text = twee(st, d);
    let r;
    try { r = C.importTwine(text, { code: 'rules' }); } catch (e) { console.log('IMPORT FAILED', e.message, '\n', text); bad++; continue; }
    const proj = r.project;
    const byName = {}; proj.passages.forEach(p => (byName[p.name] = p));
    const byId = {}; proj.passages.forEach(p => (byId[p.id] = p));
    pagesTotal += proj.passages.length; flagged += proj.passages.filter(p => p.todo).length;
    const stm = C.klStatMap(proj.items); RANGE = {}; proj.items.forEach(i => { if (i.kind === 'stat') RANGE['n' + i.name.slice(1)] = [i.lo, i.hi]; });
    const vs = { vars: Object.fromEntries(st.vars.map(v => [v.name, v.init])), visited: new Set() };
    const start = byName.P0;
    const q = [{ page: 'P0', vs: { vars: { ...vs.vars }, visited: new Set() }, f: null, depth: 0, path: [] }];
    const seen = new Set();
    let first = true, fail = null;
    while (q.length && !fail) {
      const cur = q.shift();
      const ip = st.passages.find(p => p.name === cur.page);
      const mp = byName[cur.page];
      cur.vs.visited.add(cur.page);
      cur.f = C.klArrive(first ? C.klInit({}, stm) : cur.f, mp, stm);
      first = false;
      const key = cur.page + JSON.stringify(cur.vs.vars) + [...cur.vs.visited].sort() ;
      if (seen.has(key) || seen.size > 400) continue;
      seen.add(key);
      nodes++;
      if (mp.todo) { continue; }
      const out = { text: [], links: [] };
      const st2 = { vars: { ...cur.vs.vars }, visited: new Set(cur.vs.visited) };
      // conditional sets inside the page are deferred in the model: run reading state, but apply writes after
      const exs = { vars: { ...cur.vs.vars }, visited: cur.vs.visited };
      exec(ip.items, exs, out); clampAll(exs);
      const mText = norm(C.klVisibleBlocks(mp, cur.f).map(b => b.text).join(' '));
      const iText = norm(out.text.join(' '));
      const mCh = C.klShown(mp, cur.f).filter(c => C.klCondOk(c, cur.f));
      const iLinks = out.links.map(l => `${l.label}>${l.to}`).sort().filter((x, i, a) => a.indexOf(x) === i);
      const mLinks = mCh.map(c => `${c.label}>${byId[c.to].name}`).sort().filter((x, i, a) => a.indexOf(x) === i);
      checked++;
      if (mText !== iText || JSON.stringify(iLinks) !== JSON.stringify(mLinks)) { fail = { text: mText === iText ? null : [iText, mText], links: [iLinks, mLinks], path: cur.path, page: cur.page, vars: cur.vs.vars }; break; }
      if (cur.depth >= 5) continue;
      for (const l of out.links) {
        const c = mCh.find(c => c.label === l.label && byId[c.to].name === l.to);
        // the reference applies the link's setter, and the writes made by sets inside the page (conditional sets run during exec: use exs for those)
        const nv = { vars: { ...exs.vars }, visited: new Set(cur.vs.visited) };
        // exs already holds all sets of this page (unconditional first, conditional later); links do not read variables after, so that is the state on click
        if (d === 'sc') l.setter.forEach(s => applySet(s, nv)); clampAll(nv);
        q.push({ page: l.to, vs: nv, f: C.klChoose(cur.f, c, stm), depth: cur.depth + 1, path: cur.path.concat(`${cur.page}:${l.label}`) });
      }
    }
    if (fail) {
      bad++;
      if (bad <= 3 && process.env.SHOW) { console.log('INIT', JSON.stringify(st.vars), JSON.stringify(st.passages[0].items)); console.log('MISMATCH', d, JSON.stringify(fail), '\n' + text); }
    }
  }
}
/* damaged files: cut and scribbled-on copies of the sample files must either be refused in plain words or give a story the editor can open; never a crash */
import { readdirSync } from 'node:fs';
let crashes = 0, refused = 0, opened = 0;
{
  const dir = new URL('fixtures/twine/', import.meta.url);
  const marks = ['<', '>', '[', ']', '(', ')', '$', '"', "'", '\\', '-', ':', '<<', '>>', '[[', ']]', '(if:', '(set:', '<<if', '<</if>>', '&', ';', '{', '}'];
  for (const f of readdirSync(dir)) {
    const base = readFileSync(new URL(f, dir), 'utf8');
    for (let i = 0; i < 150; i++) {
      let t = base;
      const k = ri(1, 4);
      for (let j = 0; j < k; j++) {
        const at = ri(0, t.length);
        const r = rnd();
        if (r < 0.3) t = t.slice(0, at) + t.slice(at + ri(1, 40));
        else if (r < 0.7) t = t.slice(0, at) + pick(marks) + t.slice(at);
        else if (r < 0.8) t = t.slice(0, at);
        else t = t.slice(0, at) + t.slice(ri(0, t.length));
      }
      for (const code of ['text', 'rules']) {
        try {
          const r = C.importTwine(t, { code });
          if (!r.project.passages.length || !r.project.passages.some(p => p.id === r.project.start)) throw new Error('empty story or no start page');
          opened++;
        } catch (e) {
          if (/^(That |This Twine)/.test(e.message)) refused++;
          else { crashes++; if (crashes <= 3) console.log('CRASH', f, code, e.stack.split('\n').slice(0, 3).join(' | ')); }
        }
      }
    }
  }
  console.log(`${crashes ? 'FAIL' : 'PASS'} damaged Twine files: ${opened} opened, ${refused} refused in plain words, ${crashes} crashed`);
  if (crashes) bad++;
}
/* hostile files must not hang the editor or crash it */
{
  const mk = (fmt, body) => `:: StoryTitle\nT\n\n:: StoryData\n{"format":"${fmt}","format-version":"1","start":"A"}\n\n:: A\n${body}\n`;
  const cases = [
    ['100,000 "[[" in a row', mk('SugarCube', '[['.repeat(100000))],
    ['100,000 "[[" in a row (Harlowe)', mk('Harlowe', '[['.repeat(100000))],
    ['100,000 "<<" in a row', mk('SugarCube', '<<'.repeat(100000))],
    ['5,000 nested hooks', mk('Harlowe', '(if: $a)['.repeat(5000))],
    ['3,000 unclosed <<if>>', mk('SugarCube', '<<if $a>>'.repeat(3000))],
    ['2,000-deep nesting', mk('SugarCube', '<<if $a>>'.repeat(2000) + '<</if>>'.repeat(2000))],
    ['20,000 set macros', mk('SugarCube', '<<set $a to 1>>'.repeat(20000))],
    ['a 200 KB link', mk('SugarCube', '[[' + 'a'.repeat(200000) + ']]')]
  ];
  let slow = 0;
  for (const [name, text] of cases) for (const code of ['text', 'rules']) {
    const t0 = Date.now();
    try { C.importTwine(text, { code }); } catch (e) { if (!/^(That |This Twine)/.test(e.message)) { slow++; console.log('CRASH', name, e.message); } }
    const ms = Date.now() - t0;
    if (ms > 6000) { slow++; console.log(`SLOW ${name} (${code}): ${ms} ms`); }
  }
  console.log(`${slow ? 'FAIL' : 'PASS'} hostile files: ${cases.length * 2} runs, each finished in under 6 seconds without crashing`);
  if (slow) bad++;
}
const share = flagged / Math.max(1, pagesTotal);
console.log(`${bad ? 'FAIL' : 'PASS'} ${N} random stories, each in SugarCube and Harlowe: ${checked} page-states compared, ${bad} stories differ; ${flagged} of ${pagesTotal} pages flagged unfinished and skipped (${(share * 100).toFixed(1)}%)`);
if (share > 0.08) { console.log(`FAIL too many pages were flagged unfinished (${(share * 100).toFixed(1)}%, limit 8%)`); process.exit(1); }
if (bad) process.exit(1);

