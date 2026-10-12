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
for (let n = 0; n < N; n++) {
  const [name, base] = pick(bases); const raw = mutate(JSON.parse(JSON.stringify(base)));
  let P;
  try { P = C.normalizeProject(JSON.parse(JSON.stringify(raw))); } catch (e) { if (/not a story backup|not a story/i.test(e.message)) continue; fail(`${name} #${n}: normalizeProject threw`, raw, e); continue; }
  const ids = new Set(P.passages.map(p => p.id));
  if (!P.passages.length || ids.size !== P.passages.length || !ids.has(P.start)) { fail(`${name} #${n}: normalized story is not whole (pages ${P.passages.length}, unique ${ids.size}, start ${P.start})`, raw); continue; }
  if (P.passages.find(p => p.id === P.start).ending) fail(`${name} #${n}: start page is an ending after normalize`, raw);
  for (const p of P.passages) for (const c of p.choices) if (c.to && !ids.has(c.to)) { fail(`${name} #${n}: choice to a page that does not exist survived normalize`, raw); break; }
  const again = C.normalizeProject(JSON.parse(JSON.stringify(P)));
  if (JSON.stringify(again) !== JSON.stringify(P)) fail(`${name} #${n}: normalizeProject is not stable (running it twice changes the story)`, raw);
  for (const [what, f] of [['analyze', () => C.analyze(P)], ['exportStory', () => C.exportStory(P)], ['playtest', () => C.playtest(P, { runs: 20, mode: 'random' })],
    ['map', () => { const G = C.mapGraph(P, { fold: true, open: {}, merge: false }); G.nodes.forEach(x => { x.traffic = 0; x.choke = false; x.k = 1; x.w = C.MAP_W; x.h = C.MAP_H; }); return C.layered(G, { dir: 'LR', root: G.groupOf[P.start] }); }]]) {
    try { f(); } catch (e) { fail(`${name} #${n}: ${what} threw`, raw, e); }
  }
}
console.log(bad ? `FUZZ3 FAILED: ${bad} problems in ${N} mutated stories` : `FUZZ3 OK: ${N} mutated stories loaded, checked, exported, simulated and drew without a problem`);
process.exit(bad ? 1 : 0);
