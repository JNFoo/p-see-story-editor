/* ---------------------------------------------------------------------------
   3d-1. The Map
   ---------------------------------------------------------------------------
   Draws what maplayout.js computes. One slim toolbar on top; the rest of the
   screen is the map. Views:
     flow    left to right, layered            down    top-down tree, layered
     spine   choke points on one center line   lanes   one band per Given answer
     shape   the story's stretches between choke points, as beats
     river   simulated players flowing through the story (a Sankey diagram)
     arc     every page on one line, choices as arcs
     matrix  a grid: row = from, column = to
   Color overlays (node views): ending odds, playtest heat, one item's tracks.
   Hovering a page lights up the pages that lead to it and on from it; on a touch
   screen the first tap does that and the second opens the page. Esc clears.
   --------------------------------------------------------------------------- */

const MAP_VIEWS = [
  ['flow', 'Flow', 'Left to right: each column is one more choice from the start.'],
  ['down', 'Top-down tree', 'Top to bottom, like a family tree: each row is one more choice from the start.'],
  ['spine', 'Choke-point spine', 'The pages every route to the goal must pass through sit on one bold line; branches hang above and below.'],
  ['lanes', 'Given lanes', 'One band per Given answer: pages every player can reach in the middle band, pages only some players reach in theirs.'],
  ['shape', 'Story shape', 'The stretches between choke points, each summed up: straight road, branch and rejoin, endings off it, loops.'],
  ['river', 'River of players', 'Simulated players pour through the story; the wider the band, the more of them take that choice.'],
  ['arc', 'Arc diagram', 'Every page on one line in reading order; choices are arcs. Long jumps and loops stand out.'],
  ['matrix', 'Matrix', 'A grid: a square where a choice on the row’s page leads to the column’s page. Clusters show as blocks near the diagonal.']
];
const NODE_VIEWS = ['flow', 'down', 'spine', 'lanes'];
const SIMPLE_VIEWS = ['flow', 'down', 'matrix']; // the views shown while the Map's advanced features are off (Options → Advanced)
/** The views on offer now: all of them with the Map's advanced features on (Given lanes only with Givens), else the simple three. */
function mapViews() {
  return MAP_VIEWS.filter(v =>
    adv('map') ? v[0] !== 'lanes' || (project.givens || []).some(g => g.options.length >= 2) : SIMPLE_VIEWS.includes(v[0])
  );
}

let mapZoom = 1;
const mapZoomOf = {}; // view -> zoom last used there
let mapQuery = '';
const mapScroll = {}; // view -> { l, t }
let mapGood = false;
let mapBad = false;
const mapOpts = { view: 'flow', merge: true, traffic: false, color: 'none' }; // remembered in this browser (runs always fold; see mapOpen)
let mapOptsLoaded = false;
const mapAs = {}; // givenId -> answer: draw the map as that player sees it
let mapOpen = {}; // folded runs the author opened up, by first page
let mapPin = null; // the page whose neighbors stay lit (a tap, or "Show on the map")
let mapPick = null; // a set of pages picked from Story shape, shown lit in another view
const mapPrev = {}; // view -> { order, pos } from last time, so the picture stays put
let mapPlay = { key: '', data: null }; // simulated players, kept until the story changes

/** Loads the saved map settings once, keeping only values this version understands. */
function loadMapOpts() {
  if (mapOptsLoaded) return;
  mapOptsLoaded = true;
  let o = null;
  try {
    o = JSON.parse(readPref(`${STORE}-map`) || 'null');
  } catch {
    /* storage off or damaged: defaults */
  }
  if (!o || typeof o !== 'object') return;
  if (MAP_VIEWS.some(v => v[0] === o.view)) mapOpts.view = o.view;
  if (o.v === 2 && typeof o.merge === 'boolean') mapOpts.merge = o.merge; // older saves had merging off by default; it is now on
  mapOpts.traffic = o.traffic === true;
  if ([100, 500, 1000, 2000, 5000, 10000].includes(o.runs)) mapSim.runs = o.runs;
  if (SIM_MODES.some(m => m[0] === o.mode)) mapSim.mode = o.mode;
  if (typeof o.color === 'string') mapOpts.color = o.color;
}
function saveMapOpts() {
  savePref(`${STORE}-map`, JSON.stringify({ ...mapOpts, ...mapSim, v: 2 }));
}
/** Draws the Map tab again after a view setting changes. */
function mapRedraw() {
  if (view === 'map') renderMain();
}
/** Opens the Map with page `id` lit up and centered (from a page's right-click menu). */
function showOnMap(id) {
  mapPin = id;
  mapPick = null;
  view = 'map';
  renderAll();
}
/** How the simulated players behave: how many, and how they pick (see playtest in maplayout.js). Remembered in this browser. */
const mapSim = { runs: 2000, mode: 'random' };
const SIM_MODES = [
  ['random', 'Pick at random', 'Each player picks any choice they can see, all equally likely'],
  ['first', 'Pick the first choice', 'Each player always picks the first choice listed: your main line'],
  ['curious', 'Explore new pages', 'Each player prefers a choice leading somewhere they have not been yet']
];
let mapRiverSel = null; // River: { page } or { from, to } being followed, or null
/** The simulated players for the story as it is now, with the current settings (recomputed only after a change). */
function playData() {
  const key = JSON.stringify([cur, mapSim, mapAs]);
  if (mapPlay.key !== key) mapPlay = { key, data: playtest(project, { runs: mapSim.runs, mode: mapSim.mode, as: mapAs }) };
  return mapPlay.data;
}

/** How many times the search terms occur in the page's name, heading, text, choices and items (0 = no match). */
function pageHits(p, terms) {
  const hay = [p.name, p.heading];
  p.blocks.forEach(b => {
    hay.push(b.text);
    b.needs.concat(b.forbid).forEach(id => hay.push(itemName(id)));
  });
  p.choices.forEach(c => {
    hay.push(c.label);
    c.needs.concat(c.forbid).forEach(id => hay.push(itemName(id)));
  });
  p.gives.concat(p.takes).forEach(id => hay.push(itemName(id)));
  const text = hay.join('\n').toLowerCase();
  let n = 0;
  terms.forEach(t => {
    let i = text.indexOf(t);
    while (t && i >= 0) {
      n++;
      i = text.indexOf(t, i + t.length);
    }
  });
  return n;
}

/**
 * Menu entries that switch one condition of a choice on or off: "Only if" (needs) or "Not if" (forbid).
 * Turning one on in one list takes it out of the other, so a choice never both needs and forbids the same thing.
 */
function condEntries(c, key, other) {
  const refs = project.items
    .filter(it => adv('items') || !givenOf(project, it.id) || c[key].includes(it.id))
    .map(it => ({ id: it.id, label: it.name }))
    .concat(HANDS_OVER ? virtualRefs(project).map(r => ({ id: r.id, label: r.label })) : []);
  if (!refs.length) return [{ label: 'No objects or states yet', disabled: true }];
  return refs.map(r => {
    const on = c[key].includes(r.id);
    return {
      label: r.label,
      check: on,
      fn() {
        if (on) c[key].splice(c[key].indexOf(r.id), 1);
        else {
          c[key].push(r.id);
          const j = c[other].indexOf(r.id);
          if (j >= 0) c[other].splice(j, 1);
        }
        refresh();
      }
    };
  });
}

/** Menu entries that switch an object or state on or off in a choice's gives / takes (Givens never change, so they are left out). */
function fxEntries(c, key) {
  const list = project.items.filter(it => !givenOf(project, it.id));
  if (!list.length) return [{ label: 'No objects or states yet', disabled: true }];
  return list.map(it => {
    const on = c[key].includes(it.id);
    return {
      label: it.name,
      check: on,
      fn() {
        if (on) c[key].splice(c[key].indexOf(it.id), 1);
        else c[key].push(it.id);
        refresh();
      }
    };
  });
}

/** Menu for a choice arrow: change its words, where it leads and when it shows, without leaving the map. */
function edgeMenu(from, ci) {
  const p = byId(from),
    c = p?.choices[ci];
  if (!c) return [];
  const dest = byId(c.to);
  return [
    { header: `“${c.label || 'Choice with no text'}”` },
    {
      label: 'Change the words…',
      fn() {
        promptDialog('Choice', [{ label: 'What the player does', value: c.label }], 'Save').then(v => {
          if (v) {
            c.label = v[0];
            refresh();
          }
        });
      }
    },
    {
      label: 'Leads to',
      sub: project.passages
        .filter(q => q.id !== p.id)
        .map(q => ({
          label: pname(q),
          check: c.to === q.id,
          fn() {
            c.to = q.id;
            refresh();
          }
        }))
    },
    { label: 'Only if the player has', sub: condEntries(c, 'needs', 'forbid') },
    { label: 'Not if the player has', sub: condEntries(c, 'forbid', 'needs') },
    { label: 'When picked, the player gets', sub: fxEntries(c, 'gives') },
    { label: 'When picked, the player loses', sub: fxEntries(c, 'takes') },
    { sep: true },
    {
      label: 'Edit on its page',
      fn() {
        openPage(p);
      }
    },
    dest
      ? {
          label: `Go to “${pname(dest)}”`,
          fn() {
            openPage(dest);
          }
        }
      : { label: 'Leads nowhere', disabled: true },
    { sep: true },
    {
      label: 'Cut the link (keep the choice)',
      fn() {
        c.to = '';
        refresh();
        toast('The choice now leads nowhere.', 'Undo', undo);
      }
    },
    {
      label: 'Delete this choice',
      danger: true,
      fn() {
        p.choices.splice(ci, 1);
        refresh();
        toast('Choice deleted.', 'Undo', undo);
      }
    }
  ];
}
/** The menu for one arrow that may stand for several choices. */
function edgeMenuFor(srcs) {
  if (srcs.length === 1) return edgeMenu(srcs[0].pid, srcs[0].ci);
  return [{ header: `${srcs.length} choices on this arrow` }].concat(
    srcs.map(s => ({ label: `“${s.label || 'Choice with no text'}”`, sub: edgeMenu(s.pid, s.ci).slice(1) }))
  );
}

/* ----- the key ----- */

let mapKeyOpen = null; // null until first drawn (open on wide screens, closed on phones)
let mapKeyPos = null; // where it was dragged to

/**
 * The key: a small panel over the map that can be dragged out of the way or folded. It lists only what
 * is on the map right now; the map calls key.update(present) whenever the picture changes.
 */
function mapKey() {
  if (mapKeyOpen === null) mapKeyOpen = window.innerWidth > 700;
  const mk = (tag, a, kids = []) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in a) e.setAttribute(k, a[k]);
    kids.forEach(c => e.appendChild(c));
    return e;
  };
  const sample = cls =>
    mk('svg', { class: 'lgsvg', width: 24, height: 14, viewBox: '0 0 24 14', 'aria-hidden': 'true' }, [
      mk('g', { class: `node ${cls}` }, [mk('rect', { x: 2, y: 2, width: 20, height: 10, rx: 2 })])
    ]);
  const arrow = (cls, head) =>
    mk('svg', { class: 'lgsvg', width: 30, height: 12, viewBox: '0 0 30 12', 'aria-hidden': 'true' }, [
      mk('path', { class: `edge ${cls}`, d: 'M1 6H19' }),
      mk('path', { class: `arrowhead ${head || ''}`, d: 'M19 2.4L29 6L19 9.6Z' })
    ]);
  const swatch = cls => h('span', { class: `swatch ${cls}`, 'aria-hidden': 'true' });
  const order = [
    ['start', sample('start'), 'Start', 'The first page'],
    ['good', sample('end good'), 'Good end'],
    ['bad', sample('end bad'), 'Bad end'],
    ['neutral', sample('end neutral'), 'Neutral end'],
    ['side', sample('side'), 'Side page', 'On no shortest route to a good or bad ending: scenery, flavor or a detour. Not a problem.'],
    ['prob', sample('prob'), 'Problem', 'The Check tab found a problem here'],
    ['choke', sample('choke'), 'Choke point', 'Every route to the story’s goal passes through this page'],
    ['run', sample('run'), 'Folded run', 'Pages that follow one another with no branching, folded into one box. Click it to open it up.'],
    ['match', sample('hit'), 'Search match'],
    ['choice', arrow(''), 'Choice'],
    ['multi', arrow('multi'), 'Several choices', 'One arrow for several choices between the same two pages (×2, ×3…). Right-click it to edit each.'],
    ['sometimes', arrow('gated'), 'Sometimes', 'A choice that only appears when the player has (or lacks) an item or state. Hover it to see which.'],
    ['gpath', arrow('pg', 'g'), 'Good crit path', 'The shortest route from the start to each good ending'],
    ['bpath', arrow('pb', 'b'), 'Bad crit path', 'The shortest route from the start to each bad ending'],
    ['object', icon('gift', 13), 'Object', 'An object gained (solid) or lost (faded) there'],
    ['state', icon('heart', 13), 'State', 'A state gained (solid) or lost (faded) there'],
    ['stat', icon('meter', 13), 'Number', 'A number that goes up (solid) or down (faded) there'],
    [
      'odds',
      swatch('odds'),
      'Ending odds',
      'Green: most simulated players who pass here end well. Red: most end badly. Pale: it could go either way.'
    ],
    ['heat', swatch('heat'), 'Playtest heat', 'The deeper the orange, the more simulated players see the page. Gray: almost nobody does.'],
    ['tgive', swatch('tgive'), 'Gives it'],
    ['tneed', swatch('tneed'), 'Needs it'],
    ['ttake', swatch('ttake'), 'Takes it']
  ];
  const entries = {},
    grid = h('div', { class: 'fkgrid' });
  order.forEach(o => {
    const el = h('span', { class: 'keyitem', title: o[3] || null }, [o[1], o[2]]);
    entries[o[0]] = el;
    grid.appendChild(el);
  });
  const body = h('div', { class: 'fkbody' }, [grid]);
  const root = h('div', { class: 'fkey', role: 'group', 'aria-label': 'Map key' });
  const toggle = h('button', {
    type: 'button',
    class: 'fktoggle',
    'aria-expanded': String(mapKeyOpen),
    title: 'Show or hide the key',
    onclick(e) {
      if (e.detail === 0) {
        mapKeyOpen = !mapKeyOpen;
        sync();
      }
    }
  }); // detail 0: from the keyboard (a tap is handled below)
  const head = h('div', { class: 'fkhead', title: 'Drag to move the key out of the way. Click to show or hide it.' }, [
    h('span', { class: 'fkgrip', 'aria-hidden': 'true', text: '⋮⋮' }),
    toggle
  ]);
  function place() {
    const par = root.parentNode;
    if (!par) return;
    if (!mapKeyPos) {
      if (root.auto) root.auto();
      return;
    }
    root.style.left = `${Math.min(Math.max(0, mapKeyPos.left), Math.max(0, par.clientWidth - root.offsetWidth))}px`;
    root.style.top = `${Math.min(Math.max(0, mapKeyPos.top), Math.max(0, par.clientHeight - root.offsetHeight))}px`;
    root.style.bottom = 'auto';
    root.style.right = 'auto';
  }
  head.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const r = root.getBoundingClientRect(),
      pr = root.parentNode.getBoundingClientRect();
    const dx = e.clientX - r.left,
      dy = e.clientY - r.top,
      sx = e.clientX,
      sy = e.clientY;
    let moved = false;
    try {
      head.setPointerCapture(e.pointerId);
    } catch {
      /* older browsers: still works while the pointer stays over the header */
    }
    const mv = ev => {
      if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 5) return;
      moved = true;
      head.classList.add('moving');
      mapKeyPos = { left: ev.clientX - dx - pr.left, top: ev.clientY - dy - pr.top };
      place();
      ev.preventDefault();
    };
    const up = () => {
      head.removeEventListener('pointermove', mv);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      head.classList.remove('moving');
      if (!moved) {
        mapKeyOpen = !mapKeyOpen;
        sync();
        place();
      }
    };
    head.addEventListener('pointermove', mv);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  });
  function sync() {
    toggle.textContent = `Key ${mapKeyOpen ? '▾' : '▸'}`;
    toggle.setAttribute('aria-expanded', String(mapKeyOpen));
    body.hidden = !mapKeyOpen;
    root.classList.toggle('open', mapKeyOpen);
  }
  root.append(head, body);
  sync();
  root.update = present => {
    for (const k in entries) entries[k].hidden = !present[k];
    root.hidden = !Object.values(present).some(Boolean);
    place();
  };
  setTimeout(place, 0);
  return root;
}

/* ----- building a view ----- */

/**
 * Which group each page box belongs to, for "groups" in the scores and for Given lanes: the set of Given
 * answers whose players can reach it, or (with no Givens) the kind of ending most simulated players
 * reach from it. Returns { cls: {nodeId: name}, lanes: [{key, name}], laneOf: {nodeId: number} }.
 */
function mapGroups(G) {
  const givens = (project.givens || []).filter(g => g.options.length >= 2);
  const cls = {},
    laneOf = {};
  let lanes = [];
  if (givens.length) {
    /* every combination of answers (at most 8), and which pages each can reach */
    let combos = [{}];
    for (const g of givens) {
      const next = [];
      combos.forEach(c => g.options.forEach(o => next.push({ ...c, [g.id]: o })));
      combos = next;
      if (combos.length > 8) {
        combos = combos.slice(0, 8);
        break;
      }
    }
    const name = c => Object.values(c).map(itemName).join(' + ');
    const reach = combos.map(c => new Set(Object.keys(mapGraph(project, { as: c }).groupOf)));
    const keyOf = {};
    G.nodes.forEach(n => {
      const who = combos.map((c, i) => (n.pages.some(pid => reach[i].has(pid)) ? i : -1)).filter(i => i >= 0);
      keyOf[n.id] = who.length === combos.length ? 'all' : who.length ? who.join(',') : 'none';
    });
    const keys = [...new Set(Object.values(keyOf))];
    const rank = k => (k === 'all' ? -1 : k === 'none' ? 1e6 : k.split(',').length * 100 + Number(k.split(',')[0]));
    keys.sort((a, b) => rank(a) - rank(b));
    lanes = keys.map(k => ({
      key: k,
      name:
        k === 'all'
          ? 'Every player'
          : k === 'none'
            ? 'Nobody reaches these'
            : `Only ${k
                .split(',')
                .map(i => name(combos[i]))
                .join(' or ')}`
    }));
    /* the shared band goes in the middle, the answer-only bands either side of it */
    if (lanes[0]?.key === 'all' && lanes.length > 2) {
      const all = lanes.shift();
      lanes.splice(Math.floor(lanes.length / 2), 0, all);
    }
    G.nodes.forEach(n => {
      laneOf[n.id] = lanes.findIndex(l => l.key === keyOf[n.id]);
      cls[n.id] = keyOf[n.id];
    });
  } else {
    /* Without Given questions the groups are "where the simulated players ended up". Only the Compare table's group-separation score reads
       them, so they are worked out the first time something asks (the 2,000 simulated players are the slowest part of a first draw). */
    let lazy = null;
    return {
      get cls() {
        if (!lazy) {
          lazy = {};
          const pt = playData();
          G.nodes.forEach(n => {
            const t = pt.through[n.pages[0]];
            lazy[n.id] = !t ? 'none' : t.good >= t.bad ? (t.good ? 'good' : 'other') : 'bad';
          });
        }
        return lazy;
      },
      lanes,
      laneOf
    };
  }
  return { cls, lanes, laneOf };
}

/** Builds the picture for `viewName` with the current settings: graph, box sizes, layout. */
const mapCache = new Map(); // settings + a fingerprint of the story text -> layout, so the same story always looks the same (Undo puts pages back)
function mapBuild(viewName) {
  const ck = viewName === 'shape' ? '' : JSON.stringify([sigOf(cur), viewName, mapOpts.merge, mapOpts.traffic, mapOpts.color, mapAs, mapOpen, mapSim]);
  if (ck && mapCache.has(ck)) {
    const hit = mapCache.get(ck);
    mapCache.delete(ck);
    mapCache.set(ck, hit); // most recently used last
    return hit;
  }
  const L = mapBuildFresh(viewName);
  if (ck) {
    mapCache.set(ck, L);
    if (mapCache.size > 16) mapCache.delete(mapCache.keys().next().value);
  }
  return L;
}
/** Builds a layout from scratch (mapBuild keeps the results). */
function mapBuildFresh(viewName) {
  const t0 = performance.now();
  const flowing = viewName === 'river';
  const G = mapGraph(project, {
    as: mapAs,
    fold: !flowing && viewName !== 'matrix', // runs always fold where there are any; a click opens one, its Fold card closes it
    open: mapOpen,
    merge: mapOpts.merge || flowing || viewName === 'matrix' || viewName === 'arc'
  });
  const pt = flowing || mapOpts.color === 'odds' || mapOpts.color === 'heat' ? playData() : null;
  G.nodes.forEach(n => {
    n.traffic = Math.max(...n.pages.map(id => G.imp.traffic[id] || 0));
    n.choke = n.pages.some(id => G.imp.choke[id]);
    let k = 1;
    if (mapOpts.traffic) k = 1 + 0.45 * n.traffic;
    if (viewName === 'spine' && n.choke) k = Math.max(k, 1.2);
    n.k = k;
    n.w = MAP_W * k;
    n.h = MAP_H * k;
    if (flowing) {
      n.k = 1;
      n.w = 14;
      n.h = Math.max(6, ((pt.visits[n.pages[0]] || 0) * 420) / Math.max(1, pt.runs));
    }
  });
  const groups = mapGroups(G);
  const root = G.groupOf[project.start];
  const prev = mapPrev[viewName]?.order;
  let L;
  if (viewName === 'down') L = layered(G, { dir: 'TB', root, prev });
  else if (viewName === 'spine') L = layered(G, { dir: 'LR', root, prev, spine: true });
  else if (viewName === 'lanes' && groups.lanes.length) L = layered(G, { dir: 'LR', root, prev, lane: n => Math.max(0, groups.laneOf[n.id]) });
  else if (viewName === 'river') L = layered(G, { dir: 'LR', root, prev, gapLayer: 190, gapNode: 14 });
  else if (viewName === 'arc') L = arcLayout(G, layered(G, { dir: 'LR', root, prev: mapPrev.flow?.order }));
  else if (viewName === 'matrix') {
    L = matrixLayout(G, layered(G, { dir: 'LR', root, prev: mapPrev.flow?.order }));
    L.nodes.forEach(n => {
      n.cx = n.cy = L.head + n.mi * L.cell + L.cell / 2;
      n.w = n.h = L.cell;
    });
  } else if (viewName === 'shape') L = shapeLayout(project, G);
  else L = layered(G, { dir: 'LR', root, prev });
  if (viewName === 'lanes') L.laneNames = groups.lanes.map(l => l.name);
  L.view = viewName;
  L.G = G;
  L.groups = groups;
  L.pt = pt;
  L.ms = performance.now() - t0;
  return L;
}

/** Scores layout L against the qualities in mapMetrics (null for summary views that do not draw every arrow). */
function mapScore(L, prevPos, quick) {
  if (L.kind === 'shape' || L.view === 'river') return null;
  return mapMetrics(L, L.ms, quick ? null : L.groups.cls, prevPos, quick); // the quick chip never reads the groups, so it must not ask for them
}

/* ----- the tab ----- */

function renderMap(main) {
  loadMapOpts();
  for (const gid of Object.keys(mapAs)) {
    const g = project.givens.find(x => x.id === gid);
    if (!g?.options.includes(mapAs[gid])) delete mapAs[gid];
  }
  if (!mapViews().some(v => v[0] === mapOpts.view)) mapOpts.view = 'flow';
  if (!adv('map')) {
    /* simple Map: page-type colors only, and every player */
    mapOpts.color = 'none';
    for (const k in mapAs) delete mapAs[k];
  }
  const vname = mapOpts.view;
  const L = mapBuild(vname);
  const prevPos = mapPrev[vname]?.pos;
  const score = mapScore(L, prevPos, true); // the toolbar chip needs only the crossings, backward arrows and time
  if (L.kind === 'nodes' || L.kind === 'arc' || L.kind === 'matrix') {
    const pos = {};
    L.nodes.forEach(n => {
      pos[n.id] = [n.cx ?? n.x + n.w / 2, n.cy ?? n.y + n.h / 2];
    });
    mapPrev[vname] = { order: L.order || mapPrev[vname]?.order, pos };
  }
  const an = freshAnalysis(),
    bad = problemSet();
  const routePages = {};
  let anyRoute = false;
  an?.endings.forEach(en => {
    if (!en.reachable || (en.valence !== 'good' && en.valence !== 'bad')) return;
    let c = project.start;
    routePages[c] = true;
    anyRoute = true;
    en.path.forEach(st => {
      if (!st.given) {
        c = st.to;
        routePages[c] = true;
      }
    });
  });

  /* ----- toolbar ----- */
  const opt = (value, text, on, title) => {
    const o = h('option', { value, text, title });
    if (on) o.selected = true;
    return o;
  };
  const nodeView = NODE_VIEWS.includes(vname) || vname === 'arc';
  const forcedMerge = ['arc', 'matrix', 'river'].includes(vname);
  /* every map control is a small icon button; the tooltip says what it is */
  const mapBtn = (kind, label, tip, on, fn, disabled) =>
    h(
      'button',
      {
        type: 'button',
        class: `iconbtn mapico${on ? ' on' : ''}`,
        'aria-pressed': String(!!on),
        'aria-label': label,
        title: tip ? `${label}: ${tip}` : label,
        disabled: disabled ? true : null,
        onclick: fn
      },
      [icon(kind, 18)]
    );
  const setOpt = (k, v) => {
    mapOpts[k] = v;
    saveMapOpts();
    mapRedraw();
  };
  const viewGroup = h(
    'span',
    { class: 'mapgrp', role: 'group', 'aria-label': 'Map view' },
    mapViews().map(v => mapBtn(`mv-${v[0]}`, v[1], v[2], v[0] === vname, () => setOpt('view', v[0])))
  );
  const colorOn = k => mapOpts.color === k;
  const trackItems = project.items.filter(it => !givenOf(project, it.id));
  const colorGroup = adv('map')
    ? h('span', { class: 'mapgrp', role: 'group', 'aria-label': 'Color the pages by' }, [
        mapBtn('mc-type', 'Color by page type', 'The usual colors: start, endings, problems.', colorOn('none'), () => setOpt('color', 'none'), !nodeView),
        mapBtn(
          'mc-odds',
          'Color by ending odds',
          'Green where most simulated players go on to a good ending, red where most end badly. Click again to go back.',
          colorOn('odds'),
          () => setOpt('color', colorOn('odds') ? 'none' : 'odds'),
          !nodeView
        ),
        mapBtn(
          'mc-heat',
          'Color by playtest heat',
          'Deeper orange where more simulated players pass; gray where almost nobody does. Click again to go back.',
          colorOn('heat'),
          () => setOpt('color', colorOn('heat') ? 'none' : 'heat'),
          !nodeView
        ),
        mapBtn(
          'mc-track',
          'Follow an object, state or number',
          'Shows where one item is given, taken and needed. Click to choose which.',
          mapOpts.color.startsWith('track:'),
          e => {
            const r = e.currentTarget.getBoundingClientRect();
            ctxMenu(
              r.left,
              r.bottom + 2,
              trackItems.length
                ? [{ label: 'Stop following', disabled: !mapOpts.color.startsWith('track:'), fn: () => setOpt('color', 'none') }, { sep: true }].concat(
                    trackItems.map(it => ({ label: it.name, check: colorOn(`track:${it.id}`), fn: () => setOpt('color', `track:${it.id}`) }))
                  )
                : [{ label: 'No objects or states yet', disabled: true }],
              viaKeys
            );
          },
          !nodeView
        )
      ])
    : null;
  const givenList = (adv('map') ? project.givens || [] : []).filter(g => g.options.length >= 2);
  const asBtn = givenList.length
    ? mapBtn(
        'mc-as',
        'Draw the map as a particular player',
        'Choices and pages a player with the chosen answer never gets are left out.',
        givenList.some(g => mapAs[g.id]),
        e => {
          const r = e.currentTarget.getBoundingClientRect();
          const entries = [];
          givenList.forEach((g, gi) => {
            if (gi) entries.push({ sep: true });
            entries.push({ header: g.question || 'Given' });
            entries.push({
              label: 'Any player',
              check: !mapAs[g.id],
              fn: () => {
                delete mapAs[g.id];
                mapRedraw();
              }
            });
            g.options.forEach(id =>
              entries.push({
                label: itemName(id),
                check: mapAs[g.id] === id,
                fn: () => {
                  mapAs[g.id] = id;
                  mapRedraw();
                }
              })
            );
          });
          ctxMenu(r.left, r.bottom + 2, entries, viaKeys);
        }
      )
    : null;
  /* Arc, Matrix and River always merge (one arc, square or band per pair of pages), so there the button shows on and is grayed */
  const mergeBtn = mapBtn(
    'mc-merge',
    'Merge',
    forcedMerge
      ? 'This view always shows one arc, square or band for each pair of pages.'
      : 'Draw several choices between the same two pages as one thicker arrow marked ×2, ×3…',
    forcedMerge || mapOpts.merge,
    () => setOpt('merge', !mapOpts.merge),
    forcedMerge || vname === 'shape'
  );
  const sizeBtn = mapBtn(
    'mc-size',
    'Size by traffic',
    vname === 'matrix' || vname === 'river' || vname === 'shape'
      ? 'Applies to Flow, Top-down, Spine, Given lanes and Arc views.'
      : 'Draw a page bigger the more routes through the story pass it (a folded run takes its busiest page). Choke points, which every route passes, get a bold outline.',
    mapOpts.traffic,
    () => setOpt('traffic', !mapOpts.traffic),
    !(NODE_VIEWS.includes(vname) || vname === 'arc')
  );
  const count = h('span', { class: 'mapcount', role: 'status' });
  const search = h('input', {
    class: 'in mapsearch',
    type: 'search',
    placeholder: 'Search pages, text, choices, items',
    'aria-label': 'Search the map',
    value: mapQuery,
    title: 'Lights up matching pages and fades the rest. Separate several words with commas. Enter centers the first match; Esc clears.',
    oninput(e) {
      mapQuery = e.target.value;
      applySearch(false);
    },
    onkeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySearch(true);
      } else if (e.key === 'Escape') {
        mapQuery = '';
        search.value = '';
        applySearch(false);
      }
    }
  });
  const reachableKinds = {
    pg: !!an?.endings.some(e => e.reachable && e.valence === 'good'),
    pb: !!an?.endings.some(e => e.reachable && e.valence === 'bad')
  };
  const pill = (cls, text, tip, get, set) => {
    const b = h(
      'button',
      {
        type: 'button',
        class: cls + (get() ? ' on' : ''),
        'aria-pressed': String(get()),
        disabled: nodeView && reachableKinds[cls] ? null : true,
        title: !nodeView
          ? 'Crit paths show in Flow, Top-down, Spine, Given lanes and Arc views.'
          : reachableKinds[cls]
            ? tip
            : cls === 'pg'
              ? 'No good ending can be reached yet. Mark an ending as good, and make sure a player can get there.'
              : 'No bad ending can be reached yet.',
        onclick() {
          set(!get());
          syncPills();
          applyPaths();
        }
      },
      [h('i', { 'aria-hidden': 'true' }), text]
    );
    b._get = get;
    return b;
  };
  const critPills = h('div', { class: 'critpills', role: 'group', 'aria-label': 'Highlight critical paths' }, [
    pill(
      'pg',
      'Good path',
      'Highlight the shortest route from the start to each good ending',
      () => mapGood,
      x => {
        mapGood = x;
      }
    ),
    pill(
      'pb',
      'Bad path',
      'Highlight the shortest route from the start to each bad ending',
      () => mapBad,
      x => {
        mapBad = x;
      }
    )
  ]);
  function syncPills() {
    for (const b of critPills.children) {
      const on = b._get();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  const zlabel = h('span', { class: 'zlabel', text: '100%' });
  const zb = (label, title, fn) => h('button', { class: 'btn small', type: 'button', title, 'aria-label': title, text: label, onclick: fn });
  const chip = h('button', {
    type: 'button',
    class: 'scorechip',
    title: 'How well this drawing does on the qualities that compete in graph drawing. Click to compare every view.',
    onclick: () => compareViews()
  });
  if (score) {
    const r = score.raw;
    chip.append(
      h('span', {
        class: 'full',
        text:
          L.kind === 'matrix'
            ? `${L.nodes.length} pages · ${L.edges.length} squares · ${Math.round(r.ms)} ms`
            : `${r.crossings} crossing${r.crossings === 1 ? '' : 's'} · ${r.backward} backward · ${Math.round(r.ms)} ms`
      }),
      h('span', { class: 'short', text: 'Compare' })
    );
  } else chip.append(h('span', { text: 'Compare views' }));
  const bar = h('div', { class: 'maptools', role: 'toolbar', 'aria-label': 'Map tools' }, [
    viewGroup,
    colorGroup,
    h('span', { class: 'mapgrp' }, [mergeBtn, sizeBtn, asBtn]),
    h('span', { class: 'grow searchwrap' }, [search, count]),
    critPills,
    adv('map')
      ? h('button', {
          type: 'button',
          class: 'scorechip playpill',
          text: 'Playtest results',
          title: 'What simulated players do in your story: how runs end, the most- and least-seen pages, and where players get stuck.',
          onclick: () => playReport()
        })
      : null,
    chip,
    h('span', { class: 'row tight' }, [
      zb('−', 'Zoom out', () => zoomBy(1 / 1.25)),
      zlabel,
      zb('+', 'Zoom in', () => zoomBy(1.25)),
      zb('Fit', 'Show the whole map', () => fit())
    ])
  ]);

  const notes = [];
  if (L.G.hidden)
    notes.push(`${L.G.hidden} page${L.G.hidden === 1 ? '' : 's'} this player never reaches ${L.G.hidden === 1 ? 'is' : 'are'} left out.`);
  if (mapPick)
    notes.push(
      h('span', {}, [
        `${mapPick.size} pages from Story shape are lit. `,
        h('button', {
          class: 'linkbtn',
          type: 'button',
          text: 'Clear',
          onclick() {
            mapPick = null;
            mapRedraw();
          }
        })
      ])
    );
  const openRuns = L.G.runs.filter(r => mapOpen[r[0]] && L.nodes.some(n => n.id === r[0]));
  if (openRuns.length)
    notes.push(
      h('button', {
        class: 'linkbtn',
        type: 'button',
        text: `Fold all ${openRuns.length} opened run${openRuns.length === 1 ? '' : 's'} again`,
        onclick() {
          mapOpen = {};
          mapRedraw();
        }
      })
    );
  if (L.kind === 'shape' && L.segs.length) {
    const goal = L.G.imp.goal.map(byId).filter(Boolean);
    notes.push(
      `Your story squeezed to its backbone, read left to right: circles are pages every player passes through on the way to ${goal.length === 1 ? `“${pname(goal[0])}”` : 'the goal'}, and each capsule is the stretch between two of them, its pages shown as dots. Click a capsule to see its pages in Flow.`
    );
  }
  if (L.pt && (L.view === 'river' || mapOpts.color === 'odds' || mapOpts.color === 'heat')) {
    /* the simulated players: how many and how they pick, with their results one click away */
    const runsSel = h(
      'select',
      {
        class: 'in mapsel small',
        'aria-label': 'How many simulated players',
        title: 'More players give steadier numbers but take longer.',
        onchange(e) {
          mapSim.runs = Number(e.target.value);
          saveMapOpts();
          mapRedraw();
        }
      },
      [100, 500, 1000, 2000, 5000, 10000].map(n => opt(String(n), `${n.toLocaleString('en')} players`, mapSim.runs === n))
    );
    const modeSel = h(
      'select',
      {
        class: 'in mapsel small',
        'aria-label': 'How simulated players choose',
        title: 'How each simulated player picks among the choices they can see.',
        onchange(e) {
          mapSim.mode = e.target.value;
          saveMapOpts();
          mapRedraw();
        }
      },
      SIM_MODES.map(m => opt(m[0], m[1], mapSim.mode === m[0], m[2]))
    );
    const o = L.pt.outcome,
      n = L.pt.runs;
    notes.push(
      h('span', { class: 'simbar' }, [
        'Simulated: ',
        runsSel,
        modeSel,
        h('span', {
          text: `${pct(o.good, n)} end well, ${pct(o.bad, n)} badly${o.neutral ? `, ${pct(o.neutral, n)} plain` : ''}${o.stuck ? `, ${pct(o.stuck, n)} stuck` : ''}.`
        }),
        h('button', { class: 'linkbtn', type: 'button', text: 'Full results', onclick: () => playReport() })
      ])
    );
  }
  if (L.view === 'matrix')
    notes.push(
      'Read across a row: a square in a column means a choice on that row’s page leads to the column’s page (a number: several choices). Squares right of the diagonal go forward; red ones, left of it, go back. Blocks near the diagonal are clusters of pages that link to each other. Click a square to change its choice; click a name to edit the page.'
    );

  /* ----- the drawing ----- */
  const NS = SVGNS;
  const s = (tag, a = {}, kids = []) => {
    const e = document.createElementNS(NS, tag);
    for (const k in a) if (a[k] !== null && a[k] !== undefined) e.setAttribute(k, a[k]);
    kids.forEach(c => e.appendChild(c));
    return e;
  };
  const tip = (el, text) => {
    const t = s('title');
    t.textContent = text;
    el.appendChild(t);
    return el;
  };
  const W = L.width || 800,
    BH = (L.height || 400) + 30;
  const svg = s('svg', { viewBox: `0 0 ${W} ${BH}`, role: 'group', 'aria-label': `Map of your story: ${MAP_VIEWS.find(v => v[0] === vname)[1]}` });
  const box = h('div', { class: `mapbox grab v-${vname}` }, [svg]);
  const key = mapKey();
  const head = (id, cls) =>
    s(
      'marker',
      { id, viewBox: '0 0 10 10', refX: '0', refY: '5', markerUnits: 'userSpaceOnUse', markerWidth: '12', markerHeight: '12', orient: 'auto' },
      [s('path', { d: 'M0 0.5 L10 5 L0 9.5 z', class: `arrowhead ${cls || ''}` })]
    );
  svg.appendChild(s('defs', {}, [head('arr'), head('arrd', 'faint'), head('arrg', 'g'), head('arrb', 'b'), head('arrl', 'l')]));
  const layerBack = s('g', { class: 'under' }),
    layerEdges = s('g'),
    layerNodes = s('g'),
    layerTop = s('g');
  svg.append(layerBack, layerEdges, layerNodes, layerTop);
  const nodeEls = {},
    edgeEls = [],
    present = {};
  let moved = false; // a drag-to-pan in progress, so it is not taken for a click
  const HEAD = 12;

  /* color overlays */
  const color = nodeView ? mapOpts.color : 'none';
  const track = color.startsWith('track:') ? color.slice(6) : '';
  const pt = L.pt;
  function oddsOf(pids) {
    const t = { good: 0, bad: 0, neutral: 0, stuck: 0 };
    pids.forEach(id => {
      const x = pt.through[id];
      if (x) for (const k in t) t[k] = Math.max(t[k], x[k]);
    });
    const n = t.good + t.bad + t.neutral + t.stuck;
    return { ...t, n };
  }

  /* ----- node views (flow, down, spine, lanes) and arc ----- */
  function pageClasses(n) {
    const pages = n.pages.map(byId),
      p = pages[0];
    const isSide =
      anyRoute &&
      !n.loose &&
      pages.every(q => !q.ending && !routePages[q.id] && q.id !== project.start) &&
      !((mapOpts.traffic || vname === 'spine') && n.choke);
    const c = ['node'];
    if (p.id === project.start) {
      c.push('start');
      present.start = true;
    }
    if (!n.run && p.ending) {
      c.push('end', p.valence || 'neutral');
      present[p.valence || 'neutral'] = true;
    }
    if (pages.some(q => bad[q.id])) {
      c.push('prob');
      present.prob = true;
    }
    if (isSide) {
      c.push('side');
      present.side = true;
    }
    if (pages.some(q => q.id === selId)) c.push('sel');
    if (n.run) {
      c.push('run');
      present.run = true;
    }
    if ((mapOpts.traffic || vname === 'spine') && n.choke) {
      c.push('choke');
      present.choke = true;
    }
    return { cls: c.join(' '), isSide };
  }
  function nodeTip(n, isSide) {
    const pages = n.pages.map(byId),
      p = pages[0];
    let t = n.run
      ? `${pages.map(pname).join(' → ')}\nClick to open up these ${pages.length} pages.`
      : `${pname(p)}\nClick to edit, right-click for more.`;
    if (n.choke && (mapOpts.traffic || vname === 'spine')) t += '\nA choke point: every route to the goal passes here.';
    if (mapOpts.traffic) t += `\nAbout ${Math.round(n.traffic * 100)}% of all routes pass here.`;
    if (isSide) t += '\nA side page: on no shortest route to a good or bad ending.';
    if (!n.run && p.note) t += `\nYour note: ${p.note}`;
    if (color === 'odds' || color === 'heat') {
      const o = oddsOf(n.pages);
      t += o.n
        ? `\nOf ${pt.runs.toLocaleString('en')} simulated players, ${pct(o.n, pt.runs)} pass here; of those, ${pct(o.good, o.n)} end well, ${pct(o.bad, o.n)} badly${o.neutral ? `, ${pct(o.neutral, o.n)} neutral` : ''}${o.stuck ? `, ${pct(o.stuck, o.n)} get stuck` : ''}.`
        : '\nNo simulated player got here.';
    }
    return t;
  }
  /** Fill color for the overlays, as an inline style (null: use the page type's color). */
  function overlayFill(n) {
    if (color === 'odds') {
      const o = oddsOf(n.pages);
      if (!o.n) {
        return { cls: 'cold' };
      }
      const lean = (o.good - o.bad) / o.n; // -1 all bad .. +1 all good
      present.odds = true;
      return {
        style: `fill:color-mix(in srgb, ${lean >= 0 ? 'var(--okfill)' : 'var(--badfill)'} ${Math.round(Math.abs(lean) * 55)}%, var(--node))`,
        bar: o
      };
    }
    if (color === 'heat') {
      const v = pt.visits[n.pages[0]] || 0,
        share = v / Math.max(1, pt.runs);
      present.heat = true;
      if (share < 0.01) return { cls: 'cold' };
      return { style: `fill:color-mix(in srgb, var(--heat) ${Math.round(12 + Math.sqrt(share) * 43)}%, var(--node))`, label: pct(v, pt.runs) };
    }
    return null;
  }
  /* item tracks: where one object or state is given, taken and needed */
  const trackInfo = {};
  if (track) {
    project.passages.forEach(p => {
      const give = p.gives.includes(track) || p.choices.some(c => c.gives.includes(track));
      const take = p.takes.includes(track) || p.choices.some(c => c.takes.includes(track));
      const need = p.blocks
        .concat(p.choices)
        .some(c => c.needs.includes(track) || c.forbid.includes(track) || c.needs.some(id => id.startsWith(`m:${track}:`)));
      if (give || take || need) trackInfo[p.id] = { give, take, need };
    });
  }

  function drawNodeViews() {
    const LR = L.dir !== 'TB';
    /* lane bands and the spine line, behind everything */
    (L.lanes || []).forEach((ln, i) => {
      const name = L.laneNames?.[ln.lane] || '';
      const r = LR
        ? s('rect', { x: 0, y: ln.from, width: W, height: ln.to - ln.from, class: `lane l${i % 2}` })
        : s('rect', { x: ln.from, y: 0, width: ln.to - ln.from, height: BH, class: `lane l${i % 2}` });
      const t = s('text', { x: LR ? 8 : ln.from + 8, y: LR ? ln.from + 16 : 16, class: 'lanename' });
      t.textContent = name;
      layerBack.append(r, t);
    });
    if (vname === 'spine') {
      const ch = L.nodes.filter(n => n.choke).sort((a, b) => a.x - b.x);
      if (ch.length > 1)
        layerBack.appendChild(s('path', { class: 'spineline', d: `M${ch.map(n => `${n.x + n.w / 2} ${n.y + n.h / 2}`).join(' L')}` }));
    }
    /* ports: where each arrow leaves and enters a box, spread along the side it uses */
    const slots = {};
    const sideOf = (e, end) => {
      if (e.kind === 'self') return 'R';
      if (e.kind === 'flat') return LR ? 'R' : 'B';
      if (LR) return (e.kind === 'fwd') === (end === 'out') ? 'R' : 'L';
      return (e.kind === 'fwd') === (end === 'out') ? 'B' : 'T';
    };
    L.edges.forEach(e => {
      const a = L.pos[e.from],
        b = L.pos[e.to];
      const nextOut = e.pts.length ? e.pts[0] : [b.x + b.w / 2, b.y + b.h / 2];
      const nextIn = e.pts.length ? e.pts[e.pts.length - 1] : [a.x + a.w / 2, a.y + a.h / 2];
      e.so = sideOf(e, 'out');
      e.si = sideOf(e, 'in');
      (slots[`${e.from}|${e.so}`] ||= []).push({ e, end: 'out', k: LR || e.so === 'R' ? nextOut[1] : nextOut[0] });
      (slots[`${e.to}|${e.si}`] ||= []).push({ e, end: 'in', k: LR || e.si === 'R' ? nextIn[1] : nextIn[0] });
    });
    for (const key in slots) {
      const [id, side] = key.split('|'),
        n = L.pos[id],
        list = slots[key].sort((p, q) => p.k - q.k);
      list.forEach((it, i) => {
        const f = (i + 1) / (list.length + 1);
        const pt2 =
          side === 'R'
            ? [n.x + n.w, n.y + n.h * f]
            : side === 'L'
              ? [n.x, n.y + n.h * f]
              : side === 'B'
                ? [n.x + n.w * f, n.y + n.h]
                : [n.x + n.w * f, n.y];
        it.e[it.end === 'out' ? 'p0' : 'p1'] = pt2;
      });
    }
    const off = side => (side === 'R' ? [HEAD, 0] : side === 'L' ? [-HEAD, 0] : side === 'B' ? [0, HEAD] : [0, -HEAD]);
    L.edges.forEach((e, ei) => {
      const o = off(e.si),
        end = [e.p1[0] + o[0], e.p1[1] + o[1]];
      let P; // control points, as one flat list: start, then (c1, c2, point) per segment
      if (e.kind === 'self' || e.kind === 'flat') {
        const out = 34 + (ei % 4) * 8;
        if (e.so === 'R') {
          const x = Math.max(e.p0[0], end[0]) + out;
          P = [e.p0[0], e.p0[1], x, e.p0[1], x, end[1], end[0], end[1]];
        } else {
          const y = Math.max(e.p0[1], end[1]) + out;
          P = [e.p0[0], e.p0[1], e.p0[0], y, end[0], y, end[0], end[1]];
        }
      } else {
        const pts = [e.p0, ...e.pts, end];
        P = [pts[0][0], pts[0][1]];
        for (let i = 0; i + 1 < pts.length; i++) {
          const [x0, y0] = pts[i],
            [x1, y1] = pts[i + 1];
          if (LR) {
            const m = (x1 - x0) / 2;
            P.push(x0 + m, y0, x1 - m, y1, x1, y1);
          } else {
            const m = (y1 - y0) / 2;
            P.push(x0, y0 + m, x1, y1 - m, x1, y1);
          }
        }
      }
      drawEdge(e, P);
    });
    L.nodes
      .slice()
      .sort((a, b) => a.layer - b.layer || (L.dir === 'TB' ? a.x - b.x : a.y - b.y))
      .forEach(n => drawNode(n)); // keyboard order follows the picture: layer by layer, top to bottom
    /* opened runs: a soft band behind their pages with a Fold button */
    if (vname !== 'river' && vname !== 'matrix')
      L.G.runs
        .filter(r => mapOpen[r[0]])
        .forEach(run => {
          const ns = run.map(id => L.pos[L.G.groupOf[id]]).filter(Boolean);
          if (ns.length < 2) return;
          const x0 = Math.min(...ns.map(n => n.x)) - 8,
            y0 = Math.min(...ns.map(n => n.y)) - 24,
            x1 = Math.max(...ns.map(n => n.x + n.w)) + 8,
            y1 = Math.max(...ns.map(n => n.y + n.h)) + 8;
          layerBack.appendChild(s('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 10, class: 'openrun' }));
          const fb = s('g', { class: 'foldbtn', tabindex: '0', role: 'button', 'aria-label': 'Fold this run again' }, [
            s('rect', { x: x0 + 6, y: y0 + 4, width: 46, height: 16, rx: 8 }),
            s('text', { x: x0 + 29, y: y0 + 16, 'text-anchor': 'middle' })
          ]);
          fb.lastChild.textContent = 'Fold';
          tip(fb, `Fold these ${run.length} pages back into one box`);
          const go = ev => {
            ev.stopPropagation();
            delete mapOpen[run[0]];
            mapRedraw();
          };
          fb.addEventListener('click', go);
          fb.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') go(ev);
          });
          layerTop.appendChild(fb);
        });
    /* item tracks: a line from every place that gives it to every place that needs it later */
    if (track) {
      const outs = {};
      L.G.links.forEach(l => {
        (outs[l.from] ||= []).push(l.to);
      });
      const gives = Object.keys(trackInfo).filter(id => trackInfo[id].give),
        needs = Object.keys(trackInfo).filter(id => trackInfo[id].need);
      let drawn = 0;
      gives.forEach(g => {
        const r = mapReach(g, outs, null);
        needs.forEach(nd => {
          if (nd === g || r[nd] === undefined || drawn > 60) return;
          const a = L.pos[L.G.groupOf[g]],
            b = L.pos[L.G.groupOf[nd]];
          if (!a || !b || a === b) return;
          const ax = a.x + a.w / 2,
            ay = a.y + a.h / 2,
            bx = b.x + b.w / 2,
            by = b.y + b.h / 2,
            bend = Math.min(140, Math.hypot(bx - ax, by - ay) * 0.25);
          layerBack.appendChild(
            tip(
              s('path', { class: `trackline ${itemKind(track)}`, d: `M${ax} ${ay} Q${(ax + bx) / 2} ${(ay + by) / 2 - bend} ${bx} ${by}` }),
              `${itemName(track)}: from “${pname(byId(g))}” to “${pname(byId(nd))}”`
            )
          );
          drawn++;
        });
      });
    }
  }

  /** One arrow (or one arrow for several choices), with its hit area, its menu and its badges. */
  function drawEdge(e, P, opts = {}) {
    const d = pathOf(P);
    const many = e.srcs.length > 1;
    const pe = s('path', { d, class: `edge${e.gated ? ' gated' : ''}${many ? ' multi' : ''}`, 'marker-end': opts.noHead ? null : 'url(#arr)' });
    if (many) {
      pe.style.strokeWidth = Math.min(1.5 + e.srcs.length * 0.7, 4.5);
      present.multi = true;
    }
    if (e.gated) present.sometimes = true;
    else present.choice = true;
    const lines = [],
      fx = [],
      seenFx = new Set();
    e.srcs.forEach(src => {
      const cc = byId(src.pid)?.choices[src.ci];
      if (!cc) return;
      lines.push(
        (many ? `“${src.label || 'Choice with no text'}”` : src.label || 'Choice with no text') +
          (src.gated ? ` (appears only if: ${condSummary(cc, itemName).replace(/^Only if /, '')})` : '') +
          (cc.gives.length ? ` · gets ${joinAnd(cc.gives.map(itemName))}` : '') +
          (cc.takes.length ? ` · loses ${joinAnd(cc.takes.map(itemName))}` : '') +
          Object.keys(cc.adds || {})
            .map(id => ` · ${itemName(id)} ${cc.adds[id] > 0 ? '+' : ''}${cc.adds[id]}`)
            .join('') +
          (cc.check && itemById(cc.check.stat) ? ` · dice check: ${itemName(cc.check.stat)} + 2 dice vs ${cc.check.target}` : '')
      );
      Object.keys(cc.adds || {}).forEach(id => {
        if (!seenFx.has(`n${id}`)) {
          seenFx.add(`n${id}`);
          fx.push([id, cc.adds[id] > 0 ? 1 : 0]);
        }
      });
      cc.gives.forEach(id => {
        if (!seenFx.has(`g${id}`)) {
          seenFx.add(`g${id}`);
          fx.push([id, 1]);
        }
      });
      cc.takes.forEach(id => {
        if (!seenFx.has(`t${id}`)) {
          seenFx.add(`t${id}`);
          fx.push([id, 0]);
        }
      });
    });
    const text = (many ? `${e.srcs.length} choices lead here:\n` : '') + lines.join('\n') + '\nRight-click to change it.';
    tip(pe, text);
    const deco = [];
    if (fx.length && !opts.noBadges) {
      // what picking it gives (solid) or takes (faded)
      const m = at(P, 0.5),
        shown = fx.slice(0, 3),
        bw = shown.length * 15 + 7;
      const bg = tip(s('g', { class: 'efx' }, [s('rect', { x: m[0] - bw / 2, y: m[1] - 10, width: bw, height: 20, rx: 10 })]), text);
      shown.forEach((f, i) => {
        const it = itemById(f[0]),
          ic = itemIcon(it || { kind: 'object' }, 13);
        present[kindOf(it)] = true;
        ic.setAttribute('x', m[0] - bw / 2 + 4 + i * 15);
        ic.setAttribute('y', m[1] - 6.5);
        if (!f[1]) ic.setAttribute('opacity', '0.45');
        bg.appendChild(ic);
      });
      deco.push(bg);
    }
    if (many && !opts.noBadges) {
      const q = at(P, fx.length ? 0.25 : 0.5);
      const cg = tip(
        s('g', { class: 'ecount' }, [
          s('rect', { x: q[0] - 13, y: q[1] - 9, width: 26, height: 18, rx: 9 }),
          s('text', { x: q[0], y: q[1] + 4, 'text-anchor': 'middle' })
        ]),
        text
      );
      cg.querySelector('text').textContent = `×${e.srcs.length}`;
      deco.push(cg);
    }
    layerEdges.appendChild(pe);
    const hit = s('path', { d, class: 'edgehit' });
    const menu = (x, y) => ctxMenu(x, y, edgeMenuFor(e.srcs));
    hit.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      menu(ev.clientX, ev.clientY);
    });
    longPress(hit, menu);
    layerEdges.appendChild(hit);
    deco.forEach(dd => layerTop.appendChild(dd));
    const rec = { el: pe, hit, from: e.from, to: e.to, srcs: e.srcs, P, deco, sdim: false, pk: 0, noHead: !!opts.noHead };
    edgeEls.push(rec);
    return rec;
  }

  /** One page box (or folded run). Drawn at normal size, then moved and scaled into place. */
  function drawNode(n) {
    const pages = n.pages.map(byId),
      p = pages[0],
      nm = pname(p);
    const { cls, isSide } = pageClasses(n);
    const ov = overlayFill(n);
    const tk = track && n.pages.map(id => trackInfo[id]).filter(Boolean);
    let tcls = '';
    if (track) {
      if (tk.length) {
        const t = { give: tk.some(x => x.give), take: tk.some(x => x.take), need: tk.some(x => x.need) };
        tcls = ` tk${t.give ? ' tgive' : ''}${t.take ? ' ttake' : ''}${t.need ? ' tneed' : ''}`;
        if (t.give) present.tgive = true;
        if (t.take) present.ttake = true;
        if (t.need) present.tneed = true;
      } else tcls = ' tkoff';
    }
    const g = s('g', {
      class: cls + (ov?.cls ? ` ${ov.cls}` : '') + tcls,
      tabindex: '0',
      role: 'button',
      'data-id': n.id,
      'aria-label': n.run ? `Open up ${pages.length} pages from ${nm}` : `${nm}, open it`
    });
    const rect = s('rect', { x: 0, y: 0, width: MAP_W, height: MAP_H, rx: 4 });
    if (ov?.style) rect.setAttribute('style', ov.style);
    if (n.run) g.appendChild(s('rect', { class: 'stack', x: 5, y: -5, width: MAP_W, height: MAP_H, rx: 4 }));
    g.appendChild(rect);
    if (p.color && !n.run) g.appendChild(s('rect', { class: `pcol pc-${p.color}`, x: 1, y: 1, width: 7, height: MAP_H - 2, rx: 3 }));
    const badge = p.id === project.start ? 'flag' : !n.run && p.ending ? (p.valence === 'good' ? 'smile' : p.valence === 'bad' ? 'frown' : '') : '';
    const lim = badge ? 19 : 24;
    const t1 = s('text', { x: 10, y: 24 });
    t1.textContent = nm.length > lim ? `${nm.slice(0, lim - 1)}…` : nm;
    g.appendChild(t1);
    if (badge) {
      const bi = icon(badge, 16);
      bi.setAttribute('x', MAP_W - 24);
      bi.setAttribute('y', 8);
      g.appendChild(bi);
    }
    if (p.note && !n.run) {
      const ni = icon('note', 14);
      ni.setAttribute('x', MAP_W - (badge ? 42 : 24));
      ni.setAttribute('y', 9);
      const ng = s('g', { class: 'nnote' });
      ng.appendChild(ni);
      g.appendChild(ng);
    }
    let gives = [],
      takes = [];
    pages.forEach(q => {
      gives = gives.concat(q.gives);
      takes = takes.concat(q.takes);
    });
    const fxl = gives.concat(takes);
    if (fxl.length) {
      const fg = tip(
        s('g', { class: 'stop' }),
        `${n.run ? 'In these pages the player ' : 'Here the player '}${[gives.length ? `gets ${joinAnd(gives.map(itemName))}` : '', takes.length ? `loses ${joinAnd(takes.map(itemName))}` : ''].filter(Boolean).join(' and ')}.`
      );
      fxl.slice(0, 5).forEach((id, i) => {
        const it = itemById(id),
          ic = itemIcon(it || { kind: 'object' }, 14);
        present[kindOf(it)] = true;
        ic.setAttribute('x', MAP_W - 8 - 15 * (i + 1));
        ic.setAttribute('y', MAP_H - 19);
        if (i >= gives.length) ic.setAttribute('opacity', '0.45');
        fg.appendChild(ic);
      });
      g.appendChild(fg);
    }
    const t2 = s('text', { x: 10, y: 43, class: 'sub' });
    t2.textContent = ov?.label
      ? `${ov.label} of players`
      : n.run
        ? `+ ${pages.length - 1} more page${pages.length === 2 ? '' : 's'}`
        : (p.id === project.start ? 'Start · ' : '') +
          (p.ending
            ? p.valence === 'good'
              ? 'Good ending'
              : p.valence === 'bad'
                ? 'Bad ending'
                : 'Ending'
            : `${p.choices.length} choice${p.choices.length === 1 ? '' : 's'}`) +
          (n.loose ? ' · not linked' : isSide ? ' · side page' : '');
    g.appendChild(t2);
    if (ov?.bar) {
      // ending odds as a thin bar along the bottom: good, bad, neutral, stuck
      let x = 0;
      [
        ['good', 'okbar'],
        ['bad', 'badbar'],
        ['neutral', 'neubar'],
        ['stuck', 'stuckbar']
      ].forEach(([k, c]) => {
        const wd = (MAP_W * ov.bar[k]) / ov.bar.n;
        if (wd <= 0) return;
        g.appendChild(s('rect', { x, y: MAP_H - 4, width: wd, height: 4, class: c }));
        x += wd;
      });
    }
    tip(g, nodeTip(n, isSide));
    const cx = n.cx ?? n.x + n.w / 2,
      cy = n.cy ?? n.y + n.h / 2;
    n.base = { cx, cy, k: n.k || 1 };
    g.setAttribute('transform', `translate(${cx - (MAP_W * n.base.k) / 2} ${cy - (MAP_H * n.base.k) / 2}) scale(${n.base.k})`);
    wireNode(
      g,
      n,
      () => {
        if (n.run) {
          mapOpen[p.id] = true;
          mapRedraw();
        } else openPage(p);
      },
      () =>
        n.run
          ? [
              { header: `${pages.length} pages in a row` },
              {
                label: 'Open up this run',
                fn() {
                  mapOpen[p.id] = true;
                  mapRedraw();
                }
              },
              { sep: true }
            ].concat(
              pages.map(q => ({
                label: pname(q),
                sub: [
                  {
                    label: 'Edit this page',
                    fn() {
                      openPage(q);
                    }
                  },
                  {
                    label: 'Play from here',
                    fn() {
                      playFrom(q.id);
                    }
                  }
                ]
              }))
            )
          : pageMenu(p)
    );
    n.el = g;
    nodeEls[n.id] = g;
    layerNodes.appendChild(g);
  }

  /** Clicks, keys, menus and neighbor highlighting for any page mark. */
  function wireNode(el, n, open, menuFor) {
    el.addEventListener('click', ev => {
      if (moved) return;
      if (ev.pointerType === 'touch' || el._touch) {
        el._touch = false;
        if (mapPin !== n.id) {
          pin(n.id);
          return;
        }
      }
      open();
    });
    el.addEventListener('pointerdown', ev => {
      el._touch = ev.pointerType === 'touch';
    });
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        open();
      }
    });
    el.addEventListener('focus', () => light(n.id));
    el.addEventListener('blur', () => light(mapPin));
    el.addEventListener('pointerenter', ev => {
      if (ev.pointerType !== 'touch') light(n.id);
    });
    el.addEventListener('pointerleave', ev => {
      if (ev.pointerType !== 'touch') light(mapPin);
    });
    el.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      let { clientX: x, clientY: y } = ev;
      if (!x && !y) {
        const r = el.getBoundingClientRect();
        x = r.left + 20;
        y = r.top + 20;
      }
      ctxMenu(x, y, menuFor(), viaKeys);
    });
    longPress(el, (x, y) => ctxMenu(x, y, menuFor()));
  }

  /* neighbor highlight: the page, the pages that lead to it and the pages it leads to */
  function light(id) {
    box.classList.toggle('nh', !!id);
    const near = new Set(id ? [id] : []);
    edgeEls.forEach(e => {
      const on = !!id && (e.from === id || e.to === id);
      e.el.classList.toggle('nh-on', on);
      e.deco.forEach(d => d.classList.toggle('nh-on', on));
      if (on) {
        near.add(e.from);
        near.add(e.to);
      }
    });
    for (const k in nodeEls) {
      nodeEls[k].classList.toggle('nh-on', near.has(k));
      nodeEls[k].classList.toggle('nh-me', k === id);
    }
    if (id) {
      const ins = edgeEls.filter(e => e.to === id && e.from !== id).length,
        outs = edgeEls.filter(e => e.from === id && e.to !== id).length;
      const nn = L.pos?.[id] ?? L.nodes?.find(x => x.id === id);
      count.textContent = nn && !nn.seg ? `“${pname(byId(nn.pages?.[0] ?? id))}”: ${ins} arrow${ins === 1 ? '' : 's'} in, ${outs} out` : '';
    } else applySearchCount();
  }
  function pin(id) {
    mapPin = id;
    light(id);
  }

  /* ----- arc diagram ----- */
  function drawArc() {
    const y0 = L.baseline;
    layerBack.appendChild(s('line', { x1: 20, y1: y0, x2: W - 20, y2: y0, class: 'arcbase' }));
    L.edges.forEach(e => {
      const a = L.pos[e.from],
        b = L.pos[e.to];
      if (a === b) {
        const P = [a.cx, y0 - 7, a.cx - 14, y0 - 40, a.cx + 14, y0 - 40, a.cx + 3, y0 - 7 - HEAD];
        drawEdge(e, P, { noBadges: false });
        return;
      }
      const fwd = b.cx > a.cx,
        span = Math.abs(b.cx - a.cx),
        lift = Math.min(span * 0.5, y0 - 30) * (fwd ? 1 : 0.6);
      const x1 = b.cx + (fwd ? -1 : 1) * 2,
        yEnd = y0 - 9 - HEAD * 0.7;
      const P = [a.cx, y0 - 7, a.cx, y0 - lift * 1.33, x1, y0 - lift * 1.33, x1, yEnd];
      const r = drawEdge(e, P);
      if (!fwd) r.el.classList.add('backarc');
    });
    L.nodes.forEach(n => {
      const p = byId(n.pages[0]),
        { cls, isSide } = pageClasses(n),
        ov = overlayFill(n);
      const r = 6 + (mapOpts.traffic ? 6 * n.traffic : 0);
      const g = s('g', { class: `${cls} dot${ov?.cls ? ` ${ov.cls}` : ''}`, tabindex: '0', role: 'button', 'aria-label': `${pname(p)}, open it` });
      const c = s('circle', { cx: n.cx, cy: n.cy, r });
      if (ov?.style) c.setAttribute('style', ov.style);
      const t = s('text', { x: n.cx + 4, y: n.cy + 18, transform: `rotate(40 ${n.cx + 4} ${n.cy + 18})`, class: 'arclabel' });
      const nm = pname(p);
      t.textContent = nm.length > 24 ? `${nm.slice(0, 23)}…` : nm;
      g.append(c, t);
      tip(g, nodeTip(n, isSide));
      wireNode(
        g,
        n,
        () => openPage(p),
        () => pageMenu(p)
      );
      n.el = g;
      nodeEls[n.id] = g;
      layerNodes.appendChild(g);
    });
  }

  /* ----- matrix ----- */
  function drawMatrix() {
    const { cell: C, head: H0 } = L,
      N = L.nodes.length;
    for (let i = 0; i <= N; i++) {
      layerBack.appendChild(s('line', { x1: H0, y1: H0 + i * C, x2: H0 + N * C, y2: H0 + i * C, class: 'mgrid' }));
      layerBack.appendChild(s('line', { x1: H0 + i * C, y1: H0, x2: H0 + i * C, y2: H0 + N * C, class: 'mgrid' }));
    }
    L.nodes.forEach(n => {
      layerBack.appendChild(s('rect', { x: H0 + n.mi * C, y: H0 + n.mi * C, width: C, height: C, class: 'mdiag' }));
      const p = byId(n.pages[0]),
        { cls } = pageClasses(n),
        nm = pname(p),
        short = nm.length > 20 ? `${nm.slice(0, 19)}…` : nm;
      const rowL = s('text', { x: H0 - 6, y: H0 + n.mi * C + C / 2 + 4, 'text-anchor': 'end', class: 'mlabel' });
      rowL.textContent = short;
      const colL = s('text', {
        x: H0 + n.mi * C + C / 2 + 4,
        y: H0 - 6,
        transform: `rotate(-55 ${H0 + n.mi * C + C / 2 + 4} ${H0 - 6})`,
        class: 'mlabel'
      });
      colL.textContent = short;
      const g = s('g', { class: `${cls} mrow`, tabindex: '0', role: 'button', 'aria-label': `${nm}, open it` }, [rowL, colL]);
      tip(g, `${nm}\nRow: choices on this page. Column: choices that lead here. Click to edit.`);
      wireNode(
        g,
        n,
        () => openPage(p),
        () => pageMenu(p)
      );
      n.el = g;
      nodeEls[n.id] = g;
      layerNodes.appendChild(g);
    });
    L.edges.forEach(e => {
      const a = L.pos[e.from],
        b = L.pos[e.to],
        many = e.srcs.length;
      const r = s('rect', {
        x: H0 + b.mi * C + 2,
        y: H0 + a.mi * C + 2,
        width: C - 4,
        height: C - 4,
        rx: 2,
        class: `mcell${e.gated ? ' gated' : ''}${b.mi < a.mi ? ' back' : ''}`
      });
      const lines = e.srcs.map(src => `“${src.label || 'Choice with no text'}”`).join('\n');
      const g = tip(s('g', { class: 'mc' }, [r]), `${pname(byId(a.pages[0]))} → ${pname(byId(b.pages[0]))}\n${lines}\nRight-click to change.`);
      if (many > 1) {
        const t = s('text', { x: H0 + b.mi * C + C / 2, y: H0 + a.mi * C + C / 2 + 4, 'text-anchor': 'middle', class: 'mcount' });
        t.textContent = many;
        g.appendChild(t);
        present.multi = true;
      }
      if (e.gated) present.sometimes = true;
      else present.choice = true;
      g.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        ctxMenu(ev.clientX, ev.clientY, edgeMenuFor(e.srcs));
      });
      g.addEventListener('click', ev => ctxMenu(ev.clientX, ev.clientY, edgeMenuFor(e.srcs)));
      layerEdges.appendChild(g);
      edgeEls.push({ el: r, from: e.from, to: e.to, srcs: e.srcs, deco: [], sdim: false, pk: 0, cell: true });
    });
  }

  /* ----- river of players ----- */
  /* ----- river of players -----
     Bands are as wide as the share of simulated players who take that choice. Click a band to follow the
     players who took it, or a page bar to trace everyone who saw that page: only their flow stays lit, all
     the way to how they ended, and the panel on the right gives the numbers. Click again (or Esc) to clear. */
  function drawRiver() {
    const k = 420 / Math.max(1, pt.runs);
    const sel = mapRiverSel && L.nodes.some(n => n.id === (mapRiverSel.page ?? mapRiverSel.from)) ? mapRiverSel : null;
    const pick = sel ? playtestFilter(pt, sel) : null;
    const sub = pick ? playtestCount(pt, pick) : null;
    box.classList.toggle('rsel', !!sel);
    const outs = {},
      ins = {};
    L.edges.forEach(e => {
      e.flow = pt.moves[`${e.from}>${e.to}`] || 0;
      e.subFlow = sub ? sub.moves[`${e.from}>${e.to}`] || 0 : 0;
      (outs[e.from] ||= []).push(e);
      (ins[e.to] ||= []).push(e);
    });
    const yA = {},
      yB = {};
    for (const id in outs) {
      let y = L.pos[id].y;
      outs[id]
        .filter(e => e.kind === 'fwd')
        .sort((a, b) => L.pos[a.to].y - L.pos[b.to].y)
        .forEach(e => {
          yA[L.edges.indexOf(e)] = y;
          y += Math.min(e.flow * k, L.pos[id].h);
        });
    }
    for (const id in ins) {
      let y = L.pos[id].y;
      ins[id]
        .filter(e => e.kind === 'fwd')
        .sort((a, b) => L.pos[a.from].y - L.pos[b.from].y)
        .forEach(e => {
          yB[L.edges.indexOf(e)] = y;
          y += Math.min(e.flow * k, L.pos[id].h);
        });
    }
    const curve = list => {
      let dd = '';
      for (let j = 1; j < list.length; j++) {
        const [px, py] = list[j - 1],
          [qx, qy] = list[j],
          mm = (qx - px) / 2;
        dd += ` C${px + mm} ${py} ${qx - mm} ${qy} ${qx} ${qy}`;
      }
      return dd;
    };
    /** A band from (x0, y0) to (x1, y1), w thick, through the arrow's waypoints. */
    const bandPath = (e, x0, y0, x1, y1, w) => {
      const top = [[x0, y0], ...e.pts.map(p2 => [p2[0], p2[1] - w / 2]), [x1, y1]];
      const bottom = [[x1, y1 + w], ...e.pts.map(p2 => [p2[0], p2[1] + w / 2]).reverse(), [x0, y0 + w]];
      return `M${x0} ${y0}${curve(top)} L${x1} ${y1 + w}${curve(bottom)} Z`;
    };
    const choose = next => {
      mapRiverSel = next;
      mapRedraw();
    };
    L.edges.forEach((e, i) => {
      const a = L.pos[e.from],
        b = L.pos[e.to];
      const odds = oddsOf(b.pages),
        lean = odds.n ? (odds.good - odds.bad) / odds.n : 0;
      const label = e.srcs.map(x => `“${x.label || 'Choice with no text'}”`).join('\n');
      const isSel = sel && sel.from === e.from && sel.to === e.to;
      if (e.kind === 'fwd' && e.flow > 0) {
        const w = Math.max(1, Math.min(e.flow * k, a.h, b.h)),
          x0 = a.x + a.w,
          x1 = b.x,
          y0 = yA[i],
          y1 = yB[i];
        const band = tip(
          s('path', {
            d: bandPath(e, x0, y0, x1, y1, w),
            class: `band${sel ? ' faint' : ''}${isSel ? ' chosen' : ''}`,
            style: `fill:color-mix(in srgb, ${lean >= 0 ? 'var(--okfill)' : 'var(--badfill)'} ${Math.round(25 + Math.abs(lean) * 75)}%, var(--line))`
          }),
          `${pname(byId(e.from))} → ${pname(byId(e.to))}\n${pct(e.flow, pt.runs)} of players take this (${e.flow.toLocaleString('en')} times).\n${label}\nClick to follow these players; right-click to change the choice.`
        );
        band.addEventListener('click', ev => {
          ev.stopPropagation();
          if (!moved) choose(isSel ? null : { from: e.from, to: e.to });
        });
        band.addEventListener('contextmenu', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          ctxMenu(ev.clientX, ev.clientY, edgeMenuFor(e.srcs));
        });
        layerEdges.appendChild(band);
        edgeEls.push({ el: band, from: e.from, to: e.to, srcs: e.srcs, deco: [], sdim: false, pk: 0, band: true });
        if (sub && e.subFlow) {
          // the followed players' share of this band, drawn on top along its upper edge
          const sw = Math.max(1, Math.min(e.subFlow * k, w));
          layerEdges.appendChild(
            s('path', {
              d: bandPath(e, x0, y0, x1, y1, sw),
              class: 'band lit',
              style: `fill:color-mix(in srgb, ${lean >= 0 ? 'var(--okfill)' : 'var(--badfill)'} 90%, var(--fg))`
            })
          );
        }
        present.choice = true;
      } else {
        const P = [a.x + a.w / 2, a.y, a.x + a.w / 2, Math.min(a.y, b.y) - 40, b.x + b.w / 2, Math.min(a.y, b.y) - 40, b.x + b.w / 2, b.y - HEAD];
        const r = drawEdge(e, P, { noBadges: true });
        r.el.classList.add(e.flow ? 'riverback' : 'rivernone');
        if (sub && e.subFlow) r.el.classList.add('lit');
      }
    });
    L.nodes.forEach(n => {
      const p = byId(n.pages[0]),
        { cls } = pageClasses(n),
        v = pt.visits[p.id] || 0,
        sv = sub ? sub.visits[p.id] || 0 : 0;
      const isSel = sel?.page === p.id;
      const g = s('g', {
        class: `${cls} bar${isSel ? ' chosen' : ''}${sub && !sv ? ' faint' : ''}`,
        tabindex: '0',
        role: 'button',
        'data-id': n.id,
        'aria-label': `${pname(p)}: trace the players who see it`
      });
      g.appendChild(s('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: 2 }));
      if (sub && sv) g.appendChild(s('rect', { x: n.x - 3, y: n.y, width: n.w + 6, height: Math.max(2, sv * k), rx: 2, class: 'barlit' }));
      const t = s('text', { x: n.x + n.w + 5, y: n.y + Math.min(n.h, 30) / 2 + 4, class: 'riverlabel' });
      const nm = pname(p);
      t.textContent = `${nm.length > 22 ? `${nm.slice(0, 21)}…` : nm} · ${sub ? `${pct(sv, sub.count)} of these` : pct(v, pt.runs)}`;
      g.appendChild(t);
      tip(g, `${nm}\n${pct(v, pt.runs)} of players see this page.\nClick to trace them; double-click to edit the page.`);
      wireNode(
        g,
        n,
        () => choose(isSel ? null : { page: p.id }),
        () => pageMenu(p)
      );
      g.addEventListener('dblclick', ev => {
        ev.stopPropagation();
        openPage(p);
      });
      n.el = g;
      nodeEls[n.id] = g;
      layerNodes.appendChild(g);
    });
    riverPanel = riverInfo(sel, pick, sub);
  }

  /** The River's panel: what the simulated players did overall, or what the followed ones did. */
  function riverInfo(sel, pick, sub) {
    const total = pt.runs,
      data = sub || { ...pt, count: total };
    const panel = h('div', { class: 'rpanel', role: 'region', 'aria-label': 'Simulated players' });
    const name = id => pname(byId(id));
    let head;
    if (!sel) head = `${total.toLocaleString('en')} players`;
    else if (sel.page) head = `Players who saw “${name(sel.page)}”`;
    else head = `Players who went from “${name(sel.from)}” to “${name(sel.to)}”`;
    panel.appendChild(h('div', { class: 'rhead', text: head }));
    if (sel)
      panel.appendChild(
        h('div', { class: 'hint', text: `${data.count.toLocaleString('en')} of ${total.toLocaleString('en')} (${pct(data.count, total)})` })
      );
    /* how they ended, as a bar and a list of endings */
    const o = data.outcome,
      n = Math.max(1, data.count);
    const barEl = h('div', { class: 'obar', 'aria-hidden': 'true' });
    [
      ['good', 'ok'],
      ['bad', 'bad'],
      ['neutral', 'neu'],
      ['stuck', 'stuck']
    ].forEach(([k2, c]) => {
      if (o[k2]) barEl.appendChild(h('span', { class: c, style: `width:${(o[k2] / n) * 100}%` }));
    });
    panel.appendChild(barEl);
    const outs = [];
    if (o.good) outs.push(`${pct(o.good, n)} end well`);
    if (o.bad) outs.push(`${pct(o.bad, n)} end badly`);
    if (o.neutral) outs.push(`${pct(o.neutral, n)} reach a plain ending`);
    if (o.stuck) outs.push(`${pct(o.stuck, n)} get stuck or wander off`);
    panel.appendChild(h('div', { text: `${outs.join(', ')}.` }));
    const endCount = {};
    (pick || pt.paths.map((_, i) => i)).forEach(r => {
      const id = pt.ends[r];
      if (id) endCount[id] = (endCount[id] || 0) + 1;
    });
    const ends = Object.entries(endCount)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5);
    if (ends.length)
      panel.appendChild(
        h(
          'ul',
          { class: 'rlist' },
          ends.map(([id, c]) => h('li', {}, [h('span', { text: name(id) }), h('b', { text: pct(c, n) })]))
        )
      );
    /* for a page: where they came from and where they went next */
    if (sel?.page) {
      const from = {},
        to = {};
      pick.forEach(r => {
        const path = pt.paths[r],
          at = pt.ids.indexOf(sel.page);
        for (let i = 0; i < path.length; i++)
          if (path[i] === at) {
            if (i) from[pt.ids[path[i - 1]]] = (from[pt.ids[path[i - 1]]] || 0) + 1;
            if (i + 1 < path.length) to[pt.ids[path[i + 1]]] = (to[pt.ids[path[i + 1]]] || 0) + 1;
          }
      });
      const top = (m, title) => {
        const rows = Object.entries(m)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 4);
        const sum = rows.reduce((t, r) => t + r[1], 0) || 1;
        if (rows.length)
          panel.append(
            h('div', { class: 'rsub', text: title }),
            h(
              'ul',
              { class: 'rlist' },
              rows.map(([id, c]) => h('li', {}, [h('span', { text: name(id) }), h('b', { text: pct(c, sum) })]))
            )
          );
      };
      top(from, 'Came from');
      top(to, 'Went on to');
    }
    const btns = [];
    if (sel)
      btns.push(
        h('button', {
          class: 'btn small',
          type: 'button',
          text: 'Clear',
          onclick() {
            mapRiverSel = null;
            mapRedraw();
          }
        })
      );
    if (sel?.page)
      btns.push(
        h('button', {
          class: 'btn small',
          type: 'button',
          text: 'Edit this page',
          onclick() {
            openPage(byId(sel.page));
          }
        })
      );
    if (!sel)
      panel.appendChild(
        h('div', { class: 'hint', text: 'Click a band to follow the players who took that choice, or a page to trace everyone who saw it.' })
      );
    btns.push(h('button', { class: 'btn small', type: 'button', text: 'Full results', onclick: () => playReport() }));
    panel.appendChild(h('div', { class: 'row tight' }, btns));
    return panel;
  }
  let riverPanel = null;

  /* ----- story shape -----
     Read left to right. A circle is a page every player passes through (a choke point). Each capsule is the
     stretch of story between two of them: its pages are the dots inside it (green and red dots are good and
     bad endings), and its label says how that stretch is built. Click a capsule to see its pages in Flow. */
  function drawShape() {
    const y = 190,
      segs = L.segs,
      marks = [];
    let x = 50;
    segs.forEach((sg, i) => {
      const cp = byId(sg.from);
      marks.push({ kind: 'choke', id: sg.from, x: x + 20, i });
      x += 64;
      const n = sg.pages.length,
        cols = Math.max(1, Math.min(n, 20)),
        rows = Math.ceil(n / cols);
      const [name, ...more] = sg.pattern.split(', ');
      const caption = [`${n} page${n === 1 ? '' : 's'}`, sg.to && sg.routes > 1 ? `${sg.routes} ways through` : '', ...more]
        .filter(Boolean)
        .join(' · ');
      const w = Math.max(200, 48 + cols * 18, caption.length * 6.4 + 44, name.length * 9.5 + 44),
        hgt = Math.max(84, 66 + rows * 18);
      if (n) {
        marks.push({ kind: 'seg', sg, x, w, hgt, cols, name, caption });
        x += w + 24;
      } else if (sg.to) {
        marks.push({ kind: 'road', sg, x: x + 4 });
        x += 34;
      } // the next choke point follows directly: just a line
      else if (!cp.ending) {
        marks.push({ kind: 'open', x: x - 26 });
        x += 130;
      } // the story stops here for now
    });
    /* a small legend, drawn into the picture so it is always next to what it explains */
    const lg = s('g', { class: 'shapelegend' });
    lg.appendChild(s('circle', { cx: 60, cy: 26, r: 9, class: 'lgchoke' }));
    const l1 = s('text', { x: 76, y: 31 });
    l1.textContent = 'Every player passes here';
    lg.appendChild(l1);
    lg.appendChild(s('rect', { x: 272, y: 16, width: 34, height: 20, rx: 10, class: 'lgstretch' }));
    const l2 = s('text', { x: 314, y: 31 });
    l2.textContent = 'A stretch of the story: each dot is one of its pages';
    lg.appendChild(l2);
    [
      ['pagedot', 'page'],
      ['okdot', 'good ending'],
      ['baddot', 'bad ending']
    ].forEach(([c, t], j) => {
      lg.appendChild(s('circle', { cx: 700 + j * 110, cy: 26, r: 6, class: c }));
      const tt = s('text', { x: 712 + j * 110, y: 31 });
      tt.textContent = t;
      lg.appendChild(tt);
    });
    layerBack.appendChild(lg);
    const nodeLike = [];
    const dotClass = q => (q.ending ? (q.valence === 'good' ? 'okdot' : q.valence === 'bad' ? 'baddot' : 'neudot') : 'pagedot');
    marks.forEach((m, mi) => {
      if (m.kind === 'choke') {
        const p = byId(m.id),
          n = { id: m.id, pages: [m.id], cx: m.x, cy: y };
        const { cls } = pageClasses(n);
        const g = s('g', {
          class: `${cls} chokepoint`,
          tabindex: '0',
          role: 'button',
          'aria-label': `${pname(p)}: every player passes here. Open it`
        });
        g.appendChild(s('circle', { cx: m.x, cy: y, r: 18 }));
        /* the name in up to two short lines, above or below the circle by turns, so neighbors never collide */
        const nm = pname(p),
          lines = wrapWords(nm, 13, 2),
          below = m.i % 2 === 1;
        const t = s('text', { x: m.x, y: below ? y + 38 : y - 28 - (lines.length - 1) * 15, 'text-anchor': 'middle', class: 'chokename' });
        lines.forEach((ln, li) => {
          const ts = s('tspan', { x: m.x, dy: li ? 15 : 0 });
          ts.textContent = ln;
          t.appendChild(ts);
        });
        g.appendChild(t);
        tip(g, `${nm}\nEvery player passes through this page on the way to the goal. Click to edit.`);
        wireNode(
          g,
          n,
          () => openPage(p),
          () => pageMenu(p)
        );
        n.el = g;
        nodeEls[n.id] = g;
        layerNodes.appendChild(g);
        nodeLike.push(n);
        const nx = marks.slice(mi + 1).find(k => k.kind !== 'road');
        if (nx && nx.kind !== 'open')
          layerBack.appendChild(s('line', { x1: m.x + 18, y1: y, x2: nx.kind === 'seg' ? nx.x : nx.x - 18, y2: y, class: 'shapeline' }));
        present.choke = true;
      } else if (m.kind === 'open') {
        layerBack.appendChild(s('line', { x1: m.x, y1: y, x2: m.x + 70, y2: y, class: 'shapeline open' }));
        const t = s('text', { x: m.x + 78, y: y + 4, class: 'roadnote' });
        t.textContent = 'still being written';
        layerBack.appendChild(t);
      } else if (m.kind === 'road') {
        if (m.sg.routes > 1) {
          const t = s('text', { x: m.x - 12, y: y - 7, 'text-anchor': 'middle', class: 'roadnote' });
          t.textContent = `×${m.sg.routes}`;
          tip(t, `${m.sg.routes} choices lead straight on`);
          layerBack.appendChild(t);
        }
      } else {
        const { sg, x: sx, w, hgt, cols } = m,
          next = marks[mi + 1],
          top = y - hgt / 2;
        if (next) layerBack.appendChild(s('line', { x1: sx + w, y1: y, x2: next.x - 18, y2: y, class: 'shapeline' }));
        const g = s('g', {
          class: `stretch${!sg.to ? ' last' : ''}`,
          tabindex: '0',
          role: 'button',
          'aria-label': `${sg.pattern}: show its pages in Flow`
        });
        g.appendChild(s('rect', { x: sx, y: top, width: w, height: hgt, rx: Math.min(hgt / 2, 34) }));
        const t1 = s('text', { x: sx + w / 2, y: top + 24, 'text-anchor': 'middle', class: 'segname' });
        t1.textContent = m.name;
        const t2 = s('text', { x: sx + w / 2, y: top + 42, 'text-anchor': 'middle', class: 'sub' });
        t2.textContent = m.caption;
        g.append(t1, t2);
        /* one dot per page in the stretch, in story order; each opens its page */
        const order = sg.pages.slice().sort((a, b) => (L.G.imp.depth[a] ?? 99) - (L.G.imp.depth[b] ?? 99));
        const x0 = sx + w / 2 - ((Math.min(cols, order.length) - 1) * 18) / 2;
        order.forEach((pid, j) => {
          const q = byId(pid),
            dot = s('circle', {
              cx: x0 + (j % cols) * 18,
              cy: top + 62 + Math.floor(j / cols) * 18,
              r: 6,
              class: `${dotClass(q)} pdot`,
              tabindex: '-1'
            });
          tip(dot, `${pname(q)}${q.ending ? ` (${q.valence || 'plain'} ending)` : ''}\nClick to edit this page.`);
          dot.addEventListener('click', ev => {
            ev.stopPropagation();
            if (!moved) openPage(q);
          });
          g.appendChild(dot);
        });
        tip(
          g,
          `${sg.pattern}.\nIts pages: ${sg.pages.map(pid => pname(byId(pid))).join(', ') || 'none'}.\nClick to see them lit up in Flow; click a dot to edit that page.`
        );
        const go = () => {
          mapPick = new Set([sg.from, ...(sg.to ? [sg.to] : []), ...sg.pages]);
          mapOpts.view = 'flow';
          saveMapOpts();
          mapRedraw();
        };
        g.addEventListener('click', () => {
          if (!moved) go();
        });
        g.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            go();
          }
        });
        layerNodes.appendChild(g);
        nodeLike.push({ id: `seg:${sg.i}`, pages: sg.pages, el: g, seg: true });
      }
    });
    const width = Math.max(x + 60, 1060);
    const height = Math.max(...marks.filter(m => m.kind === 'seg').map(m => y + m.hgt / 2 + 40), 300);
    svg.setAttribute('viewBox', `0 0 ${width} ${height + 30}`);
    L.width = width;
    L.height = height;
    L.nodes = nodeLike;
    L.edges = [];
  }

  if (L.kind === 'nodes' && vname === 'river') drawRiver();
  else if (L.kind === 'nodes') drawNodeViews();
  else if (L.kind === 'arc') drawArc();
  else if (L.kind === 'matrix') drawMatrix();
  else if (L.kind === 'shape') drawShape();

  /* ----- the key sits above the start page when there is room (not on a phone, not once the author has dragged it) ----- */
  let autoRaf = 0;
  function autoKey() {
    const par = key.parentNode;
    if (!par || mapKeyPos || liveZoom !== null || key.hidden) return;
    const reset = () => {
      key.classList.remove('one');
      key.style.left = key.style.top = key.style.right = key.style.bottom = '';
    };
    const st = box.querySelector('.node.start');
    if (window.innerWidth <= 700 || !st || L.nodes.length > 300) return reset();
    const pr = par.getBoundingClientRect(),
      br = box.getBoundingClientRect(),
      s = st.getBoundingClientRect();
    if (s.right < br.left || s.left > br.right) return reset();
    const nodes = [].slice.call(box.querySelectorAll('.node')).filter(n => n !== st);
    /* two columns first; if that would cover a page, one narrow column (taller, so it needs more room above) */
    for (const one of [false, true]) {
      key.classList.toggle('one', one);
      const kw = key.offsetWidth,
        kh = key.offsetHeight;
      const top = s.top - pr.top - kh - 8;
      const left = Math.max(br.left - pr.left + 8, Math.min(s.left - pr.left, br.right - pr.left - kw - 8));
      if (top < br.top - pr.top + 4) continue;
      const x0 = left + pr.left,
        y0 = top + pr.top;
      if (nodes.some(n => {
        const q = n.getBoundingClientRect();
        return q.right > x0 && q.left < x0 + kw && q.bottom > y0 && q.top < y0 + kh;
      })) continue;
      key.style.left = `${left}px`;
      key.style.top = `${top}px`;
      key.style.bottom = 'auto';
      key.style.right = 'auto';
      return;
    }
    reset();
  }
  key.auto = () => {
    cancelAnimationFrame(autoRaf);
    autoRaf = requestAnimationFrame(autoKey);
  };

  /* ----- zoom, fit, center ----- */
  const BHx = () => (L.height || 400) + 30;
  function applyZoom() {
    svg.setAttribute('width', Math.round(L.width * mapZoom));
    svg.setAttribute('height', Math.round(BHx() * mapZoom));
    zlabel.textContent = `${Math.round(mapZoom * 100)}%`;
    mapZoomOf[vname] = mapZoom;
    key.auto();
  }
  /* While the zoom is changing (wheel turns, + and - presses) the drawing is only scaled with a CSS transform on its own layer, which
     the browser does without laying the page out or redrawing the map at every step. About 0.2 s after the last step the real size is
     set (commitZoom), so the text is sharp again. liveZoom is the zoom being shown; mapZoom is the size the drawing really has. */
  let liveZoom = null;
  let liveAnchor = null;
  let liveTimer = 0;
  const curZoom = () => liveZoom ?? mapZoom;
  function zoomTo(z, cx, cy) {
    const t0 = performance.now();
    z = Math.max(0.15, Math.min(2.5, z));
    const cur = curZoom();
    liveAnchor = { rx: (box.scrollLeft + cx) / cur, ry: (box.scrollTop + cy) / cur, cx, cy }; // the point under the cursor stays under it
    liveZoom = z;
    mapZoomOf[vname] = z;
    svg.style.transformOrigin = '0 0';
    svg.style.willChange = 'transform';
    svg.style.transform = `scale(${z / mapZoom})`;
    zlabel.textContent = `${Math.round(z * 100)}%`;
    box.scrollLeft = liveAnchor.rx * z - cx;
    box.scrollTop = liveAnchor.ry * z - cy;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(commitZoom, 200);
    speedNote('map zoom step', performance.now() - t0);
  }
  /** Makes the drawing's real size match the zoom being shown. */
  function commitZoom() {
    clearTimeout(liveTimer);
    if (liveZoom === null || !box.isConnected) return; // a map drawn again meanwhile has its own zoom
    const t0 = performance.now();
    const a = liveAnchor;
    mapZoom = liveZoom;
    liveZoom = null;
    svg.style.transform = '';
    svg.style.willChange = '';
    applyZoom();
    box.scrollLeft = a.rx * mapZoom - a.cx;
    box.scrollTop = a.ry * mapZoom - a.cy;
    speedNote('map zoom settle', performance.now() - t0);
  }
  function zoomBy(f) {
    zoomTo(curZoom() * f, box.clientWidth / 2, box.clientHeight / 2);
  }
  function fit() {
    commitZoom();
    mapZoom = Math.max(0.15, Math.min((box.clientWidth - 8) / L.width, (box.clientHeight - 8) / BHx(), 1.25));
    applyZoom();
    box.scrollLeft = 0;
    box.scrollTop = 0;
  }
  function centerOn(nodeId) {
    commitZoom();
    const n = L.nodes.find(x => x.id === nodeId);
    if (!n) return;
    const cx = n.cx ?? n.x + n.w / 2,
      cy = n.cy ?? n.y + n.h / 2;
    box.scrollLeft = cx * mapZoom - box.clientWidth / 2;
    box.scrollTop = cy * mapZoom - box.clientHeight / 2;
  }

  /* ----- crit paths ----- */
  function paintEdges() {
    const pathsOn = mapGood || mapBad;
    edgeEls.forEach(e => {
      e.el.classList.toggle('dim', e.sdim);
      e.deco.forEach(d => d.classList.toggle('dim', e.sdim));
      e.el.classList.toggle('pg', (e.pk & 1) > 0);
      e.el.classList.toggle('pb', (e.pk & 2) > 0);
      if (!e.cell && !e.band && !e.noHead)
        e.el.setAttribute('marker-end', `url(#${e.pk ? (e.pk === 1 ? 'arrg' : e.pk === 2 ? 'arrb' : 'arrl') : e.sdim || pathsOn ? 'arrd' : 'arr'})`);
    });
  }
  function applyPaths() {
    const pagePk = {},
      edgePk = {};
    if (an && (mapGood || mapBad) && nodeView)
      an.endings.forEach(en => {
        const k = en.valence === 'good' ? (mapGood ? 1 : 0) : en.valence === 'bad' ? (mapBad ? 2 : 0) : 0;
        if (!k || !en.reachable) return;
        let c = project.start;
        pagePk[c] = (pagePk[c] || 0) | k;
        en.path.forEach(st => {
          if (st.given) return;
          edgePk[`${c}:${st.ci}`] = (edgePk[`${c}:${st.ci}`] || 0) | k;
          c = st.to;
          pagePk[c] = (pagePk[c] || 0) | k;
        });
      });
    box.classList.toggle('paths-on', !!((mapGood || mapBad) && nodeView));
    edgeEls.forEach(e => {
      e.pk = 0;
      e.srcs.forEach(src => {
        e.pk |= edgePk[`${src.pid}:${src.ci}`] || 0;
      });
    });
    L.nodes.forEach(n => {
      if (!n.el) return;
      let pk = 0;
      (n.pages || []).forEach(id => {
        pk |= pagePk[id] || 0;
      });
      n.el.classList.toggle('onp', pk > 0);
      n.el.classList.toggle('pg', (pk & 1) > 0);
      n.el.classList.toggle('pb', (pk & 2) > 0);
    });
    present.gpath = edgeEls.some(e => e.pk & 1);
    present.bpath = edgeEls.some(e => e.pk & 2);
    paintEdges();
    key.update(present);
  }

  /* ----- search ----- */
  let searchText = '';
  function applySearchCount() {
    count.textContent = searchText;
  }
  function applySearch(jump) {
    const terms = mapQuery
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);
    const hitNode = {};
    let pagesHit = 0,
      total = 0,
      first = null;
    const picked = mapPick;
    L.nodes.forEach(n => {
      if (!n.el) return;
      let c = 0;
      (n.pages || []).forEach(id => {
        const p = byId(id);
        const k = terms.length && p ? pageHits(p, terms) : 0;
        if (k) {
          pagesHit++;
          total += k;
          c += k;
        }
      });
      const isPicked = picked && (n.pages || []).some(id => picked.has(id));
      const hit = terms.length ? c > 0 : !!isPicked;
      hitNode[n.id] = hit;
      if (hit && !first) first = n.id;
      n.el.classList.toggle('hit', hit);
      n.el.classList.toggle('dim', (terms.length > 0 || !!picked) && !hit);
    });
    edgeEls.forEach(e => {
      e.sdim = (terms.length > 0 || !!picked) && !(hitNode[e.from] || hitNode[e.to]);
    });
    present.match = terms.length > 0 && pagesHit > 0;
    paintEdges();
    key.update(present);
    searchText = terms.length
      ? pagesHit
        ? `${total} match${total === 1 ? '' : 'es'} on ${pagesHit} of ${project.passages.length} pages`
        : 'No matches'
      : '';
    applySearchCount();
    if (jump && first) centerOn(first);
  }

  /* ----- pan, menus, double-click, zoom wheel ----- */
  box.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const sx = e.clientX,
      sy = e.clientY,
      sl = box.scrollLeft,
      st = box.scrollTop;
    moved = false;
    const mv = ev => {
      const dx = ev.clientX - sx,
        dy = ev.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      moved = true;
      box.classList.add('panning');
      box.scrollLeft = sl - dx;
      box.scrollTop = st - dy;
      ev.preventDefault();
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      box.classList.remove('panning');
      setTimeout(() => {
        moved = false;
      }, 0);
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  });
  box.addEventListener('click', e => {
    if (!moved && e.target.closest && !e.target.closest('g[role=button], .edgehit, .efx, .ecount, .mc, .band') && mapPin) {
      mapPin = null;
      light(null);
    }
  });
  box.addEventListener('contextmenu', e => {
    e.preventDefault();
    ctxMenu(e.clientX, e.clientY, mapMenu(), viaKeys);
  });
  longPress(box, (x, y) => ctxMenu(x, y, mapMenu()));
  box.addEventListener('dblclick', e => {
    if (!e.target.closest('g[role=button], .edgehit, .efx, .ecount, .mc, .band')) newMapPage();
  });
  function newMapPage() {
    promptDialog('New page', [{ label: 'Page name (only you see this)', placeholder: 'For example: Front door' }], 'Add page').then(v => {
      if (!v) return;
      const np = makePassage(v[0] || 'Untitled page');
      project.passages.push(np);
      selId = np.id;
      refresh();
      toast('Added. Right-click a page and choose “Add a choice that leads to…” to connect it.');
    });
  }
  function mapMenu() {
    return [
      { label: 'New page…', fn: newMapPage },
      {
        label: 'Play from the beginning',
        fn() {
          playFrom(project.start);
        }
      },
      { sep: true },
      {
        label: 'View',
        sub: mapViews().map(v => ({
          label: v[1],
          check: v[0] === vname,
          fn() {
            mapOpts.view = v[0];
            saveMapOpts();
            mapRedraw();
          }
        }))
      },
      { label: 'Compare views…', fn: () => compareViews() },
      { sep: true },
      { label: 'Zoom in', fn: () => zoomBy(1.25) },
      { label: 'Zoom out', fn: () => zoomBy(1 / 1.25) },
      { label: 'Fit', fn: fit },
      {
        label: 'Clear the search and lights',
        disabled: !mapQuery && !mapPin && !mapPick,
        fn() {
          mapQuery = '';
          search.value = '';
          mapPin = null;
          mapPick = null;
          mapRedraw();
        }
      }
    ];
  }
  box.addEventListener(
    'scroll',
    () => {
      mapScroll[vname] = { l: box.scrollLeft, t: box.scrollTop };
      key.auto();
    },
    { passive: true }
  );
  box.addEventListener(
    'wheel',
    e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = box.getBoundingClientRect();
      zoomTo(curZoom() * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false }
  );

  main.appendChild(
    h('div', { class: 'mapwrapall' }, [
      bar,
      notes.length
        ? h(
            'div',
            { class: 'mapnotes' },
            notes.map(x => (typeof x === 'string' ? h('span', { text: x }) : x))
          )
        : null,
      h('div', { class: 'mapwrap' }, [box, key, riverPanel])
    ])
  );
  sizeMapBox();
  const firstVisit = mapZoomOf[vname] === undefined;
  mapZoom = mapZoomOf[vname] ?? 1;
  applyZoom();
  applyPaths();
  applySearch(false);
  if (firstVisit) {
    /* the first look at a view: as much as fits, but never so small that page names cannot be read */
    const fitZ = Math.min((box.clientWidth - 8) / L.width, (box.clientHeight - 8) / BHx());
    mapZoom = Math.max(box.clientWidth < 700 ? 0.55 : 0.75, Math.min(fitZ, 1.4));
    applyZoom();
    if (fitZ < mapZoom) requestAnimationFrame(() => centerOn(L.G?.groupOf?.[project.start] ?? project.start));
  } else if (mapScroll[vname]) {
    box.scrollLeft = mapScroll[vname].l;
    box.scrollTop = mapScroll[vname].t;
  }
  if (mapPin && L.nodes.some(n => n.id === mapPin)) {
    light(mapPin);
    requestAnimationFrame(() => centerOn(mapPin));
  } else if (mapPin) {
    const nid = L.G?.groupOf?.[mapPin];
    if (nid) {
      mapPin = nid;
      light(nid);
      requestAnimationFrame(() => centerOn(nid));
    }
  }
}

/** Gives the map the rest of the window's height, so nothing below it needs scrolling. */
function sizeMapBox() {
  const box = $('.mapbox');
  if (!box) return;
  box.style.height = `${Math.max(300, window.innerHeight - box.getBoundingClientRect().top - 12)}px`;
}
window.addEventListener(
  'resize',
  () => {
    if (view === 'map') {
      sizeMapBox();
      const k = document.querySelector('.mapbox .fkey, .fkey');
      if (k && k.auto) k.auto(); // the key above Start follows a resized window (or goes back to its corner on a narrow one)
    }
  },
  { passive: true }
);

/** Splits text into at most `max` lines of about `width` characters, ending the last with … if it is cut. */
function wrapWords(text, width, max) {
  const out = [];
  let line = '';
  for (const w of String(text).split(/\s+/)) {
    if (line && (line + ' ' + w).length > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  if (out.length > max) {
    out.length = max;
    out[max - 1] = `${out[max - 1].slice(0, width - 1)}…`;
  }
  return out.map(l => (l.length > width + 4 ? `${l.slice(0, width + 3)}…` : l));
}
/** "34%" from a count and a total. */
function pct(n, of) {
  if (!of) return '0%';
  const v = (n / of) * 100;
  return `${v > 0 && v < 1 ? '<1' : Math.round(v)}%`;
}
/** A path's d attribute from a flat list of control points: start, then (c1, c2, end) per curve. */
function pathOf(P) {
  let d = `M${P[0].toFixed(1)} ${P[1].toFixed(1)}`;
  for (let i = 2; i + 5 < P.length + 0; i += 6)
    d += ` C${P[i].toFixed(1)} ${P[i + 1].toFixed(1)} ${P[i + 2].toFixed(1)} ${P[i + 3].toFixed(1)} ${P[i + 4].toFixed(1)} ${P[i + 5].toFixed(1)}`;
  return d;
}
/** A point part of the way (t from 0 to 1) along a path given as control points (the middle curve for longer paths). */
function at(P, t) {
  const segs = (P.length - 2) / 6,
    si = Math.min(segs - 1, Math.floor(t * segs)),
    lt = t * segs - si,
    o = si * 6;
  const p0 = [P[o], P[o + 1]],
    c1 = [P[o + 2], P[o + 3]],
    c2 = [P[o + 4], P[o + 5]],
    p1 = [P[o + 6], P[o + 7]],
    u = 1 - lt;
  return [0, 1].map(k => u * u * u * p0[k] + 3 * u * u * lt * c1[k] + 3 * u * lt * lt * c2[k] + lt * lt * lt * p1[k]);
}

/**
 * The simulated players' full results: how runs end, which endings, how long they take, the pages almost
 * nobody sees, and where players get stuck. Uses the same settings as the map (number, how they pick, Given answers).
 */
function playReport() {
  const pt = playData(),
    n = Math.max(1, pt.runs),
    o = pt.outcome,
    name = id => pname(byId(id));
  const lens = pt.paths.map(path => path.length - 1).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  const endCount = {},
    stuckAt = {};
  let wander = 0;
  pt.paths.forEach((path, r) => {
    if (pt.ends[r]) endCount[pt.ends[r]] = (endCount[pt.ends[r]] || 0) + 1;
    else if (path.length > 400) wander++;
    else {
      const id = pt.ids[path[path.length - 1]];
      stuckAt[id] = (stuckAt[id] || 0) + 1;
    }
  });
  const rows = (m, cap = 8) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, cap);
  const table = list =>
    h(
      'table',
      { class: 'scores' },
      list.map(([id, c]) =>
        h('tr', {}, [
          h('td', { text: name(id) }),
          h('td', { class: 'num', text: pct(c, n) }),
          h('td', { class: 'num hint', text: c.toLocaleString('en') })
        ])
      )
    );
  const visits = project.passages.map(p => [p.id, pt.visits[p.id] || 0]);
  const rare = visits.filter(([, v]) => v > 0 && v / n < 0.05).sort((a, b) => a[1] - b[1]);
  const never = visits.filter(([, v]) => !v).map(([id]) => name(id));
  dialog((d, close) => {
    d.classList.add('wide');
    d.appendChild(h('h3', { text: 'Simulated players: results' }));
    d.appendChild(
      h('div', {
        class: 'hint',
        text: `${pt.runs.toLocaleString('en')} players, ${SIM_MODES.find(m => m[0] === mapSim.mode)[1].toLowerCase()}${Object.keys(mapAs).length ? `, answering ${Object.values(mapAs).map(itemName).join(' and ')}` : ''}. They follow the game’s own rules, so items, states and Givens work just as for a real player. Change these settings on the map.`
      })
    );
    const bar = h('div', { class: 'obar big', 'aria-hidden': 'true' });
    [
      ['good', 'ok'],
      ['bad', 'bad'],
      ['neutral', 'neu'],
      ['stuck', 'stuck']
    ].forEach(([k, c]) => {
      if (o[k]) bar.appendChild(h('span', { class: c, style: `width:${(o[k] / n) * 100}%` }));
    });
    d.append(
      bar,
      h('div', {
        text: `${pct(o.good, n)} end well · ${pct(o.bad, n)} end badly · ${pct(o.neutral, n)} reach a plain ending · ${pct(o.stuck, n)} get stuck or wander off. A typical run takes ${median} choice${median === 1 ? '' : 's'} (shortest ${lens[0] ?? 0}, longest ${lens[lens.length - 1] ?? 0}).`
      })
    );
    const grid = h('div', { class: 'repgrid' });
    const col = (title, body) => grid.appendChild(h('div', {}, [h('h4', { text: title }), body]));
    col('Where players end', Object.keys(endCount).length ? table(rows(endCount)) : h('div', { class: 'hint', text: 'Nobody reached an ending.' }));
    col('Most-seen pages', table(rows(pt.visits, 6)));
    col(
      'Where players get stuck',
      Object.keys(stuckAt).length || wander
        ? h('div', {}, [
            table(rows(stuckAt, 6)),
            wander ? h('div', { class: 'hint', text: `${wander.toLocaleString('en')} wandered for 400 choices without ending.` }) : null
          ])
        : h('div', { class: 'hint', text: 'Nobody got stuck.' })
    );
    col(
      'Rarely seen (under 5%)',
      rare.length ? table(rare.slice(0, 8)) : h('div', { class: 'hint', text: 'Every page reached is seen by at least 5% of players.' })
    );
    d.appendChild(grid);
    if (never.length)
      d.appendChild(
        h('div', {
          class: 'hint',
          text: `Never seen by these players: ${never.join(', ')}. (Pages that need a lucky combination may simply be rare; the Check tab says whether they can be reached at all.)`
        })
      );
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Close', onclick: close })]));
  });
}

/**
 * Compare views: draws the story every way and scores each drawing on the qualities that compete in graph
 * drawing. No drawing is best at everything, so the table also weighs the scores for three tasks.
 */
function compareViews() {
  const rows = mapViews()
    .filter(v => !['shape', 'river'].includes(v[0]))
    .map(v => {
      const L = mapBuild(v[0]);
      const m = mapScore(L, mapPrev[v[0]]?.pos);
      return { v, m };
    });
  const cols = [
    ['crossings', 'Crossings', 'Fewer arrows crossing each other'],
    ['neighbors', 'Neighbors', 'Pages joined by a choice sit near each other'],
    [
      'groups',
      'Groups',
      (project.givens || []).length ? 'Pages reached by the same Given answers sit together' : 'Pages heading to the same kind of ending sit together'
    ],
    ['stability', 'Stability', 'How little the drawing moved since you last saw this view (keeps your mental map)'],
    ['flow', 'Flow', 'Arrows point the reading way'],
    ['compact', 'Compact', 'Fits a screen with little empty space'],
    ['speed', 'Speed', 'How quickly it draws']
  ];
  const best = {};
  Object.keys(MAP_TASKS).forEach(t => {
    best[t] = rows.reduce((b, r) => (mapTaskScore(r.m.scores, t) > (b ? mapTaskScore(b.m.scores, t) : -1) ? r : b), null);
  });
  dialog((d, close) => {
    d.classList.add('wide');
    d.appendChild(h('h3', { text: 'Compare views' }));
    d.appendChild(
      h('div', {
        class: 'hint',
        text: 'Each view is scored from 0 to 100 on qualities that pull against each other: a drawing with no crossings may scatter related pages, and one that keeps groups apart may run long. So the best view depends on the task: the last three columns weigh the scores for each. Story shape and River sum the story up rather than draw every arrow, so they are not scored.'
      })
    );
    const tbl = h('table', { class: 'scores' });
    tbl.appendChild(
      h(
        'tr',
        {},
        [h('th', { text: 'View' })].concat(
          cols.map(c => h('th', { text: c[1], title: c[2] })),
          Object.values(MAP_TASKS).map(t => h('th', { class: 'task', text: t.label })),
          [h('th')]
        )
      )
    );
    rows.forEach(r => {
      const sc = r.m.scores;
      tbl.appendChild(
        h(
          'tr',
          { class: r.v[0] === mapOpts.view ? 'cur' : null },
          [h('td', { text: r.v[1], title: r.v[2] })].concat(
            cols.map(c =>
              h('td', {
                class: 'num',
                text: sc[c[0]] === null ? '—' : Math.round(sc[c[0]] * 100),
                title:
                  c[0] === 'crossings'
                    ? `${r.m.raw.crossings} crossings`
                    : c[0] === 'speed'
                      ? `${Math.round(r.m.raw.ms)} ms`
                      : c[0] === 'stability' && sc.stability === null
                        ? 'Not seen before: open this view, edit, and come back'
                        : null
              })
            ),
            Object.keys(MAP_TASKS).map(t =>
              h('td', { class: `num task${best[t] === r ? ' best' : ''}`, text: Math.round(mapTaskScore(sc, t) * 100) })
            ),
            [
              h('td', {}, [
                h('button', {
                  class: 'btn small',
                  type: 'button',
                  text: 'Use',
                  onclick() {
                    mapOpts.view = r.v[0];
                    saveMapOpts();
                    close();
                    if (view !== 'map') setView('map');
                    else mapRedraw();
                  }
                })
              ])
            ]
          )
        )
      );
    });
    d.appendChild(h('div', { class: 'scrollx' }, [tbl]));
    d.appendChild(
      h('details', {}, [
        h('summary', { text: 'How the task columns weigh the scores' }),
        h(
          'ul',
          {},
          Object.values(MAP_TASKS).map(t =>
            h('li', {
              text: `${t.label}: ${Object.entries(t.w)
                .map(([k, w]) => `${cols.find(c => c[0] === k)[1]} ${Math.round(w * 100)}%`)
                .join(', ')}`
            })
          )
        )
      ])
    );
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Close', onclick: close })]));
  });
}
