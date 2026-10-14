/* ============================================================================
   PINNED ROUTES (editor only; not part of any game or package)
   ----------------------------------------------------------------------------
   A route is the pages a tester passed through in the Play tab:
     { start, flags0, answers, steps: [{ id, name }] }
       start    the page the run began on          flags0   what the tester held on arrival ("Test from here"), or null
       answers  { givenId: answerId } for the questions asked before page one
       steps    every page reached, the first one included (the name is kept so a deleted page can still be named)
   routeReplay() walks a route again with the game's own rules (klChoose, klArrive) on the story as it is now, and stops at the first
   step that no longer works, saying why in plain words. The Play tab uses it to put you back where you were after you edited the story;
   the Check tab uses it to say how many pinned routes still work. Routes are kept in this browser, not in the story file.
   Copyright (c) 2026 JNFoo. MIT License.
   ============================================================================ */

const ROUTE_KEY = 'story-editor-v1-routes';
const ROUTE_MAX_STEPS = 400;
const ROUTE_MAX_PINNED = 12;

function routeStoreRead() {
  try {
    const v = JSON.parse(localStorage.getItem(ROUTE_KEY));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) {
    return {};
  }
}

/** A route read back from storage, or null if it is not usable (anything stored is checked, never trusted). */
function routeClean(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.steps)) return null;
  const steps = r.steps
    .filter(s => s && typeof s.id === 'string')
    .slice(0, ROUTE_MAX_STEPS)
    .map(s => ({ id: s.id, name: String(s.name || '').slice(0, 80) }));
  if (!steps.length) return null;
  const flags0 = r.flags0 && typeof r.flags0 === 'object' && !Array.isArray(r.flags0) ? r.flags0 : null;
  const answers = r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers) ? r.answers : {};
  return { start: steps[0].id, flags0, answers, steps };
}

/** This story's saved routes: { last: route | null, pinned: [{ name, route }] }. */
function routesFor(id) {
  const e = routeStoreRead()[id] || {};
  return {
    last: routeClean(e.last),
    pinned: (Array.isArray(e.pinned) ? e.pinned : [])
      .map(p => ({ name: String((p && p.name) || 'Route').slice(0, 60), route: routeClean(p && p.route) }))
      .filter(p => p.route)
      .slice(0, ROUTE_MAX_PINNED)
  };
}

function routesSave(id, data) {
  try {
    const all = routeStoreRead();
    all[id] = { last: data.last, pinned: data.pinned };
    const keys = Object.keys(all);
    if (keys.length > 30) delete all[keys[0]]; // only the most recent stories are kept
    localStorage.setItem(ROUTE_KEY, JSON.stringify(all));
  } catch (e) {
    /* storage off or full: routes last until the page closes (the Play tab still shows the current one) */
  }
}

/**
 * Walks `route` again on the story as it is now.
 * Returns { done, total, at, flags, problem }: `done` = how many steps worked (counting the first page), `at` = the last page reached,
 * `flags` = what the tester holds there, `problem` = null if every step worked, otherwise { text } saying which step failed and why.
 */
function routeReplay(proj, route) {
  const story = exportStory(proj);
  const byPage = Object.create(null);
  story.passages.forEach(p => (byPage[p.id] = p));
  const st = klStatMap(story.items);
  const total = route.steps.length;
  const first = byPage[route.start];
  if (!first) return { done: 0, total, at: null, flags: {}, problem: { text: `The page where this route began, “${route.steps[0].name}”, is gone.` } };
  let flags;
  if (route.flags0) flags = Object.assign({}, route.flags0);
  else {
    flags = klInit({}, st);
    (story.givens || []).forEach(g => {
      if (!g.options || !g.options.length) return;
      const a = g.options.includes(route.answers[g.id]) ? route.answers[g.id] : g.options[0];
      flags[a] = true;
    });
    flags = klArrive(flags, first, st);
  }
  const nameOf = id => (story.items.find(i => i.id === id) || {}).name || 'something';
  const missing = (c, f) => {
    const need = (c.needs || []).filter(id => !klHas(f, id)).map(id => (id.indexOf('t:') === 0 ? nameOf(parseStatTest(id).stat) + ' high enough' : nameOf(id)));
    const bar = (c.forbid || []).filter(id => klHas(f, id)).map(id => nameOf(id));
    return [need.length ? `needs ${joinAnd(need)}` : '', bar.length ? `is closed to anyone who has ${joinAnd(bar)}` : ''].filter(Boolean).join(' and ');
  };
  let cur = first;
  for (let i = 1; i < total; i++) {
    const want = route.steps[i];
    const next = byPage[want.id];
    const from = route.steps[i - 1].name || cur.id;
    if (!next) return { done: i, total, at: cur.id, flags, problem: { text: `Step ${i + 1}: the page “${want.name}” is gone, so the route stops at “${from}”.` } };
    const leads = (cur.choices || []).filter(c => c.to === next.id || (c.check && c.check.fail === next.id));
    if (!leads.length) return { done: i, total, at: cur.id, flags, problem: { text: `Step ${i + 1}: “${from}” no longer has a choice that leads to “${want.name}”.` } };
    const usable = leads.find(c => klCondOk(c, flags));
    if (!usable) {
      const c = leads[0];
      return { done: i, total, at: cur.id, flags, problem: { text: `Step ${i + 1}: the choice “${c.label || 'untitled'}” on “${from}” now ${missing(c, flags) || 'cannot be picked'}, so the route cannot reach “${want.name}”.` } };
    }
    flags = klArrive(klChoose(flags, usable, st), next, st);
    cur = next;
  }
  return { done: total, total, at: cur.id, flags, problem: null };
}

/** True when a page just reached in the Play tab is a step back (the player's Back button) rather than a new step. */
function routeIsBack(steps, pid, proj) {
  if (steps.length < 2 || steps[steps.length - 2].id !== pid) return false;
  const cur = proj.passages.find(p => p.id === steps[steps.length - 1].id);
  return !cur || !cur.choices.some(c => c.to === pid || (c.check && c.check.fail === pid));
}

/** One line for a route: "Wake › Hall › Cave" (long routes keep the first page and the last three). */
function routeLine(route) {
  const n = route.steps.map(s => s.name || '?');
  return n.length <= 5 ? n.join(' › ') : `${n[0]} › … › ${n.slice(-3).join(' › ')}`;
}
