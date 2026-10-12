/* ============================================================================
   THE CONTRACT TEST  (run by build.py on every build; a failure stops the build)
   ----------------------------------------------------------------------------
   The editor, the game rules and the checker are one system. This test keeps them from drifting apart:

     1. Every field of the story model is listed in FIELD_CONTRACT (core.js) as "rules" or "display".
        A field nobody classified fails the build.
     2. Every "rules" field is really read by analyze(), and kept by exportStory().
        (The checker is watched through a recording proxy while it checks hundreds of random stories.)
     3. The checker agrees with the real game. For hundreds of random stories using every feature (items, states,
        Givens, hand-overs, numbers, skill checks with all eleven dice results, locked choices) every situation is
        played out by brute force with the same kl* functions an exported game carries. The reachable pages, endings,
        stuck pages, usable choices, possible roll outcomes and the number of situations must match exactly.
     4. Every kl* function the game uses is in KL_RULES (so it is copied into exports), and nothing else is needed.
     5. Every color palette is readable (WCAG AA contrast, 4.5 to 1).
   Usage:  node contract.mjs [stories=300] [seed=1]     Exit code 1 and a plain message on any failure.
   ============================================================================ */
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { createContext, runInContext } from 'node:vm';
import { transformSync } from 'esbuild';

const here = new URL('.', import.meta.url);
const read = f => readFileSync(new URL(f, here), 'utf8');
/* an exception while playing stories means a rule used something an exported game does not have */
process.on('uncaughtException', e => {
  console.error('CONTRACT TEST FAILED (1):\n - Playing a story with the rules exactly as an exported game carries them crashed: ' + e.message + '\n   (a rule function probably uses something that is not in KL_RULES; add it there)');
  process.exit(1);
});
const N = Number(process.argv[2] || 300);
let seed = Number(process.argv[3] || 1);

const ctx = createContext({ console, TextDecoder });
runInContext(
  `${read('core.js')}\n${read('player.js')}\nthis.C = { zipInflate, zippedPage, analyze, analyzeStructure, STARTERS, normalizeProject, exportStory, makeProject, makeItem, makePassage, makeChoice, makeBlock, cleanGame,
  FIELD_CONTRACT, KL_RULES, PALETTES, PALETTE_KEYS, GAME_DEFAULTS, GAME_OPTIONS, paletteCss, klHas, klCondOk, klVisibleBlocks, klStatMap, klInit, klAdd, klChoose, klVisibleChoices,
  klShown, klArrive, klTarget, klOdds, klPlayer, klShortIds, klFingerprint, KL_FEATURE_ORDER, KL_FEATS, klFeatures, gameCss,
  modules: KL_FEATURE_ORDER.map(n => [n, eval('klFeat' + n[0].toUpperCase() + n.slice(1))]) };`,
  ctx
);
const C = ctx.C;
const failures = [];
const fail = msg => failures.push(msg);

/* The play-out below must use the rules exactly as an exported game carries them: only the KL_RULES functions' own text, in a context that
   has nothing else (no core.js helpers, no constants). If a rule calls something that is not in KL_RULES, the call fails right here with
   "is not defined" instead of passing because core.js happens to have it. (Found Oct 2026: the old name scan below could not see a helper
   whose name does not start with "kl".) */
{
  const iso = createContext({});
  try {
    runInContext(
      'const KL_FEATS={};\n' + C.KL_RULES.map(n => C[n].toString()).join('\n') + '\n' + C.klPlayer.toString() +
        '\nthis.R = {' + C.KL_RULES.join(',') + '};',
      iso
    );
    C.KL_RULES.forEach(n => {
      C[n] = iso.R[n];
    });
  } catch (e) {
    console.error('CONTRACT TEST FAILED (1):\n - The rule functions cannot even be loaded the way an exported game loads them: ' + e.message);
    process.exit(1);
  }
}

/* ---------- a small seeded random generator ---------- */
const rnd = () => {
  seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

/* ---------- random stories using every feature ---------- */
function gen(opts = {}) {
  const nP = int(3, 9);
  const nO = opts.huge ? int(12, 16) : int(0, 3);
  const nS = opts.huge ? int(12, 16) : int(0, 3);
  const nT = opts.huge ? 3 : int(0, 2);
  const items = [];
  for (let i = 0; i < nO; i++) items.push({ id: `o${i}`, name: `O${i}`, kind: 'object', show: true });
  for (let i = 0; i < nS; i++) items.push({ id: `s${i}`, name: `S${i}`, kind: 'state', show: true });
  for (let i = 0; i < nT; i++) {
    const lo = int(-2, 2);
    const hi = lo + int(2, opts.wide ? 12 : 6);
    items.push({ id: `t${i}`, name: `T${i}`, kind: 'stat', show: true, lo, hi, start: int(lo, hi) });
  }
  const states = items.filter(i => i.kind === 'state');
  const givens = [];
  if (states.length >= 2 && rnd() < 0.4) {
    givens.push({ id: 'g0', question: 'Q', options: [states[0].id, states[1].id] });
  }
  const answer = new Set(givens.flatMap(g => g.options));
  const real = items.filter(i => i.kind !== 'stat' && !answer.has(i.id)).map(i => i.id);
  const stats = items.filter(i => i.kind === 'stat');
  const pages = [...Array(nP)].map((_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    ending: i > 0 && rnd() < 0.25,
    valence: pick(['good', 'bad', '']),
    blocks: [{ text: 'x', needs: [], forbid: [] }],
    gives: [],
    takes: [],
    adds: {},
    sends: {},
    choices: []
  }));
  const condId = () => {
    const r = rnd();
    if (stats.length && r < 0.35) {
      const t = pick(stats);
      return `t:${t.id}:${int(t.lo - 1, t.hi + 2)}`;
    }
    return pick(
      items
        .filter(i => i.kind !== 'stat')
        .map(i => i.id)
        .concat(['x'])
        .filter(x => x !== 'x')
    );
  };
  const hasCond = items.some(i => i.kind !== 'stat') || stats.length;
  pages.forEach(p => {
    /* paragraphs, some shown only under a condition, some an "otherwise" to the one above */
    for (let b = int(0, 2); b > 0; b--)
      p.blocks.push({
        text: 'y',
        needs: hasCond && rnd() < 0.5 ? [condId()] : [],
        forbid: hasCond && rnd() < 0.3 ? [condId()] : [],
        orPrev: rnd() < 0.3
      });
    if (real.length && rnd() < 0.4) p.gives = [pick(real)];
    if (real.length && rnd() < 0.3) p.takes = [pick(real)];
    p.takes.forEach(id => {
      if (items.find(i => i.id === id).kind === 'object' && rnd() < 0.5) p.sends[id] = pick(['here', 'w:Bob', 'w:']);
    });
    if (stats.length && rnd() < 0.3) p.adds[pick(stats).id] = int(-3, 3);
    if (!p.ending) {
      const n = int(1, 3);
      for (let k = 0; k < n; k++) {
        const to = pick(pages).id;
        const c = { label: `c${p.id}_${k}`, to, needs: [], forbid: [], gives: [], takes: [], adds: {}, check: null, lock: rnd() < 0.2, why: '' };
        if (hasCond && rnd() < 0.4) c.needs = [condId()];
        if (hasCond && rnd() < 0.2) c.forbid = [condId()];
        if (real.length && rnd() < 0.2) c.gives = [pick(real)];
        if (real.length && rnd() < 0.2) c.takes = [pick(real)];
        if (stats.length && rnd() < 0.2) c.adds[pick(stats).id] = int(-3, 3);
        if (stats.length && rnd() < 0.3) c.check = { stat: pick(stats).id, target: int(-1, 17), fail: pick(pages.filter(q => q.id !== to)).id };
        p.choices.push(c);
      }
    }
  });
  /* conditions on "where it went" records, sometimes */
  pages.forEach(p =>
    p.takes.forEach(id => {
      const d = p.sends[id];
      if (d === 'here' || d === 'w:Bob') {
        const q = pick(pages);
        if (q.choices.length && rnd() < 0.5) q.choices[0].needs.push(`m:${id}:${d === 'here' ? `p:${p.id}` : 'w:Bob'}`);
      }
    })
  );
  const raw = { id: 's', title: 't', start: 'p0', items, givens, passages: pages, game: { back: 'block', tracker: true, pal: 'night' } };
  return C.normalizeProject(raw);
}

/* ---------- 1 and 2: the field contract ---------- */
const reads = new Set();
const CHILD = {
  'project.items': 'item',
  'project.givens': 'given',
  'project.passages': 'passage',
  'passage.blocks': 'block',
  'passage.choices': 'choice',
  'choice.check': 'check',
  'project.game': 'game'
};
function watch(obj, type) {
  if (!obj || typeof obj !== 'object') return obj;
  return new Proxy(obj, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      if (typeof k !== 'string') return v;
      if (!Array.isArray(t)) reads.add(`${type}.${k}`);
      const child = CHILD[`${type}.${k}`];
      if (!child) return v;
      return Array.isArray(v)
        ? new Proxy(v, { get: (a, i, rr) => (/^\d+$/.test(String(i)) ? watch(a[i], child) : Reflect.get(a, i, rr)) })
        : watch(v, child);
    }
  });
}
/** Every key an object of each kind actually has, after normalizing. */
const seenKeys = {};
function collectKeys(p) {
  const add = (type, o) => {
    if (!o) return;
    seenKeys[type] ||= new Set();
    Object.keys(o).forEach(k => seenKeys[type].add(k));
  };
  add('project', p);
  add('game', p.game);
  p.items.forEach(i => add('item', i));
  p.givens.forEach(g => add('given', g));
  p.passages.forEach(q => {
    add('passage', q);
    q.blocks.forEach(b => add('block', b));
    q.choices.forEach(c => {
      add('choice', c);
      add('check', c.check);
    });
  });
}

/* ---------- 3: play the story out by brute force, with the game's own rules ---------- */
function brute(P, E = C.exportStory(P)) {
  const byId = {};
  E.passages.forEach(p => (byId[p.id] = p));
  const st = C.klStatMap(E.items);
  const statIds = Object.keys(st);
  const readM = new Set();
  E.passages.forEach(p =>
    (p.blocks || []).concat(p.choices || []).forEach(c => (c.needs || []).concat(c.forbid || []).forEach(id => id.startsWith('m:') && readM.add(id)))
  );
  const canon = (pid, f) => {
    const keys = Object.keys(f)
      .filter(k => f[k] && !k.startsWith('v:') && (!k.startsWith('m:') || readM.has(k)))
      .sort();
    return `${pid}|${keys.join(',')}|${statIds.map(id => f[`v:${id}`] || 0).join(',')}`;
  };
  let combos = [{}];
  (E.givens || []).forEach(g => {
    const n = [];
    combos.forEach(cb => g.options.forEach(o => n.push({ ...cb, [o]: true })));
    combos = n;
  });
  const seen = new Set();
  const q = [];
  const reached = new Set();
  const endings = new Set();
  const stuck = new Set();
  const usable = new Set(); // `${pid}:${label}`
  const roll = new Map(); // `${pid}:${label}` -> bit 1 can succeed, bit 2 can fail
  const push = (pid, f) => {
    const k = canon(pid, f);
    if (!seen.has(k)) {
      seen.add(k);
      q.push([pid, f]);
    }
  };
  combos.forEach(cb => push(E.start, C.klArrive(C.klInit({ ...cb }, st), byId[E.start], st)));
  while (q.length) {
    const [pid, f] = q.shift();
    reached.add(pid);
    const p = byId[pid];
    if (p.ending) {
      endings.add(pid);
      continue;
    }
    const ch = C.klVisibleChoices(p, f);
    if (!ch.length) stuck.add(pid);
    ch.forEach(c => {
      usable.add(`${pid}:${c.label}`);
      const rolls = c.check ? [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [0];
      rolls.forEach(r => {
        const dest = C.klTarget(f, c, r);
        if (c.check) roll.set(`${pid}:${c.label}`, (roll.get(`${pid}:${c.label}`) || 0) | (dest === c.to ? 1 : 2));
        if (byId[dest]) push(dest, C.klArrive(C.klChoose(f, c, st), byId[dest], st));
      });
    });
  }
  const shapes = new Set([...seen].map(k => k.split('|').slice(0, 2).join('|'))).size; // different (page, things held), ignoring numbers
  return { reached, endings, stuck, usable, roll, states: seen.size, shapes };
}

/* The pages reached, endings, stuck pages and choices that never appear or whose roll cannot fail / succeed, as an analyze() result reports them. */
function verdictsOf(a, P) {
  const unreached = new Set(a.problems.filter(x => /can never be reached|so nobody can reach it/.test(x.msg)).map(x => x.pid));
  const out = {
    reached: new Set(P.passages.map(p => p.id).filter(id => !unreached.has(id))),
    endings: new Set(a.endings.filter(e => e.reachable).map(e => e.pid)),
    stuck: new Set(a.problems.filter(x => /^Players can get stuck on/.test(x.msg)).map(x => x.pid)),
    never: new Set(),
    neverFail: new Set(),
    neverWin: new Set()
  };
  a.warnings.forEach(w => {
    let m = /^The choice “([^”]*)” on “([^”]*)” (never appears|is greyed out for every player)/.exec(w.msg);
    if (m) out.never.add(`${w.pid}:${m[1]}`);
    m = /^The skill check “([^”]*)” on “([^”]*)” can never (fail|succeed)/.exec(w.msg);
    if (m) (m[3] === 'fail' ? out.neverFail : out.neverWin).add(`${w.pid}:${m[1]}`);
  });
  return out;
}
let prunedStories = 0;
let prunedSaved = 0;
let compared = 0;
let groupedStories = 0;
let truncatedSkips = 0;
for (let t = 0; t < N; t++) {
  const P = gen({ wide: t % 25 === 0, huge: t % 50 === 7 });
  collectKeys(P);
  const a = C.analyze(watch(P, 'project'));
  C.exportStory(P);
  if (a.truncated) {
    truncatedSkips++;
    continue;
  }
  const b = brute(P);
  compared++;
  /* the story with every id shortened (what an exported game carries) must play out exactly the same */
  {
    const E = C.exportStory(P);
    const short = C.klShortIds(E);
    const b2 = brute(P, short);
    const at = Object.fromEntries(E.passages.map((p, i) => [p.id, i]));
    const ix = id => at[id];
    const jx = id => parseInt(id, 36);
    const setOf = (s, f) => [...s].map(f).sort((x, y) => x - y).join();
    const keyOf = (k, f) => `${f(k.slice(0, k.indexOf(':')))}${k.slice(k.indexOf(':'))}`;
    const listOf = (s, f) => [...s].map(k => keyOf(k, f)).sort().join('|');
    const rollOf = (m, f) => [...m].map(([k, v]) => `${keyOf(k, f)}=${v}`).sort().join('|');
    if (
      setOf(b.reached, ix) !== setOf(b2.reached, jx) ||
      setOf(b.endings, ix) !== setOf(b2.endings, jx) ||
      setOf(b.stuck, ix) !== setOf(b2.stuck, jx) ||
      listOf(b.usable, ix) !== listOf(b2.usable, jx) ||
      rollOf(b.roll, ix) !== rollOf(b2.roll, jx) ||
      b.states !== b2.states
    )
      fail(`The story with shortened ids (klShortIds) plays differently from the original. story ${t}: ${JSON.stringify(P)}`);
    if (JSON.stringify(short).length > JSON.stringify(E).length) fail(`Shortening ids made story ${t} bigger.`);
  }
  const name = pid => P.passages.find(p => p.id === pid)?.name;
  const unreached = new Set(a.problems.filter(x => /can never be reached|so nobody can reach it/.test(x.msg)).map(x => x.pid));
  const stuckA = new Set(a.problems.filter(x => /^Players can get stuck on/.test(x.msg)).map(x => x.pid));
  const endA = new Set(a.endings.filter(e => e.reachable).map(e => e.pid));
  const never = new Set();
  const neverFail = new Set();
  const neverWin = new Set();
  a.warnings.forEach(w => {
    let m = /^The choice “([^”]*)” on “([^”]*)” (never appears|is greyed out for every player)/.exec(w.msg);
    if (m) never.add(`${w.pid}:${m[1]}`);
    m = /^The skill check “([^”]*)” on “([^”]*)” can never (fail|succeed)/.exec(w.msg);
    if (m) (m[3] === 'fail' ? neverFail : neverWin).add(`${w.pid}:${m[1]}`);
  });
  const ctxMsg = () => `story ${t}: ${JSON.stringify(P)}`;
  const diff = (what, x, y) => fail(`${what} differ (checker ${JSON.stringify([...x])} vs the game ${JSON.stringify([...y])}). ${ctxMsg()}`);
  const same = (x, y) => x.size === y.size && [...x].every(v => y.has(v));
  const reachedA = new Set(P.passages.map(p => p.id).filter(id => !unreached.has(id)));
  if (!same(reachedA, b.reached)) diff('Reachable pages', reachedA, b.reached);
  if (!same(endA, b.endings)) diff('Reachable endings', endA, b.endings);
  if (!same(stuckA, b.stuck)) diff('Stuck pages', stuckA, b.stuck);
  /* situations: exactly equal when no number's values were grouped; otherwise the checker keeps fewer, never more, and at least
     one for every different (page, things held) the game reaches */
  if (!a.grouped && a.states !== b.states) fail(`Situation counts differ (checker ${a.states} vs the game ${b.states}). ${ctxMsg()}`);
  if (a.grouped && (a.states > b.states || a.states < b.shapes)) fail(`Grouped situation count ${a.states} is outside ${b.shapes} to ${b.states}. ${ctxMsg()}`);
  groupedStories += a.grouped ? 1 : 0;
  /* dead numbers forgotten (analyze with prune): the same verdicts as the game, never more situations, and its explanations still work */
  {
    const a2 = C.analyze(P, 200000, { prune: true });
    if (a2.truncated) fail(`The pruned check stopped early on a story the full check finished. ${ctxMsg()}`);
    const v2 = verdictsOf(a2, P);
    const v1 = verdictsOf(a, P);
    ['reached', 'endings', 'stuck', 'never', 'neverFail', 'neverWin'].forEach(k => {
      if (!same(v1[k], v2[k])) diff(`Pruned check: ${k}`, v1[k], v2[k]);
    });
    /* every warning and note the author would read is the same too (paragraphs that never show, items given for nothing, ...) */
    const say = (list, strip) => list.map(x => (strip ? x.msg.replace(/^(Players can get stuck on [^]*?) when [^]*?: none of its choices are available\./, '$1.') : x.msg)).sort().join('\n');
    if (say(a.warnings) !== say(a2.warnings)) fail(`Pruned check: the warnings differ. ${ctxMsg()}`);
    if (say(a.notes || []) !== say(a2.notes || [])) fail(`Pruned check: the notes differ. ${ctxMsg()}`);
    if (say(a.problems, true) !== say(a2.problems, true)) fail(`Pruned check: the problems differ. ${ctxMsg()}`);
    if (a2.states > a.states) fail(`The pruned check kept MORE situations (${a2.states} vs ${a.states}). ${ctxMsg()}`);
    if (a2.states < a.states) prunedStories++;
    prunedSaved += a.states - a2.states;
    a.endings.forEach((e, i) => {
      if (e.reachable !== a2.endings[i].reachable) fail(`Pruned check: ending ${e.pid} reachability differs. ${ctxMsg()}`);
      if (e.reachable) {
        const x = a2.explain(e.pid);
        if (!x) fail(`Pruned check: the ending explorer has no answer for ending ${e.pid}. ${ctxMsg()}`);
      }
    });
    if (t % 3 === 0)
      P.passages
        .filter(p => b.reached.has(p.id))
        .slice(0, 4)
        .forEach(pg => {
          const ss = a2.samples(pg.id);
          if (!ss.length) fail(`Pruned check: no way to arrive on reachable page ${pg.id}. ${ctxMsg()}`);
          ss.forEach(sm => {
            if (a2.canArrive(pg.id, sm.flags) !== true) fail(`Pruned check: canArrive rejects its own sample for ${pg.id}. ${ctxMsg()}`);
          });
        });
  }
  /* every choice on a reached page: usable somewhere in the game exactly when the checker does not warn it never appears */
  const neverB = new Set();
  const failB = new Set();
  const winB = new Set();
  P.passages.forEach(p => {
    if (!b.reached.has(p.id) || p.ending) return;
    p.choices.forEach(c => {
      if (!c.to) return;
      const key = `${p.id}:${c.label}`;
      if (!b.usable.has(key)) neverB.add(key);
      else if (c.check) {
        const r = b.roll.get(key) || 0;
        if (r === 1) failB.add(key);
        if (r === 2) winB.add(key);
      }
    });
  });
  if (!same(never, neverB)) diff('Choices that never appear', never, neverB);
  if (!same(neverFail, failB)) diff('Checks that can never fail', neverFail, failB);
  if (!same(neverWin, winB)) diff('Checks that can never succeed', neverWin, winB);
  void name;
  /* "Test from here" and the ending explorer: each offered way of arriving must really happen when its route is replayed */
  if (t % 3 === 0) {
    const E = C.exportStory(P);
    const byId = {};
    E.passages.forEach(p => (byId[p.id] = p));
    const st = C.klStatMap(E.items);
    const pagesToTry = P.passages.filter(p => b.reached.has(p.id)).slice(0, 4);
    pagesToTry.forEach(pg => {
      (a.samples(pg.id) || []).forEach(sm => {
        let f = C.klInit({}, st);
        let page = null;
        let ok = true;
        sm.path.forEach(step => {
          if (!ok) return;
          if (step.given) {
            const g = P.givens.find(x => x.question === step.question);
            const id = g && g.options.find(o => P.items.find(i => i.id === o).name === step.label);
            f[id] = true;
            return;
          }
          if (!page) ((page = byId[E.start]), (f = C.klArrive(f, page, st)));
          const failed = / \(fails the roll\)$/.test(step.label);
          const label = step.label.replace(/ \(fails the roll\)$/, '');
          const c = C.klVisibleChoices(page, f).find(x => x.label === label);
          if (!c) return void (ok = false);
          const dest = C.klTarget(f, c, failed ? 2 : 12);
          f = C.klArrive(C.klChoose(f, c, st), byId[dest], st);
          page = byId[dest];
        });
        if (!page) ((page = byId[E.start]), (f = C.klArrive(f, page, st)));
        const key = o =>
          Object.keys(o)
            .filter(k => o[k] && !k.startsWith('m:'))
            .sort()
            .map(k => `${k}=${o[k]}`)
            .join(',');
        if (a.canArrive(pg.id, sm.flags) === false) fail(`canArrive says a offered “Test from here” sample for ${pg.id} is impossible. ${ctxMsg()}`);
        if (!ok || page.id !== pg.id || key(f) !== key(sm.flags))
          fail(`A “Test from here” sample for page ${pg.id} does not replay (${JSON.stringify(sm)} vs ${JSON.stringify(f)}). ${ctxMsg()}`);
      });
    });
    P.passages
      .filter(p => p.ending && b.endings.has(p.id))
      .forEach(e => {
        const x = a.explain(e.id);
        if (!x || x.situations < 1) fail(`explain() gave nothing for a reachable ending ${e.id}. ${ctxMsg()}`);
      });
  }
  if (failures.length > 5) break;
}

/* 1: unclassified fields; 2: fields the checker never reads, or the export drops */
Object.keys(seenKeys).forEach(type => {
  const c = C.FIELD_CONTRACT[type];
  if (!c) return fail(`Objects of kind “${type}” are not listed in FIELD_CONTRACT (core.js).`);
  seenKeys[type].forEach(k => {
    if (!c.rules.includes(k) && !c.display.includes(k))
      fail(
        `The field “${type}.${k}” is not listed in FIELD_CONTRACT (core.js). List it under “rules” if it can change what a player sees or where they can go ` +
          `(then analyze() must use it), or under “display” if it is only words or looks.`
      );
  });
});
Object.keys(C.FIELD_CONTRACT).forEach(type => {
  C.FIELD_CONTRACT[type].rules.forEach(k => {
    if (!reads.has(`${type}.${k}`))
      fail(`The checker (analyze) never reads “${type}.${k}”, which FIELD_CONTRACT says can change how the game plays. Teach analyze() about it.`);
  });
});
{
  /* the export must keep every rules field (shown across many random stories) */
  const exported = {};
  const walk = (type, o) => {
    if (!o || typeof o !== 'object') return;
    exported[type] ||= new Set();
    Object.keys(o).forEach(k => exported[type].add(k));
  };
  for (let t = 0; t < 60; t++) {
    const E = C.exportStory(gen());
    walk('project', E);
    walk('game', E.game);
    E.items.forEach(i => walk('item', i));
    E.givens.forEach(g => walk('given', g));
    E.passages.forEach(p => {
      walk('passage', p);
      p.blocks.forEach(b => walk('block', b));
      (p.choices || []).forEach(c => {
        walk('choice', c);
        walk('check', c.check);
      });
    });
  }
  Object.keys(C.FIELD_CONTRACT).forEach(type =>
    C.FIELD_CONTRACT[type].rules.forEach(k => {
      if (type !== 'game' && !(exported[type] && exported[type].has(k)))
        fail(`exportStory never keeps “${type}.${k}”, but it can change how the game plays.`);
    })
  );
}

/* The tests below recognise some of the checker's messages by their wording. If core.js rewords one, a pattern would silently match
   nothing and the comparison would test nothing; so each phrase must still be in core.js. */
{
  const coreText = read('core.js');
  ['can never be reached', 'so nobody can reach it', 'Players can get stuck on', '(fails the roll)'].forEach(phrase => {
    if (!coreText.includes(phrase)) fail(`contract.mjs looks for the checker message “${phrase}”, which core.js no longer contains. Change both together.`);
  });
}

/* 7: zipped pages. The little unzipping script that a zipped page carries is run here, without a browser, on pages squeezed by zlib at every
      level (stored, fixed and dynamic blocks), and must give back exactly the text it was given. */
{
  const texts = ['', 'x', 'a'.repeat(70000), 'héllo wörld → ✓ “quoted” '.repeat(300), read('core.js').slice(0, 60000), read('game.css')];
  let cases = 0;
  for (const t of texts)
    for (const level of [0, 1, 6, 9]) {
      const packed = deflateRawSync(Buffer.from(t), { level });
      if (C.zipInflate(new Uint8Array(packed)) !== t) fail(`The built-in unzipper (zipInflate in core.js) gives back different text for a ${t.length}-character page packed at level ${level}.`);
      cases++;
    }
  const sample = texts[3], b64 = deflateRawSync(Buffer.from(sample), { level: 9 }).toString('base64');
  const page = C.zippedPage(b64, 'A &amp; B');
  const zEl = /<script type="text\/plain" id="z">\n([\s\S]*?)<\/script>/.exec(page), boot = /<script>([\s\S]*)<\/script>\n$/.exec(page);
  if (!zEl || !boot) fail('A zipped page does not have the shape zippedPage promises (its zipped block and its script).');
  else {
    let written = null;
    const doc = { open() {}, close() {}, write: t => (written = t), getElementById: id => ({ textContent: id === 'z' ? zEl[1] : '' }) };
    try {
      runInContext(boot[1], createContext({ document: doc, window: {}, atob: s => Buffer.from(s, 'base64').toString('latin1'), Uint8Array, TextDecoder, Response: undefined }));
    } catch (e) {
      fail('The script of a zipped page crashed when run: ' + e.message);
    }
    if (written !== sample) fail('A zipped page, opened by its own script (the version for browsers without DecompressionStream), did not show the original page.');
    if (/<\/script/i.test(zEl[1]) || (boot[1].match(/<\/script/gi) || []).length) fail('A zipped page contains text that would end its own script tag early.');
    if (!page.includes('<title>A &amp; B</title>')) fail('A zipped page does not carry the title it was given.');
  }
  if (!cases) fail('No zip cases ran.');
}

/* 4: the rule functions an exported game carries are complete */
{
  const names = new Set(C.KL_RULES);
  const src = C.KL_RULES.map(n => C[n]?.toString() || '')
    .concat(C.klPlayer.toString())
    .concat(C.modules.map(([, f]) => f.toString()));
  C.KL_RULES.forEach(n => typeof C[n] !== 'function' && fail(`KL_RULES lists “${n}”, which is not a function in core.js.`));
  /* comments are removed first: a comment that mentions a function (even one that is gone) is not a use of it */
  const withoutComments = s => {
    try {
      return transformSync(s, { legalComments: 'none' }).code;
    } catch (e) {
      return s; // a piece that does not parse on its own is scanned as it is
    }
  };
  src.map(withoutComments).join('\n').replace(/\bkl[A-Z]\w*/g, m => {
    if (!names.has(m) && m !== 'klPlayer' && !/^klFeat[A-Z]/.test(m))
      fail(`The game uses “${m}”, which is not in KL_RULES, so exported games would not have it.`);
    return m;
  });
}

/* starting points: each must be a finished story the checker is happy with, of the shape it claims */
C.STARTERS.forEach(sp => {
  const P = C.normalizeProject(JSON.parse(JSON.stringify(sp.make())));
  const a = C.analyze(P);
  const bad = a.problems.concat(a.warnings, a.notes).map(x => x.msg);
  if (bad.length) fail(`The “${sp.name}” starting point has things to fix: ${bad.join(' | ')}`);
  const shape = C.analyzeStructure(P).label;
  if (sp.shape && shape !== sp.shape)
    fail(`The “${sp.name}” starting point is meant to be “${sp.shape}” but the structure detector calls it “${shape}”.`);
});

/* 5: every palette is readable */
{
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const pairs = [
    ['fg', 'paper'],
    ['muted', 'paper'],
    ['lamp', 'paper'],
    ['signal', 'paper'],
    ['good', 'paper'],
    ['signal', 'lampbg'],
    ['lamp', 'lampbg'],
    ['fg', 'bg']
  ];
  C.PALETTE_KEYS.forEach(k => {
    const pl = C.PALETTES[k];
    ['light', 'dark'].forEach(mode => {
      if (!pl[mode]) return;
      pairs.forEach(([x, y]) => {
        const r = ratio(pl[mode][x], pl[mode][y]);
        if (r < 4.5) fail(`The “${pl.name}” palette (${mode}) is hard to read: ${x} on ${y} is ${r.toFixed(2)} to 1; it needs 4.5 to 1.`);
      });
    });
  });
}

/* 6: lite exports. A game carries only the feature modules its story uses, so the list of modules, their code, their styles and the
      rule that picks them must all agree, and the rule must never leave out something a story needs. */
{
  const css = read('game.css');
  const parts = new Set([...css.matchAll(/\/\*@part (\w+)\*\//g)].map(m => m[1]));
  C.KL_FEATURE_ORDER.forEach(n => {
    const f = C.modules.find(m => m[0] === n)?.[1];
    if (typeof f !== 'function')
      return fail(`Feature “${n}” is in KL_FEATURE_ORDER but has no function klFeat${n[0].toUpperCase()}${n.slice(1)} in player.js.`);
    if (C.KL_FEATS[n] !== f) fail(`Feature “${n}” is not registered at the bottom of player.js (KL_FEATS.${n} = ...).`);
    if (n !== 'ask' && !parts.has(n)) fail(`Feature “${n}” has no styles: game.css needs a section that starts with /*@part ${n}*/.`);
  });
  Object.keys(C.KL_FEATS).forEach(
    n => !C.KL_FEATURE_ORDER.includes(n) && fail(`player.js registers “${n}”, which is not in KL_FEATURE_ORDER, so no game would carry it.`)
  );
  parts.forEach(n => n !== 'base' && !C.KL_FEATURE_ORDER.includes(n) && fail(`game.css has a section “${n}” that no feature uses.`));

  /* the GAME_OPTIONS table against the rest: every row is known to the contract, cleaned, exported, drawn and read by the game */
  {
    const keys = C.GAME_OPTIONS.map(o => o.key);
    if (new Set(keys).size !== keys.length) fail('GAME_OPTIONS lists the same option twice.');
    if (JSON.stringify(C.FIELD_CONTRACT.game.display) !== JSON.stringify(keys)) fail('FIELD_CONTRACT.game does not list the GAME_OPTIONS keys.');
    if (JSON.stringify(Object.keys(C.cleanGame({}))) !== JSON.stringify(keys)) fail('cleanGame() does not give exactly the GAME_OPTIONS keys.');
    const player = read('player.js');
    const ui = read('ui5-app.js');
    C.GAME_OPTIONS.forEach(o => {
      if (C.GAME_DEFAULTS[o.key] !== o.def) fail(`GAME_DEFAULTS.${o.key} is not the table's default.`);
      if (o.feature && !C.KL_FEATURE_ORDER.includes(o.feature)) fail(`Option “${o.key}” names the module “${o.feature}”, which is not in KL_FEATURE_ORDER.`);
      if (o.kind === 'flag' && (!o.label || !o.hint)) fail(`Option “${o.key}” is a check box with no label or hint.`);
      if (!new RegExp(`G\\.${o.key}\\b`).test(player)) fail(`player.js never reads the option “${o.key}” (P.G.${o.key} or G.${o.key}).`);
      if (o.kind === 'choice' && !new RegExp(`o\\.key === '${o.key}'`).test(ui)) fail(`The options box (ui5-app.js gameOptions) does not draw the choice “${o.key}”.`);
      /* an option set away from its default must survive cleaning and reach the export */
      const other = o.kind === 'flag' ? !o.def : o.key === 'back' ? 'block' : C.PALETTE_KEYS.find(k => k !== o.def);
      const P = C.normalizeProject(JSON.parse(JSON.stringify(C.STARTERS[0].make())));
      P.game = C.cleanGame({ [o.key]: other });
      if (P.game[o.key] !== other) fail(`cleanGame() lost the value of option “${o.key}”.`);
      if (C.exportStory(P).game?.[o.key] !== other) fail(`exportStory() dropped the option “${o.key}” when it differs from the default.`);
    });
  }

  /* the picking rule, checked a second way: what the story's own exported data says it needs */
  let checked = 0;
  const wants = (story, n) => {
    const text = JSON.stringify(story);
    const g = story.game || {};
    if (n === 'ask') return (story.givens || []).length > 0;
    if (n === 'dice') return /"check":\{/.test(text);
    if (n === 'locks') return /"lock":true/.test(text);
    if (n === 'bars') return (story.items || []).some(i => i.kind === 'stat' && i.show !== false);
    /* the reader options are read straight from the exported text, not through the GAME_OPTIONS table, so a wrong row shows up */
    if (n === 'back') return !!g.back && g.back !== 'off';
    if (n === 'tracker') return g.tracker === true;
    if (n === 'place') return g.place === true;
    if (n === 'comfort') return g.comfort !== false;
    return false;
  };
  const probe = P => {
    const story = C.exportStory(P);
    const has = new Set(C.klFeatures(story));
    C.KL_FEATURE_ORDER.forEach(n => {
      checked++;
      if (wants(story, n) && !has.has(n) && !(n === 'tracker' && !story.passages.some(p => p.ending)))
        fail(`A story that needs “${n}” would be exported without it. story: ${JSON.stringify(story).slice(0, 300)}`);
    });
  };
  C.STARTERS.forEach(sp => probe(C.normalizeProject(JSON.parse(JSON.stringify(sp.make())))));
  for (let i = 0; i < 150; i++) {
    const P = C.normalizeProject(gen());
    P.game = C.cleanGame(
      Object.fromEntries(C.GAME_OPTIONS.map(o => [o.key, o.kind === 'flag' ? rnd() < 0.5 : o.key === 'back' ? pick(['off', 'remember', 'reroll', 'block']) : pick(C.PALETTE_KEYS)]))
    );
    probe(P);
  }
  /* only the chosen color preset is carried, and the high-contrast one only with the Aa panel */
  const sample = C.gameCss({ base: '', ask: '', comfort: '' }, ['comfort'], { pal: 'night' });
  if (/sepia|ocean|forest/.test(sample) || !/cf-hc/.test(sample))
    fail('gameCss should carry the chosen palette (night) and the Aa high-contrast colors, and no other preset.');
  if (/cf-hc/.test(C.gameCss({ base: '' }, [], { pal: 'night' })))
    fail('gameCss should leave out the high-contrast colors when the Aa panel is not carried.');
}

/* 7: the fingerprint saved places are kept under: a new page changes it, fixing a typo does not */
{
  const P = C.normalizeProject(JSON.parse(JSON.stringify(C.STARTERS[0].make())));
  const a = C.klFingerprint(P);
  P.passages[0].blocks[0].text += ' (typo fixed)';
  if (C.klFingerprint(P) !== a) fail('Fixing the words of a page changed the story fingerprint, so everyone would lose their saved place.');
  P.passages.push(C.makePassage('Another'));
  if (C.klFingerprint(P) === a) fail('Adding a page did not change the story fingerprint, so an old save could land on the wrong page.');
}

if (failures.length) {
  console.error(`CONTRACT TEST FAILED (${failures.length}):\n - ${failures.slice(0, 8).join('\n - ')}`);
  process.exit(1);
}
console.log(
  `contract ok: ${compared} random stories played out in full and matched the checker (${truncatedSkips} too large to compare; numbers were grouped in ${groupedStories}; with dead numbers forgotten the verdicts were the same in all, and ${prunedStories} had fewer situations, ${prunedSaved} fewer in all), fields, rule list, feature modules and ${C.PALETTE_KEYS.length} palettes verified`
);
