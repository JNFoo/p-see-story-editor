/* ============================================================================
   PART 2 OF 3 · PLAYER  (plays a story; used by the Play tab AND exported games)
   ----------------------------------------------------------------------------
   klPlayer(root, story, opts)
     root   element to draw into
     story  the object made by exportStory()
     opts   persist   save progress in this browser (exported games: true)
            startId   begin on a specific page instead of the story start
            givens    { givenId: answerStateId } answers to use instead of asking (the editor's Play tab)
            flags     extra things the player starts with, { itemId: true, 'v:<statId>': number } ("Test from here")
            exact     true: `flags` is everything the player holds on arrival (the start page's own gains are not applied again)
            showTitle false hides the small story title above each page
            onPage    callback(pageId, flags) after each page is drawn
   Returns { restart() }.
   Reader options come from story.game: back (off | remember | reroll | block), tracker (count endings found), comfort
   (the Aa panel), odds (show a skill check's chance), pal (color palette, applied by game.css).
   The player uses only textContent, never innerHTML, so story text cannot inject markup.

   FEATURES ARE MODULES. klPlayer is the core: pages, choices, items, Given answers, the recap, saving, Start over, keys.
   Everything optional is a separate function, klFeat<Name>(P), that adds itself to the core through hooks:
     ask      the Given questions asked before page one          back     the Back button and its rules
     dice     skill checks: the roll, its note and the odds       locks    greyed-out choices with a reason
     bars     the bars for numbers                                tracker  "Endings found: 1 of 8"
     comfort  the Aa reading panel
   An exported game carries only the modules its story uses (klFeatures() in core.js decides; build-game.mjs and
   buildGameHtml put the pieces together). The editor's Play tab has them all, and a module whose feature the story
   does not use does nothing. KL_FEATURE_ORDER in core.js lists them in the order they are registered. To add a feature:
   write klFeat<Name>, register it at the bottom of this file, list it in KL_FEATURE_ORDER and klFeatures(), and put its
   styles in a section of game.css that starts with a comment saying @part and the name. contract.mjs fails the build if any of those is missing.

   What a module receives, P:  G (story.game), story, opts, root, byId, itemsById, el(tag, class, text), nm(id), nameOf(item, flags),
   readJson / writeJson / readList (kept in this browser), state (get and set), save(), render(moved, said), proceed(), wrapper(),
   on(hook, fn) and collect(hook) (the elements the other modules offer for a hook). Hooks (their arguments; p is a story page, page is the element it is drawn into):
     start(state)  load(savedState)  step(oldState, newState, {from, c, r})  arrive(p)          the story's moments
     pageTop(p, page)  afterText(p, page)  endLine(p, page)  choice(c, button)                  things drawn on a page
     barLeft(p)  barRight(p, wrap)  aaExtra()  wrapClass()  rendered(wrap, said)                the bar under the page
   A module can also set P.roll(from, c) (dice), P.locked(c, button) (locks), P.ask(g, moved) (ask) and P.remember (back).
   ============================================================================ */

/** The optional feature modules that are present, in the order they were registered (see the bottom of this file). */
const KL_FEATS = {};

function klPlayer(root, story, opts = {}) {
  const byId = Object.create(null);
  const key = `story-editor-play:${story.id}${story.fp ? `.${story.fp}` : ''}`; // exported games add a fingerprint of the story's shape (made when the game is exported), so a changed story starts fresh
  const G = story.game || {};
  const st = klStatMap(story.items); // each number's limits
  let state;
  story.passages.forEach(p => {
    byId[p.id] = p;
  });

  /* The hooks: a feature module says "call me when this happens" with on(); the core calls each() or collect(). */
  const hooks = {};
  const on = (name, fn) => {
    (hooks[name] = hooks[name] || []).push(fn);
  };
  const each = (name, ...a) => {
    (hooks[name] || []).forEach(f => f(...a));
  };
  const collect = (name, ...a) => (hooks[name] || []).map(f => f(...a)).filter(Boolean);

  /** A saved JSON value, or null (storage may be off or damaged). */
  function readJson(k) {
    if (!opts.persist) return null;
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch (e) {
      return null;
    }
  }
  function readList(k) {
    const v = readJson(k);
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  }
  /* Storage can be off (a private window, blocked site data, a full disk). The game still plays, but nothing is remembered, so the player is told
     once per page instead of finding out after a reload. It is checked once at the start, and again by every save. */
  let saveFailed = false;
  if (opts.persist) {
    try {
      const probe = 'story-editor-probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
    } catch (e) {
      saveFailed = true;
    }
  }
  function writeJson(k, v) {
    if (!opts.persist) return;
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      saveFailed = true; // storage may be off: carry on
    }
  }

  /** Is this saved progress usable with this story? (also used before writing, so a broken state is never saved) */
  function usable(s) {
    if (!s || !s.flags || typeof s.flags !== 'object') return false;
    if (s.pid === null ? !(s.asking && typeof s.asking.chosen === 'object') : !(typeof s.pid === 'string' && byId[s.pid])) return false;
    if (s.pid === null && !givens.some(g => !g.options.includes(s.asking.chosen[g.id]))) return false; // nothing left to ask: not a usable save
    return true;
  }
  /** The key of the spare copy: the save from one step earlier, used if the latest one is damaged. */
  const spareKey = key.replace('story-editor-play:', 'story-editor-bak:');

  /** Saves the current page and items so a reload carries on where the player was. Never writes a state the story cannot use. */
  function save() {
    if (!opts.persist || !usable(state)) return;
    try {
      const before = localStorage.getItem(key);
      localStorage.setItem(key, JSON.stringify(state));
      if (before) localStorage.setItem(spareKey, before); // after the new save is safely written, the old one becomes the spare
      saveFailed = false;
    } catch (e) {
      saveFailed = true; // storage may be off: carry on
    }
  }
  /* a save is written on every move; this makes sure nothing is lost if the page is hidden or closed mid-move */
  if (opts.persist) {
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && save());
  }

  /** Reads saved progress (or the spare copy if the latest is there but damaged), ignoring anything that no longer matches the story. */
  function load() {
    if (!opts.persist) return null;
    for (const k of [key, spareKey]) {
      try {
        const raw = localStorage.getItem(k);
        if (raw === null) {
          if (k === key) return null; // no save at all (a new player, or storage was cleared): the spare is only for a save that exists but is damaged
          continue;
        }
        const s = JSON.parse(raw);
        if (!usable(s)) continue;
        if (k === spareKey) localStorage.setItem(key, raw); // the spare takes over: the latest save is whole again at once
        if (!Array.isArray(s.trail)) s.trail = [];
        if (!Array.isArray(s.answers)) s.answers = [];
        each('load', s); // the feature modules tidy their own saved fields
        return s;
      } catch (e) {
        /* damaged: try the spare */
      }
    }
    return null;
  }

  /* Givens: questions asked before page one ("Who are you?"). Each answer is a state the player then has. */
  const givens = (story.givens || []).filter(g => g.options && g.options.length);

  const itemsById = Object.create(null);
  (story.items || []).forEach(i => {
    itemsById[i.id] = i;
  });
  /** What an item is called right now: its "shown as" name if the player has or is that, otherwise its own name. */
  function nameOf(i, flags) {
    for (let n = 0; n < (i.names || []).length; n++) if (flags[i.names[n].when]) return i.names[n].name;
    return i.name;
  }
  /** The name of a stat or item by id. */
  const nm = id => (itemsById[id] ? itemsById[id].name : '?');

  /** Starts (or restarts): first the Given questions not already answered by opts.givens, then the first page. */
  function begin(startId) {
    const preset = opts.givens || {};
    const chosen = {};
    givens.forEach(g => {
      if (g.options.includes(preset[g.id])) chosen[g.id] = preset[g.id];
      else if (opts.exact) chosen[g.id] = g.options.find(o => (opts.flags || {})[o]) || g.options[0]; // already decided by the test
    });
    state = { pid: null, flags: {}, trail: [], answers: [], asking: { chosen, startId } };
    proceed();
  }
  /** The next Given still to ask, or null when all are answered. */
  function nextGiven() {
    for (let i = 0; i < givens.length; i++) if (!state.asking.chosen[givens[i].id]) return givens[i];
    return null;
  }
  /** After an answer: ask the next question, or start the story with the answers as states. */
  function proceed() {
    if (state.pid === null && !nextGiven()) {
      const flags = klInit({}, st); // every number at its starting value
      const answers = [];
      const p = byId[state.asking.startId] || byId[story.start] || story.passages[0];
      givens.forEach(g => {
        const a = state.asking.chosen[g.id];
        flags[a] = true;
        answers.push({ q: g.question, a: itemsById[a] ? itemsById[a].name : '' });
      });
      if (opts.exact) Object.keys(flags).forEach(k => (k.slice(0, 2) === 'v:' ? (flags[k] = 0) : 0)); // numbers the tester did not list are 0, not their starting value
      Object.assign(flags, opts.flags || {});
      /* "Test from here" gives the exact things the player holds on arrival, so the start page does not apply its own gains again */
      state = { pid: p.id, flags: opts.exact ? flags : klArrive(flags, p, st), trail: [], answers };
      each('start', state);
      each('arrive', p);
    }
    save();
  }

  /** Small helper: make an element with a class and plain text. */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** A short line that stands for a page in the recap: its first visible sentence (or its heading). */
  function gist(p, flags) {
    const blocks = klVisibleBlocks(p, flags);
    let i;
    let t;
    let m;
    for (i = 0; i < blocks.length; i++) {
      t = String(blocks[i].text).trim().replace(/\s+/g, ' ');
      if (!t) continue;
      m = t.match(/^(.{12,170}?[.!?…])(\s|$)/);
      return m ? m[1] : t.length > 150 ? `${t.slice(0, 149)}…` : t;
    }
    return p.heading || '';
  }

  /** The ending page's recap: the player's own path, step by step, told in the story's words. */
  function recap() {
    const trail = state.trail || [];
    const det = el('details', 'kl-recap');
    const ol = el('ol');
    const p = byId[state.pid];
    det.open = false; // folded away: the player opens it if they want to look back
    det.appendChild(el('summary', '', `See the path you took (${trail.length + 1}${trail.length ? ' pages)' : ' page)'}`));
    (state.answers || []).forEach(a => {
      // the Given answers come first
      const li = el('li');
      li.appendChild(el('span', 'kl-step', `${a.q} `));
      li.appendChild(el('span', 'kl-took', `→ ${a.a}`));
      ol.appendChild(li);
    });
    trail.forEach(s => {
      const li = el('li');
      if (s.t) li.appendChild(el('span', 'kl-step', `${s.t} `));
      li.appendChild(el('span', 'kl-took', `→ ${s.c}`));
      ol.appendChild(li);
    });

    /* the last line is the ending in the player's own words: its first sentence, then its title (never "good" or "bad") */
    const last = el('li');

    const g = gist(p, state.flags);
    let title = String(p.heading || '').trim();
    if (title && !/[.!?…]$/.test(title)) title += '.';
    last.appendChild(el('span', 'kl-step', g + (g && title && g !== title ? ' ' : '')));
    if (title && g !== p.heading) last.appendChild(el('span', 'kl-took', title));
    ol.appendChild(last);
    det.appendChild(ol);
    return det;
  }

  /**
   * Moves to the page choice `c` leads to. A skill check (the dice module) rolls two dice first. Remembers the step for the recap,
   * applies what the player gains or loses, lets the feature modules add their own bookkeeping (Back's history, the dice note), redraws.
   */
  function go(from, c, quiet) {
    const r = P.roll ? P.roll(from, c) : null; // { roll, note } for a skill check
    const next = byId[klTarget(state.flags, c, r ? r.roll : 0)];
    if (!next) return;
    let trail = (state.trail || []).concat([{ t: gist(from, state.flags), c: c.label }]);
    if (trail.length > 400) trail = trail.slice(trail.length - 400);
    const prev = state;
    state = { pid: next.id, flags: klArrive(klChoose(state.flags, c, st), next, st), trail, answers: state.answers || [], seen: { ...state.seen, [`${from.id}.${from.choices.indexOf(c)}`]: 1 } }; // seen: the choices taken in this run (Back does not forget them)
    each('step', prev, state, { from, c, r });
    each('arrive', next);
    if (quiet) return; // replaying a saved route (the place module): drawn once at the end
    save();
    render(true, r && r.note);
  }
  /** Back to the first page with empty pockets. */
  function restart() {
    begin(opts.startId || story.start);
    render(true);
  }

  /* Keys 1-9 pick the matching choice (or Play again on an ending). A stand-alone game listens on the whole page;
     inside the editor's Play tab it listens only while the story itself has focus. One listener, replaced on restart. */
  const keyTarget = opts.persist ? document : root;
  if (root._klKeys) keyTarget.removeEventListener('keydown', root._klKeys);
  root._klKeys = e => {
    const tag = e.target && e.target.tagName;
    if (e.ctrlKey || e.metaKey || e.altKey || tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.closest?.('.kl-recap, .kl-aa')) return;
    const n = parseInt(e.key, 10);
    const btns = root.querySelectorAll('.kl-choices button:not([aria-disabled])');
    if (n >= 1 && n <= btns.length) {
      e.preventDefault();
      btns[n - 1].click();
    }
  };
  keyTarget.addEventListener('keydown', root._klKeys);

  /** The outer element of every screen: carries the color palette and the reader's Aa choices. */
  function wrapper() {
    const w = el('div', `kl ${collect('wrapClass').join(' ')}`.trim());
    if (G.pal && G.pal !== 'paper') w.setAttribute('data-pal', G.pal);
    return w;
  }

  /** Draws the current page. `moved` is true after a choice, so the reader is taken to the top of the new page. */
  function render(moved, said) {
    if (state.pid === null) {
      const g = nextGiven();
      if (g) {
        P.ask(g, moved); // the ask module draws the question
        return;
      }
      proceed(); // every question is answered: start the story
    }
    const p = byId[state.pid];
    root.textContent = '';
    const wrap = wrapper();
    const page = el('div', `kl-page${p.ending ? ` end-${p.valence || 'neutral'}` : ''}`);
    page.setAttribute('tabindex', '-1'); // so keyboard and screen-reader users land on the new page
    if (opts.showTitle !== false) page.appendChild(el('h1', 'kl-title', story.title));
    if (p.heading) page.appendChild(el('h2', 'kl-head', p.heading));
    if (saveFailed) page.appendChild(el('p', 'kl-nosave', 'This browser is not saving your place (a private window or blocked site data can cause this). If you close or reload this page, you will start over.'));
    each('pageTop', p, page); // the dice note
    klVisibleBlocks(p, state.flags).forEach(b => {
      const t = String(b.text).trim();
      if (t) page.appendChild(el('p', '', t));
    });
    /* "Carrying" and "Feeling" lines list only the items the author chose to show; numbers are drawn as bars (the bars module). */
    function shown(kind) {
      return story.items
        .filter(i => i.show && (i.kind === 'state' ? 'state' : 'object') === kind && state.flags[i.id])
        .map(i => nameOf(i, state.flags));
    }
    const haveO = shown('object');
    const haveS = shown('state');
    if (haveO.length) page.appendChild(el('div', 'kl-have', `Carrying: ${haveO.join(', ')}.`));
    if (haveS.length) page.appendChild(el('div', 'kl-have', `Feeling / status: ${haveS.join(', ')}.`));
    each('afterText', p, page);
    let list = el('ul', 'kl-choices');
    let pickable = () => 0;
    if (p.ending) {
      page.appendChild(el('div', 'kl-end', 'The end.'));
      each('endLine', p, page);
      const li = el('li');
      const b = el('button', '', 'Play again');
      b.type = 'button';
      b.onclick = restart;
      li.appendChild(b);
      list.appendChild(li);
      page.appendChild(list);
      list = null;
      page.appendChild(recap());
    } else {
      let n = 0;
      pickable = () => n;
      klShown(p, state.flags).forEach(c => {
        if (!byId[c.to] || (c.check && !byId[c.check.fail])) return;
        const ok = klCondOk(c, state.flags);
        if (!ok && !P.locked) return; // a choice that cannot be picked is hidden unless the locks module is there to grey it out
        const li = el('li');
        const b = el('button', '', c.label);
        b.type = 'button';
        each('choice', c, b); // the odds, for a skill check
        if (ok) {
          if (state.seen && state.seen[`${p.id}.${p.choices.indexOf(c)}`]) b.classList.add('seen'); // taken before in this run: a check mark and lighter type
          b.setAttribute('data-n', String(++n));
          b.onclick = () => {
            go(p, c);
          };
        } else P.locked(c, b);
        li.appendChild(b);
        list.appendChild(li);
      });
    }
    if (list) page.appendChild(list);
    wrap.appendChild(page);
    /* Under the page: what the modules add on the left (Back, the endings found) and the right (Aa), then "Start over" (not on endings,
       which have Play again, nor before the first choice). Start over asks once more, so a stray tap loses nothing. */
    const bar = el('div', 'kl-bar');
    const left = el('div', 'kl-bar-l');
    const right = el('div', 'kl-bar-r');
    collect('barLeft', p).forEach(x => left.appendChild(x));
    collect('barRight', p, wrap).forEach(x => right.appendChild(x));
    /* also when nothing on the page can be picked (a first page whose only choices need something this player lacks): otherwise a saved game could never be left */
    if (!p.ending && ((state.trail && state.trail.length) || pickable() === 0)) {
      const r = el('button', '', 'Start over');
      let armed = null;
      r.type = 'button';
      r.onclick = () => {
        if (armed) {
          clearTimeout(armed);
          restart();
          return;
        }
        r.textContent = 'Tap again to start over';
        r.className = 'armed';
        armed = setTimeout(() => {
          armed = null;
          r.textContent = 'Start over';
          r.className = '';
        }, 3000);
      };
      right.appendChild(r);
    }
    if (left.childNodes.length || right.childNodes.length) {
      bar.appendChild(left);
      bar.appendChild(right);
      wrap.appendChild(bar);
    }
    root.appendChild(wrap);
    each('rendered', wrap, said);
    if (moved) {
      try {
        page.focus({ preventScroll: true });
      } catch (e) {
        page.focus();
      }
      if (root.getBoundingClientRect().top < 0 && root.scrollIntoView) root.scrollIntoView(true); // only when the page's start is out of view
    }
    if (opts.onPage) opts.onPage(p.id, state.flags);
  }

  /* What the feature modules are given (see the notes at the top of this file), and the modules themselves, in order. */
  const P = {
    G,
    story,
    opts,
    root,
    byId,
    itemsById,
    on,
    collect,
    el,
    nm,
    nameOf,
    readJson,
    writeJson,
    readList,
    save,
    render,
    proceed,
    begin,
    go,
    wrapper,
    get state() {
      return state;
    },
    set state(v) {
      state = v;
    }
  };
  Object.keys(KL_FEATS).forEach(name => KL_FEATS[name](P));

  state = opts.startId ? null : load();
  if (!state) begin(opts.startId || story.start);
  render(false);
  return { restart };
}

/* ----------------------------------------------------------------------------
   FEATURE MODULES (each one is optional in an exported game)
   ---------------------------------------------------------------------------- */

/** ask: a Given question, drawn like a page: the question and one button per answer. */
function klFeatAsk(P) {
  P.ask = (g, moved) => {
    const el = P.el;
    const root = P.root;
    root.textContent = '';
    const wrap = P.wrapper();
    const page = el('div', 'kl-page kl-ask');
    const list = el('ul', 'kl-choices');
    page.setAttribute('tabindex', '-1');
    if (P.opts.showTitle !== false) page.appendChild(el('h1', 'kl-title', P.story.title));
    page.appendChild(el('h2', 'kl-head', g.question));
    g.options.forEach(id => {
      const li = el('li');
      const b = el('button', '', P.itemsById[id] ? P.itemsById[id].name : '?');
      b.type = 'button';
      b.onclick = () => {
        P.state.asking.chosen[g.id] = id;
        P.proceed();
        P.render(true);
      };
      li.appendChild(b);
      list.appendChild(li);
    });
    page.appendChild(list);
    wrap.appendChild(page);
    root.appendChild(wrap);
    if (moved) {
      try {
        page.focus({ preventScroll: true });
      } catch (e) {
        page.focus();
      }
    }
  };
}

/** back: the Back button, with the author's rule for what happens after a dice roll (remember | reroll | block). */
function klFeatBack(P) {
  const mode = ['remember', 'reroll', 'block'].includes(P.G.back) ? P.G.back : 'off';
  if (mode === 'off') return;
  const HIST = 60; // steps Back can undo
  P.remember = mode === 'remember'; // the dice module then reuses a roll when the reader comes back to the same choice
  P.on('load', s => {
    s.hist = Array.isArray(s.hist)
      ? s.hist.filter(h => h && typeof h.pid === 'string' && P.byId[h.pid] && h.flags && typeof h.flags === 'object')
      : [];
    s.floor = Math.min(Number(s.floor) || 0, s.hist.length);
  });
  P.on('start', s => {
    s.hist = [];
    s.floor = 0;
  });
  P.on('step', (prev, s, info) => {
    const hist = (prev.hist || [])
      .concat([{ pid: info.from.id, flags: prev.flags, tl: (prev.trail || []).length, note: prev.note || '', rl: typeof prev.route === 'string' ? prev.route.length : -1 }]) // rl: how much of the place module's route to keep when stepping back
      .slice(-HIST);
    const dropped = (prev.hist || []).length + 1 - hist.length; // old steps that fell off the front
    s.hist = hist;
    s.floor = info.r && mode === 'block' ? hist.length : Math.max(0, (prev.floor || 0) - dropped);
  });
  /** Back one page (when the author allows it). */
  function back() {
    const s = P.state;
    const h = s.hist || [];
    if (h.length <= (s.floor || 0)) return;
    const prev = h[h.length - 1];
    P.state = Object.assign({}, s, {
      pid: prev.pid,
      flags: prev.flags,
      trail: (s.trail || []).slice(0, prev.tl),
      hist: h.slice(0, -1),
      note: prev.note || '',
      route: typeof s.route === 'string' && prev.rl >= 0 ? s.route.slice(0, prev.rl) : s.route
    });
    P.save();
    P.render(true);
  }
  /* The phone's back swipe or button (and Esc) does Back while there is a page to go back to, then leaves normally. Only in a stand-alone game, and only where the browser has CloseWatcher. */
  let cw = null;
  P.on('rendered', () => {
    const s = P.state;
    const can = (s.hist || []).length > (s.floor || 0);
    if (can && !cw && P.opts.persist && window.CloseWatcher) {
      try {
        cw = new CloseWatcher();
        cw.onclose = () => {
          cw = null;
          back();
        };
      } catch (e) {
        cw = null;
      }
    } else if (!can && cw) (cw.destroy(), (cw = null));
  });
  P.on('barLeft', () => {
    const s = P.state;
    if (!(s.hist || []).length) return null;
    const bk = P.el('button', '', 'Back');
    bk.type = 'button';
    if ((s.hist || []).length > (s.floor || 0)) bk.onclick = back;
    else {
      bk.setAttribute('aria-disabled', 'true');
      bk.title = 'You cannot go back past a roll of the dice';
    }
    return bk;
  });
}

/** dice: skill checks. Rolls two dice, adds the number, says what happened, and shows the odds on the choice. */
function klFeatDice(P) {
  const el = P.el;
  const dice = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  P.on('start', s => {
    s.rolls = {};
    s.note = '';
  });
  P.on('load', s => {
    s.rolls = s.rolls && typeof s.rolls === 'object' ? s.rolls : {};
  });
  P.on('step', (prev, s, info) => {
    s.rolls = prev.rolls || {};
    s.note = info.r ? info.r.note : '';
  });
  /** Rolls for choice `c` on page `from`; returns { roll, note } (or null if it is not a skill check). */
  P.roll = (from, c) => {
    const k = c.check;
    if (!k) return null;
    const s = P.state;
    const ck = `${from.id}#${from.choices.indexOf(c)}`;
    /* A roll is remembered together with how many pages of Back history there were when it was made, and is reused only when the
       reader is back at exactly that point (they pressed Back). Coming round to the same choice by walking forward rolls again. */
    const hl = (s.hist || []).length;
    const kept = P.remember && s.rolls && s.rolls[ck];
    const same = kept && !Array.isArray(kept) && kept.h === hl && Array.isArray(kept.p) ? kept.p : null;
    const pair = P.forceRoll ? [Math.min(6, P.forceRoll - 1), P.forceRoll - Math.min(6, P.forceRoll - 1)] : same || dice();
    const roll = pair[0] + pair[1];
    const have = s.flags[`v:${k.stat}`] || 0;
    const win = roll + have >= k.target;
    s.rolls = s.rolls || {};
    s.rolls[ck] = { p: pair, h: hl };
    const name = P.nm(k.stat);
    return {
      roll,
      note: `${name} check: rolled ${pair[0]} + ${pair[1]} = ${roll}, plus ${name} ${have} = ${roll + have}. Needed ${k.target}: ${win ? 'success' : 'not this time'}.`
    };
  };
  P.on('pageTop', (p, page) => {
    if (P.state.note) page.appendChild(el('p', 'kl-roll', P.state.note)); // what the dice just did
  });
  P.on('choice', (c, b) => {
    if (!c.check) return;
    const name = P.nm(c.check.stat);
    b.appendChild(el('span', 'kl-odds', P.G.odds === false ? `${name} check` : `${name} check: ${klOdds(P.state.flags, c.check)}% chance`));
  });
  /* Says the result to screen readers without moving focus. */
  P.on('rendered', (wrap, said) => {
    if (!said) return;
    const live = el('div', 'kl-sr');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    wrap.appendChild(live);
    setTimeout(() => {
      live.textContent = said;
    }, 60);
  });
}

/** locks: a choice the player cannot pick yet is shown greyed out, with a reason (the author's own, or what is missing). */
function klFeatLocks(P) {
  /** The words a locked choice shows under its label. */
  function why(c, flags) {
    if (c.why) return c.why;
    const test = id => /^t:([^:]+):(-?\d+)$/.exec(id);
    const need = (c.needs || []).find(id => !klHas(flags, id));
    if (need) {
      const t = test(need);
      return t ? `Needs ${P.nm(t[1])} ${t[2]} or more` : P.itemsById[need] ? `Needs ${P.nm(need)}` : 'Not available yet';
    }
    const bar = (c.forbid || []).find(id => klHas(flags, id));
    if (bar) {
      const t = test(bar);
      return t ? `Only while ${P.nm(t[1])} is below ${t[2]}` : P.itemsById[bar] ? `Not while ${P.nm(bar)}` : 'Not available now';
    }
    return 'Not available yet';
  }
  P.locked = (c, b) => {
    b.setAttribute('aria-disabled', 'true');
    b.className = 'locked';
    b.appendChild(P.el('span', 'kl-why', why(c, P.state.flags)));
  };
}

/** bars: each number the author chose to show, drawn as a labeled bar. */
function klFeatBars(P) {
  P.on('afterText', (p, page) => {
    const flags = P.state.flags;
    const nums = P.story.items.filter(i => i.kind === 'stat' && i.show);
    if (!nums.length) return;
    const box = P.el('div', 'kl-stats');
    nums.forEach(i => {
      const v = Math.max(i.lo, Math.min(i.hi, flags[`v:${i.id}`] || 0));
      const row = P.el('div', 'kl-stat');
      row.setAttribute('role', 'meter');
      row.setAttribute('aria-label', P.nameOf(i, flags));
      row.setAttribute('aria-valuemin', String(i.lo));
      row.setAttribute('aria-valuemax', String(i.hi));
      row.setAttribute('aria-valuenow', String(v));
      row.setAttribute('aria-valuetext', `${v} out of ${i.hi}`);
      row.appendChild(P.el('span', 'kl-sn', P.nameOf(i, flags)));
      const track = P.el('span', 'kl-track');
      const fill = P.el('i');
      fill.style.width = `${((v - i.lo) / (i.hi - i.lo)) * 100}%`;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(P.el('span', 'kl-sv', `${v}/${i.hi}`));
      box.appendChild(row);
    });
    page.appendChild(box);
  });
}

/** tracker: "Endings found: 1 of 8", kept in this browser between plays (when the author turned it on). */
function klFeatTracker(P) {
  const ids = P.story.passages.filter(p => p.ending).map(p => p.id);
  if (!P.G.tracker || !ids.length) return;
  const foundKey = `story-editor-found:${P.story.id}${P.story.fp ? `.${P.story.fp}` : ''}`; // endings this reader has seen
  let found = P.readList(foundKey);
  const line = () => P.el('span', 'kl-found', `Endings found: ${found.filter(x => P.byId[x]).length} of ${ids.length}`);
  P.on('arrive', p => {
    if (!p.ending || found.includes(p.id)) return;
    found = found.concat([p.id]);
    P.writeJson(foundKey, found);
  });
  P.on('endLine', (p, page) => {
    const d = P.el('div', 'kl-found', line().textContent);
    page.appendChild(d);
  });
  P.on('barLeft', p => (p.ending ? null : line()));
  P.on('aaExtra', () => {
    const b = P.el('button', 'kl-aa-clear', 'Forget the endings I have found');
    b.type = 'button';
    b.onclick = () => {
      found = [];
      P.writeJson(foundKey, found);
      P.render(false);
    };
    return b;
  });
}

/**
 * place: "Place code". Carries a player's place to another device or browser as a short piece of text. The code is the story's
 * fingerprint plus the player's route: one character per Given answer, then for each step the number of the choice (0 to 9,
 * then a to z) and, for a skill check, the roll (2 to 12 written as 0 to a). Pasting a code replays that route with the game's
 * own rules, so nothing can be forged and the path taken, the numbers and Back all come out exactly as they were.
 */
function klFeatPlace(P) {
  if (!P.G.place) return;
  const fp = P.story.fp || '';
  const gs = (P.story.givens || []).filter(g => g.options && g.options.length);
  const dig = n => n.toString(36);
  P.on('start', s => {
    s.route = `${gs.map(g => dig(Math.max(0, g.options.findIndex(o => s.flags[o])))).join('')}.`;
  });
  P.on('load', s => {
    if (typeof s.route !== 'string') s.route = null; // saved before this feature was on: no code until the next start
  });
  P.on('step', (prev, s, info) => {
    const i = info.from.choices.indexOf(info.c);
    s.route = typeof prev.route === 'string' && i < 36 ? prev.route + dig(i) + (info.r ? dig(info.r.roll - 2) : '') : null;
  });
  /** Plays a code. Returns '' when it worked, otherwise a sentence saying what was wrong. */
  function use(text) {
    const m = /^([0-9a-z]*)-([0-9a-z]*)\.([0-9a-z]*)$/.exec(text.replace(/\s+/g, '').toLowerCase());
    if (!m) return 'That does not look like a place code.';
    if (m[1] !== fp) return 'That code is from a different version of this story.';
    const before = P.state;
    try {
      P.begin(P.story.start);
      if (gs.length) {
        if (m[2].length !== gs.length) throw 0;
        gs.forEach((g, i) => (P.state.asking.chosen[g.id] = g.options[parseInt(m[2][i], 36)]));
        if (gs.some(g => !P.state.asking.chosen[g.id])) throw 0;
        P.proceed();
      }
      for (let i = 0; i < m[3].length; i++) {
        const p = P.byId[P.state.pid];
        const c = p && !p.ending && p.choices[parseInt(m[3][i], 36)];
        if (!c || !klCondOk(c, P.state.flags)) throw 0;
        if (c.check) {
          const rc = parseInt(m[3][++i], 36);
          if (!(rc >= 0 && rc <= 10)) throw 0; // a cut-off or edited code: the roll must be 2 to 12
          P.forceRoll = rc + 2;
        }
        P.go(p, c, true);
        P.forceRoll = 0;
      }
      P.save();
      P.render(true);
      return '';
    } catch (e) {
      P.forceRoll = 0;
      P.state = before;
      P.save(); // (nothing was drawn while replaying, so the page, the open box and its message stay as they are)
      return 'That code does not fit this story.';
    }
  }
  P.on('barRight', () => {
    const s = P.state;
    if (P.byId[s.pid] && P.byId[s.pid].ending) return null;
    const d = P.el('details', 'kl-pl');
    d.appendChild(P.el('summary', '', 'Place code')).title = 'Copy a code for where you are, or paste one to carry on from another device';
    const box = P.el('div', 'kl-pl-box');
    if (typeof s.route === 'string') {
      const copy = P.el('button', '', 'Copy my place code');
      copy.type = 'button';
      copy.onclick = () => {
        const code = `${fp}-${s.route}`;
        const done = () => (copy.textContent = 'Copied');
        try {
          navigator.clipboard.writeText(code).then(done, () => (field.value = code));
        } catch (e) {
          field.value = code;
        }
      };
      box.appendChild(copy);
    }
    const field = P.el('input');
    field.type = 'text';
    field.setAttribute('aria-label', 'Place code');
    field.placeholder = 'Paste a place code here';
    const go = P.el('button', '', 'Go to that place');
    go.type = 'button';
    const msg = P.el('div', 'kl-pl-msg');
    msg.setAttribute('role', 'status');
    go.onclick = () => {
      if (!field.value.trim()) return;
      const err = use(field.value);
      msg.textContent = err; // on success the page is drawn again, so this only shows a problem
    };
    box.appendChild(field);
    box.appendChild(go);
    box.appendChild(msg);
    d.appendChild(box);
    return d;
  });
}

/** comfort: the Aa panel. The reader's own text size, spacing, contrast and motion, kept in this browser. */
function klFeatComfort(P) {
  if (P.G.comfort === false) return;
  const comfortKey = 'story-editor-comfort'; // shared by every story in this browser
  const comfort = P.readJson(comfortKey) || {};
  const el = P.el;
  /* Contrast starts as the system asks (prefers-contrast: more) until the reader presses Normal or High once */
  const sysHc = !!window.matchMedia?.('(prefers-contrast:more)').matches;
  const val = k => (k === 'hc' && comfort.hc === undefined && sysHc ? '1' : comfort[k] || '');
  const ROWS = [
    [
      'size',
      'Text size',
      [
        ['', 'Normal'],
        ['1', 'Large'],
        ['2', 'Larger']
      ]
    ],
    [
      'space',
      'Spacing',
      [
        ['', 'Normal'],
        ['1', 'Roomy']
      ]
    ],
    [
      'hc',
      'Contrast',
      [
        ['', 'Normal'],
        ['1', 'High']
      ]
    ],
    [
      'calm',
      'Motion',
      [
        ['', 'Normal'],
        ['1', 'Less']
      ]
    ],
    [
      'nums',
      'Choice numbers',
      [
        ['', 'Hide'],
        ['1', 'Show']
      ]
    ]
  ];
  /** The classes on the story's wrapper for the reader's current choices. */
  const cls = () =>
    [comfort.size && `cf-s${comfort.size}`, comfort.space && 'cf-roomy', val('hc') && 'cf-hc', comfort.calm && 'cf-calm', comfort.nums && 'cf-nums']
      .filter(Boolean)
      .join(' ');
  P.on('wrapClass', cls);
  /* the open panel closes with Esc or a click anywhere else (it sits over the choices) */
  document.addEventListener('keydown', e => {
    const o = e.key === 'Escape' && document.querySelector('.kl-aa[open]');
    if (o) (o.open = false), o.firstChild.focus(), e.preventDefault(); // Esc closes only this panel (not also Back)
  });
  document.addEventListener('click', e => {
    const o = document.querySelector('.kl-aa[open]');
    if (o && !o.contains(e.target)) o.open = false;
  });
  P.on('barRight', (p, wrap) => {
    let fit = () => {};
    const d = el('details', 'kl-aa');
    const sum = el('summary', '', 'Aa');
    sum.title = 'Reading settings';
    sum.setAttribute('aria-label', 'Reading settings: text size, spacing, contrast and motion');
    d.appendChild(sum);
    const box = el('div', 'kl-aa-box');
    ROWS.forEach(([k, name, choices]) => {
      const row = el('div', 'kl-aa-row');
      row.appendChild(el('span', 'kl-aa-name', name));
      choices.forEach(([v, text]) => {
        const b = el('button', '', text);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(val(k) === v));
        b.onclick = () => {
          comfort[k] = v;
          P.writeJson(comfortKey, comfort);
          wrap.className = `kl ${cls()}`;
          fit();
          row.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        };
        row.appendChild(b);
      });
      box.appendChild(row);
    });
    // other modules (the endings tracker) may add a button of their own to this panel
    P.collect('aaExtra').forEach(x => box.appendChild(x));
    d.appendChild(box);
    /* opens upward; on a short page there may be no room above, and the top rows could not be reached: open downward then */
    fit = () => {
      box.style.top = box.style.bottom = box.style.right = '';
      const r = d.open && box.getBoundingClientRect();
      if (r && r.top < 0) (box.style.top = '2.4em'), (box.style.bottom = 'auto');
      if (r && r.left < 8) box.style.right = `${r.left - 8}px`; // the Aa button can sit well left of the right edge (a wrapped bar): slide the panel back on screen
    };
    d.addEventListener('toggle', fit);
    return d;
  });
}

/* Registration: this order is the order the modules start (KL_FEATURE_ORDER in core.js lists the same names). */
KL_FEATS.ask = klFeatAsk;
KL_FEATS.back = klFeatBack;
KL_FEATS.dice = klFeatDice;
KL_FEATS.locks = klFeatLocks;
KL_FEATS.bars = klFeatBars;
KL_FEATS.tracker = klFeatTracker;
KL_FEATS.place = klFeatPlace;
KL_FEATS.comfort = klFeatComfort;
