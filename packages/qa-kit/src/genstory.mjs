/* Random stories that use every feature: items, states, numbers, Givens (start-of-story questions), conditions on paragraphs and
   choices, hand-overs, dice checks and "where it went" records. Seeded, so seed N always gives the same story.

     import { makeGenStory } from './genstory.mjs';
     const genStory = makeGenStory(normalizeProject);   // normalizeProject comes from story-format (or story-check)
     const project = genStory(42);                      // a normalized project
     const big = genStory(7, { huge: true });           // many objects/states: stresses the checker
     const wide = genStory(8, { wide: true });          // wide number ranges

   Copyright (c) 2026 LFC Foundry. MIT License. */
export function makeGenStory(normalizeProject) {
  let seed = 1;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
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
    return normalizeProject(raw);
  }

  return function genStory(s, opts) {
    seed = s;
    return JSON.parse(JSON.stringify(gen(opts)));
  };
}
