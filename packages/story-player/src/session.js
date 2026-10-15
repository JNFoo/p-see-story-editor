/* A story you can play from code: no page, no browser. Uses the very rules the exported games use (the cut in generated.js),
   so what a session allows is exactly what a player would see.

     const s = createSession(project, { rng: Math.random, givens: { <givenId>: <answerItemId> } });
     s.text        the paragraphs the player sees on this page
     s.choices     [{ index, label, locked, why, odds }]  (locked ones are shown greyed out and cannot be picked)
     s.choose(0)   move on; returns { roll, passed } for a dice check, otherwise {}
     s.ended       true on an ending page

   Copyright (c) 2026 LFC Foundry. MIT License. */
import { klStatMap, klInit, klArrive, klChoose, klShown, klCondOk, klVisibleBlocks, klTarget, klOdds } from './generated.js';

export function createSession(project, opts = {}) {
  const rng = opts.rng || Math.random;
  const st = klStatMap(project.items);
  const byId = Object.create(null);
  project.passages.forEach(p => (byId[p.id] = p));
  const items = Object.create(null);
  project.items.forEach(i => (items[i.id] = i));

  /* Start-of-story questions (Givens): the answer given in opts.givens, else the first answer. Each answer becomes a state the player "has". */
  let flags = klInit({}, st);
  const answers = [];
  (project.givens || []).forEach(g => {
    const a = g.options.includes(opts.givens?.[g.id]) ? opts.givens[g.id] : g.options[0];
    flags[a] = true;
    answers.push({ question: g.question, answer: items[a] ? items[a].name : '' });
  });
  let page = byId[opts.from] || byId[project.start] || project.passages[0];
  flags = klArrive(flags, page, st);
  const trail = [];
  const die = () => Math.floor(rng() * 6) + 1;

  const api = {
    get page() {
      return page;
    },
    get text() {
      return klVisibleBlocks(page, flags).map(b => b.text);
    },
    get ended() {
      return !!page.ending;
    },
    get choices() {
      if (page.ending) return [];
      return klShown(page, flags).map((c, index) => ({
        index,
        label: c.label,
        locked: !klCondOk(c, flags),
        why: c.why || '',
        odds: c.check ? klOdds(flags, c.check) : null
      }));
    },
    /** Everything the player holds, by name: objects, states, and numbers (as name -> value). */
    get inventory() {
      const out = { things: [], numbers: {} };
      for (const k in flags) {
        if (!flags[k]) continue;
        if (k.startsWith('v:')) out.numbers[items[k.slice(2)]?.name ?? k.slice(2)] = flags[k];
        else if (!k.startsWith('m:') && items[k]) out.things.push(items[k].name);
      }
      return out;
    },
    get flags() {
      return flags;
    },
    get trail() {
      return trail.slice();
    },
    get answers() {
      return answers.slice();
    },
    choose(index) {
      if (page.ending) throw new Error('The story has ended.');
      const c = klShown(page, flags)[index];
      if (!c) throw new Error(`There is no choice number ${index} on this page.`);
      if (!klCondOk(c, flags)) throw new Error(`The choice "${c.label}" is locked${c.why ? `: ${c.why}` : ''}.`);
      const roll = c.check ? die() + die() : 0;
      const next = byId[klTarget(flags, c, roll)];
      if (!next) throw new Error(`The choice "${c.label}" leads nowhere. Run the checker on this story.`);
      const from = page;
      flags = klArrive(klChoose(flags, c, st), next, st);
      page = next;
      trail.push({ from: from.id, choice: c.label, to: next.id });
      return c.check ? { roll, passed: next.id === c.to } : {};
    }
  };
  return api;
}
