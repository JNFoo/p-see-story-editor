/* Damaged and old files: thousands of random mutations of real stories (a value replaced by null, "", a number, a list, an object, text;
   a field deleted; a list shortened; ids duplicated or pointed at nothing) must still load (normalizeProject), check (analyze), export
   (exportStory), simulate (playtest) and draw (mapGraph + layered) without throwing, and the result must be a whole story.
   Usage: node fuzz3.mjs [mutations=1500] [seed=1] */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const ED = new URL('../', import.meta.url).pathname;
const N = +process.argv[2] || 1500; let seed = +process.argv[3] || 1;
const ctx = createContext({ console, TextDecoder });
runInContext(readFileSync(ED + 'core.js', 'utf8') + '\n' + readFileSync(ED + 'player.js', 'utf8') + '\n' + readFileSync(ED + 'maplayout.js', 'utf8') +
  '\nthis.C={STARTERS,normalizeProject,analyze,exportStory,playtest,mapGraph,layered,MAP_W,MAP_H,klInit,klShown,klChoose,klArrive,klVisibleChoices,klFingerprint};', ctx);
const C = ctx.C;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff), pick = a => a[Math.floor(rnd() * a.length)], int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const bases = [];
for (const sp of C.STARTERS) bases.push([sp.name, JSON.parse(JSON.stringify(sp.make()))]);
bases.push(['keepers', JSON.parse(readFileSync(ED + 'keepers-light.project.json', 'utf8'))]);
const junk = () => pick([null, '', 0, -1, 3.7, 1e9, NaN, [], {}, 'text', true, false, [null], [{}], { a: 1 }, 'p_missing', '🙂'.repeat(5), undefined, 'x'.repeat(5000), -Infinity]);
function paths(o, pre = [], out = []) { if (o && typeof o === 'object') { out.push(pre); for (const k of Object.keys(o)) paths(o[k], pre.concat(k), out); } return out; }
function at(o, p) { return p.reduce((x, k) => x && x[k], o); }
function mutate(P) {
  const k = int(1, 4);
  for (let i = 0; i < k; i++) {
    const ps = paths(P); const p = pick(ps); if (!p.length) continue; const parent = at(P, p.slice(0, -1)); const key = p[p.length - 1]; const r = rnd();
    if (r < 0.45) parent[key] = junk();
    else if (r < 0.6) { if (Array.isArray(parent)) parent.splice(key, 1); else delete parent[key]; }
    else if (r < 0.7 && Array.isArray(parent)) parent.splice(+key, 0, JSON.parse(JSON.stringify(parent[key]))); // duplicate (ids clash)
    else if (r < 0.8 && P.passages && Array.isArray(P.passages)) { const q = pick(P.passages); if (q && Array.isArray(q.choices) && q.choices.length && pick(q.choices) && typeof pick(q.choices) === 'object') Object.assign(q.choices[0] || {}, { to: 0 }), q.choices[0] && typeof q.choices[0] === 'object' && (q.choices[0].to = pick(['', 'nope', P.passages[0]?.id])); }
    else if (r < 0.9) parent[key] = typeof parent[key] === 'string' ? parent[key] + pick(['\u0000', '</script>', '{{', '“', '\n\n\n']) : junk();
    else if (Array.isArray(P.passages)) P.passages.push(pick([null, 5, 'x', [], {}]));
  }
  return P;
}
let bad = 0, shown = 0;
const fail = (m, P, e) => { bad++; if (shown++ < 8) console.log('FAIL', m, '\n   ', (e && e.stack || e || '').toString().split('\n').slice(0, 3).join('\n    ')); };

/* Everything that must hold for one damaged story. Returns [{ m: message, e: error }] (empty when all is well); `skip` is true when the
   file is rightly refused as "not a story". */
function problems(name, raw, n) {
  const out = [];
  const add = (m, e) => out.push({ m: `${name} #${n}: ${m}`, e });
  let P;
  try { P = C.normalizeProject(JSON.parse(JSON.stringify(raw))); } catch (e) { if (/not a story backup|not a story/i.test(e.message)) return out; add('normalizeProject threw', e); return out; }
  const ids = new Set(P.passages.map(p => p.id));
  if (!P.passages.length || ids.size !== P.passages.length || !ids.has(P.start)) { add(`normalized story is not whole (pages ${P.passages.length}, unique ${ids.size}, start ${P.start})`); return out; }
  if (P.passages.find(p => p.id === P.start).ending) add('start page is an ending after normalize');
  for (const p of P.passages) for (const c of p.choices) if (c.to && !ids.has(c.to)) { add('choice to a page that does not exist survived normalize'); break; }
  const again = C.normalizeProject(JSON.parse(JSON.stringify(P)));
  if (JSON.stringify(again) !== JSON.stringify(P)) add('normalizeProject is not stable (running it twice changes the story)');
  for (const [what, f] of [['analyze', () => C.analyze(P)], ['exportStory', () => C.exportStory(P)], ['playtest', () => C.playtest(P, { runs: 20, mode: 'random' })],
    ['map', () => { const G = C.mapGraph(P, { fold: true, open: {}, merge: false }); G.nodes.forEach(x => { x.traffic = 0; x.choke = false; x.k = 1; x.w = C.MAP_W; x.h = C.MAP_H; }); return C.layered(G, { dir: 'LR', root: G.groupOf[P.start] }); }]]) {
    try { f(); } catch (e) { add(`${what} threw`, e); }
  }
  return out;
}

/* SHRINKING: the first story that fails is cut back to the fewest differences from its undamaged original that still fail the same way.
   A "difference" is a changed value, an added or removed field, or a list whose length changed; each one is put back or kept, and the
   usual delta-debugging loop removes as many as it can. The same idea as Fuzzer.shrink in JS-modules (tools/fuzz-kit), applied to a
   story instead of a list of operations. */
function differences(a, b, path = [], out = []) {
  const o = x => x && typeof x === 'object';
  if (o(a) && o(b) && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (k in a && k in b) differences(a[k], b[k], path.concat(k), out); else out.push(path.concat(k));
    }
  } else if (JSON.stringify(a) !== JSON.stringify(b) || !(Object.is(a, b))) { if (!(Object.is(a, b))) out.push(path); }
  return out;
}
function withDifferences(base, raw, units) {
  const P = JSON.parse(JSON.stringify(base));
  for (const p of units) {
    const parent = at(P, p.slice(0, -1)); const key = p[p.length - 1]; const src = at(raw, p);
    const from = at(raw, p.slice(0, -1));
    if (parent === undefined || parent === null || typeof parent !== 'object') continue;
    if (from && typeof from === 'object' && !(key in from)) delete parent[key]; else parent[key] = src === undefined ? undefined : (src && typeof src === 'object' ? JSON.parse(JSON.stringify(src)) : src);
  }
  return P;
}
function shrink(name, base, raw, firstMessage) {
  const key = firstMessage.replace(/#\d+/g, '#').replace(/[0-9]+/g, '#');
  let units = differences(base, raw);
  const same = us => problems(name, withDifferences(base, raw, us), 0).some(p => p.m.replace(/#\d+/g, '#').replace(/[0-9]+/g, '#') === key);
  if (!units.length || !same(units)) return { units: null };
  for (let n = 2, guard = 0; units.length >= 2 && guard++ < 400;) {
    const size = Math.ceil(units.length / n); let reduced = false;
    for (let k = 0; k < units.length; k += size) {
      const cand = units.slice(0, k).concat(units.slice(k + size));
      if (cand.length && same(cand)) { units = cand; n = Math.max(n - 1, 2); reduced = true; break; }
    }
    if (!reduced) { if (n >= units.length) break; n = Math.min(units.length, n * 2); }
  }
  return { units, story: withDifferences(base, raw, units) };
}
let shrunk = false;
for (let n = 0; n < N; n++) {
  const [name, base] = pick(bases); const raw = mutate(JSON.parse(JSON.stringify(base)));
  const found = problems(name, raw, n);
  for (const f of found) fail(f.m, raw, f.e);
  if (found.length && !shrunk) {
    shrunk = true;
    const r = shrink(name, base, raw, found[0].m);
    if (r.units) console.log(`   smallest damage that still fails (${r.units.length} change(s) from the undamaged "${name}"):\n` + r.units.map(p => `     ${p.join('.')} = ${JSON.stringify(at(raw, p))?.slice(0, 80)}`).join('\n'));
    else console.log('   (could not cut the damage down: it needs the story as a whole)');
  }
}
console.log(bad ? `FUZZ3 FAILED: ${bad} problems in ${N} mutated stories` : `FUZZ3 OK: ${N} mutated stories loaded, checked, exported, simulated and drew without a problem`);
process.exit(bad ? 1 : 0);
