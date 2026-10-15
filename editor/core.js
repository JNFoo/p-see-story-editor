/* ============================================================================
   PART 1 OF 3 · CORE  (story model, game rules, checker, import, export)
   ----------------------------------------------------------------------------
   Pure logic. Nothing in this part touches the page (no DOM), so it can be
   read, tested and reused on its own.

   Contents
     1. Small utilities
     2. The story model         (makePassage, makeItem, normalizeProject ...)
     3. The game rules          (klCondOk, klArrive ...)  <- also copied into exports
     4. "Where things went"     (objects left behind or handed over)
     5. The checker             (analyze)
     7. Import of the old text format
     8. Export of a finished game
   The map's layouts live in maplayout.js (PART 1b); section 6 moved there.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   1. Small utilities
   --------------------------------------------------------------------------- */

/** Ids that must never be used as object keys (they exist on every JS object). */
const RESERVED_IDS = [
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'toString',
  'valueOf',
  'toLocaleString',
  'isPrototypeOf',
  'propertyIsEnumerable'
];

/** Makes a short, unique-enough id such as "p_k3j9x2ab". Ids are labels, not secrets. */
function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-2);
}

/** Copies plain data (objects, arrays, strings, numbers). */
function deepCopy(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Removes duplicates from a list, keeping the first of each. */
function uniqList(a) {
  const seen = Object.create(null);
  const out = [];
  (a || []).forEach(x => {
    if (!seen[x]) {
      seen[x] = 1;
      out.push(x);
    }
  });
  return out;
}

/** "end_good" -> "End good". Used when importing old stories. */
function prettyName(s) {
  s = String(s).replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Untitled page';
}

/** Joins words the way people talk: "a, b and c". */
function joinAnd(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/* ---------------------------------------------------------------------------
   2. The story model
   ---------------------------------------------------------------------------
   project = {
     format: 'story-editor', version: 1, id, title, author, start,
     gameFont: 'system',     // optional: exported games use the device's own font instead of the embedded one (smaller file)
     game:     { back, tracker, comfort, odds, place, pal }, // optional reader options (see GAME_OPTIONS); only non-default values are kept
     lang0c:   'en',         // optional: the story's own language code (en, es, ar...), used for the game's lang and direction
     lang0:    'English',    // optional: what the story's own language is called in the game's language picker
     langs:    [{ id, name, code, t: { 'source text': 'translation' } }],   // optional translations (see section "Translations"); the key is the exact source text
     items:    [{ id, name, kind: 'object' | 'state' | 'stat', show,
                  lo, hi, start,                           // stats only: a number from lo to hi, begun at `start`
                  names: [{ when: itemId, name }] }],   // optional: shown under another name while the player has/is `when`
     givens:   [{ id, question, options: [stateId] }],  // asked before page one; the player becomes exactly one option
     passages: [{ id, name, heading, ending, valence: '' | 'good' | 'bad',
                  todo: false,                // the author's "unfinished" flag; never exported, never read by the checker or the game
                  color: '', note: '',        // the author's own color mark (one of PAGE_COLORS, or '') and a private note; shown on the map and in the page list, never exported
                  blocks:  [{ text, needs[], forbid[], orPrev }],   // paragraphs
                  gives[], takes[],           // item ids gained / lost on arrival
                  adds: { statId: number },   // stats raised (or lowered, if negative) on arrival
                  sends: { objectId: 'here' | 'w:<recipient>' },   // where a lost object went
                  choices: [{ label, to, needs[], forbid[],
                              gives[], takes[], adds: {},      // a choice can also give or take items, or change stats, the moment it is picked
                              check: null | { stat, target, fail },   // skill check: roll 2 dice + stat; reach `target` to go `to`, else to page `fail`
                              lock: false, why: '' }] }]       // lock: shown greyed out (with a reason) instead of hidden while its conditions are not met
   }
   A "stat" is a number (Courage 0 to 10). Conditions use the virtual id "t:<statId>:<n>", which means "the stat is n or more"
   ("needs" it to be, "forbid" it not to be). The game keeps each stat in `flags` as "v:<statId>".
   An "object" is something carried (and possibly handed over); a "state" is a
   condition the player is in (sick, brave ...). Both can gate text and choices.
   A "Given" is a question asked before the story starts ("Who are you?"). Its
   answers are ordinary states, so they gate text and choices like any state, but
   they are fixed for the whole story: pages never give or take them.
   --------------------------------------------------------------------------- */

/**
 * THE CONTRACT between the story model and the checker. Every field of every kind of object is listed here, as
 *   rules    it can change what a player sees or where they can go, so analyze() MUST read it, and exportStory() MUST keep it
 *   display  it is only words or looks (names, headings, colors); the checker may ignore it
 * contract.mjs runs on every build. It fails the build if a field exists that is not listed here, if analyze() never
 * reads a "rules" field, or if exportStory() drops one. So a new feature cannot be added to the editor or the game
 * without the checker being taught about it: list the field below, then make analyze() use it.
 */
const FIELD_CONTRACT = {
  project: { rules: ['start', 'items', 'givens', 'passages'], display: ['format', 'version', 'id', 'title', 'author', 'gameFont', 'game', 'rev', 'savedAt', 'lang0', 'lang0c', 'langs'] },
  item: { rules: ['id', 'kind', 'show', 'lo', 'hi', 'start'], display: ['name', 'names'] },
  given: { rules: ['options'], display: ['id', 'question'] },
  passage: { rules: ['id', 'ending', 'blocks', 'gives', 'takes', 'adds', 'sends', 'choices'], display: ['name', 'heading', 'valence', 'todo', 'color', 'note'] },
  block: { rules: ['needs', 'forbid', 'orPrev'], display: ['text'] },
  choice: { rules: ['to', 'needs', 'forbid', 'gives', 'takes', 'adds', 'check', 'lock'], display: ['label', 'why'] },
  check: { rules: ['stat', 'target', 'fail'], display: [] },
  game: { rules: [], display: [] } // filled from the GAME_OPTIONS table just below it
};

/** The colors an author can mark a page with (shown as a stripe on the map and a dot in the page list; the game never sees them). */
const PAGE_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'];
const PAGE_NOTE_MAX = 600;

/** A paragraph. `orPrev` means "use this only if the paragraph above was hidden". */
function makeBlock(text) {
  return { text: text || '', needs: [], forbid: [], orPrev: false };
}

/** A choice button. `to` is the id of the page it leads to ('' = nowhere yet). */
function makeChoice(label, to) {
  return { label: label || '', to: to || '', needs: [], forbid: [], gives: [], takes: [], adds: {}, check: null, lock: false, why: '' };
}

/** The ways the Back button can treat a skill-check roll (see player.js). */
const BACK_MODES = ['off', 'remember', 'reroll', 'block'];
/**
 * THE ONE TABLE of reader options (project.game, shown on the Game tab). Adding an option
 * means adding a row here and nothing else for the editor: the defaults, the cleaning of loaded files, the list of fields the
 * contract test knows, the export (only non-default values are kept) and the check boxes all read this table.
 *   key      the field name in project.game
 *   kind     'flag' (a check box) or 'choice' (drawn by hand in gameOptions(): the Back list, the color swatches)
 *   def      the value when the author has not changed it
 *   ok       choices only: is this a valid value
 *   on       does this value switch the option's game module on
 *   feature  the module in player.js that carries it (a name in KL_FEATURE_ORDER), or '' if it needs none
 *   label    the check box text and `hint` its tooltip (flags only)
 * The player itself still has to read the field (player.js) and klFeatures() has to pick the module; contract.mjs checks both
 * against this table.
 */
const GAME_OPTIONS = [
  { key: 'back', kind: 'choice', def: 'off', ok: v => BACK_MODES.includes(v), on: v => v !== 'off', feature: 'back' },
  {
    key: 'tracker',
    kind: 'flag',
    def: false,
    on: v => v,
    feature: 'tracker',
    label: 'Show “endings found” (such as 3 of 8) and remember them on the player’s device',
    hint: 'Gives players a reason to replay.'
  },
  {
    key: 'comfort',
    kind: 'flag',
    def: true,
    on: v => v,
    feature: 'comfort',
    label: 'Give players the Aa button (text size, spacing, contrast, calm motion)',
    hint: 'Recommended. Players can make the game easier to read.'
  },
  {
    key: 'odds',
    kind: 'flag',
    def: true,
    on: v => v,
    feature: '',
    label: 'Show the odds on dice checks (such as “Courage 4 + 2 dice vs 9: 72%”)',
    hint: 'Turn off to keep the odds a surprise.'
  },
  {
    key: 'place',
    kind: 'flag',
    def: false,
    on: v => v,
    feature: 'place',
    label: 'Give players a Place code (copy a code for where they are, and paste it on another device)',
    hint: 'Off by default so games stay small. The code replays the player’s route, so it works only on the same version of the story.'
  },
  { key: 'pal', kind: 'choice', def: 'paper', ok: v => PALETTE_KEYS.includes(v), on: () => false, feature: '' }
];
/** What the reader options (project.game) are when the author has not changed them. */
const GAME_DEFAULTS = Object.fromEntries(GAME_OPTIONS.map(o => [o.key, o.def]));
FIELD_CONTRACT.game.display = GAME_OPTIONS.map(o => o.key);
/** Biggest and smallest number a stat may hold, and the widest span between its lowest and highest value. */
const STAT_MIN = -50;
const STAT_MAX = 99;
const STAT_SPAN = 99;
/** Stat ranges longer than this make the checker slow (it tries every value), so the editor warns. */
const STAT_SPAN_COMFY = 20;

/**
 * The color choices for exported games ("Colors" on the Game tab). Each palette is a complete set of the game's
 * color variables. "paper" is the default and has a light and a dark set (it follows the reader's device); the others
 * are fixed. contract.mjs checks the text/background contrast of every set at build time (WCAG AA, 4.5 to 1), so a
 * palette that is hard to read cannot ship. paletteCss() writes the stylesheet for them all.
 */
const PALETTES = {
  paper: {
    name: 'Paper',
    note: 'Warm paper; follows the reader’s light or dark setting',
    light: {
      bg: '#e7e3d8',
      paper: '#fffaee',
      fg: '#1b252a',
      muted: '#566067',
      line: '#cdc4b0',
      lamp: '#a64f00',
      lampbg: '#ffefcf',
      signal: '#c42f2a',
      good: '#1d7a44'
    },
    dark: {
      bg: '#0b1519',
      paper: '#112027',
      fg: '#dce7ea',
      muted: '#8fa5ac',
      line: '#26414a',
      lamp: '#f0b44c',
      lampbg: '#2a2210',
      signal: '#ee6b62',
      good: '#6fcf93'
    }
  },
  night: {
    name: 'Night',
    note: 'Always dark',
    dark: {
      bg: '#05080b',
      paper: '#0e1a22',
      fg: '#e6eef0',
      muted: '#9db2b9',
      line: '#2a4753',
      lamp: '#f0b44c',
      lampbg: '#2a2210',
      signal: '#ff7a70',
      good: '#7bdca1'
    }
  },
  sepia: {
    name: 'Sepia',
    note: 'Always light, like an old book',
    light: {
      bg: '#d9c7a3',
      paper: '#f4e8cc',
      fg: '#3a2c1a',
      muted: '#5e4a30',
      line: '#bfa878',
      lamp: '#8a3d00',
      lampbg: '#ead9ae',
      signal: '#a32a1c',
      good: '#2f6a2f'
    }
  },
  ocean: {
    name: 'Ocean',
    note: 'Always light, cool blues',
    light: {
      bg: '#d4e4ee',
      paper: '#f4f9fc',
      fg: '#12232f',
      muted: '#44596a',
      line: '#b4cbdb',
      lamp: '#0b5a99',
      lampbg: '#dcecf8',
      signal: '#b3261e',
      good: '#17703f'
    }
  },
  forest: {
    name: 'Forest',
    note: 'Always dark, deep greens',
    dark: {
      bg: '#0d1a12',
      paper: '#14261a',
      fg: '#e1efe3',
      muted: '#9cbba2',
      line: '#2c4a35',
      lamp: '#e0c14a',
      lampbg: '#26280f',
      signal: '#ff8a78',
      good: '#82e29b'
    }
  },
  contrast: {
    name: 'High contrast',
    note: 'Strongest contrast: bright yellow on black',
    dark: {
      bg: '#000000',
      paper: '#000000',
      fg: '#ffffff',
      muted: '#e6e6e6',
      line: '#ffffff',
      lamp: '#ffe14a',
      lampbg: '#1f1c00',
      signal: '#ff9a8f',
      good: '#8dffb0'
    }
  }
};
const PALETTE_KEYS = Object.keys(PALETTES);
/** `--bg:#fff;--paper:...` for one color set. */
const paletteVars = set =>
  Object.keys(set)
    .map(k => `--${k}:${set[k]}`)
    .join(';');
/**
 * The color stylesheet. With no argument, every palette (the editor's Play tab needs them all: the default follows the editor's
 * light / dark switch, and the author can change palette at any time). For an exported game pass { pal, hc }: only the chosen
 * palette, and the high-contrast colors only if the game has the Aa button (hc), so a game carries no colors it can never show.
 */
function paletteCss(sel) {
  const d = PALETTES.paper;
  const dark = paletteVars(d.dark);
  const rules = [];
  if (!sel || sel.pal === 'paper') {
    rules.push(`.kl{${paletteVars(d.light)}}`, `@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .kl{${dark}}}`);
    if (!sel) rules.push(`[data-theme=dark] .kl{${dark}}`); // the editor's own switch; an exported game has none
  }
  PALETTE_KEYS.forEach(k => {
    const pl = PALETTES[k];
    if (k !== 'paper' && (!sel || sel.pal === k)) rules.push(`:root .kl[data-pal=${k}]{${paletteVars(pl.light || pl.dark)}}`);
  });
  if (!sel || sel.hc) rules.push(`:root .kl.cf-hc{${paletteVars(PALETTES.contrast.dark)}}`); // the reader's own "High contrast" choice (Aa)
  return `${rules.join('\n')}\n`;
}

/* ----------------------------------------------------------------------------
   LITE EXPORTS: a game carries only the features its story uses
   ---------------------------------------------------------------------------- */

/**
 * The optional features of the game player, in the order they are registered (see the top of player.js). Each has a
 * function klFeat<Name> in player.js and a styles section of the same name in game.css (ask has none).
 */
const KL_FEATURE_ORDER = ['ask', 'back', 'dice', 'locks', 'bars', 'tracker', 'place', 'lang', 'comfort'];

/**
 * Which optional features a story needs. `story` is the object exportStory() makes (what the player sees). Exports carry
 * exactly these modules and their styles. When in doubt this errs on the side of including a feature; the contract test and
 * the lite-against-full browser test check that nothing needed is ever left out.
 */
function klFeatures(story) {
  const G = story.game || {};
  const pages = story.passages || [];
  const choices = pages.flatMap(p => p.choices || []);
  const on = {
    ask: (story.givens || []).some(g => g.options && g.options.length),
    dice: choices.some(c => c.check),
    locks: choices.some(c => c.lock),
    bars: (story.items || []).some(i => i.kind === 'stat' && i.show),
    lang: !!(story.langs && story.langs.length)
  };
  /* the modules that a reader option switches on come from the GAME_OPTIONS table (the exported story keeps only non-default values) */
  GAME_OPTIONS.forEach(o => {
    if (o.feature) on[o.feature] = !!o.on(G[o.key] === undefined ? o.def : G[o.key]);
  });
  /* ...but a module with nothing to work on is left out */
  if (on.tracker && !pages.some(p => p.ending)) on.tracker = false;
  if (on.place && !pages.some(p => (p.choices || []).length)) on.place = false;
  return KL_FEATURE_ORDER.filter(n => on[n]);
}

/**
 * The stylesheet of a game. `css` = { base, back, dice, ... } (the parts build-game.mjs made from game.css), `features` = the
 * names to include, `game` = the story's reader options (colors follow its palette), or null for the editor's Play tab (everything).
 */
function gameCss(css, features, game) {
  const pal = game ? paletteCss({ pal: game.pal, hc: features.includes('comfort') }) : paletteCss();
  return pal + css.base + features.map(n => css[n] || '').join('');
}

/**
 * The code of a game: the rules and the core player (`js.head`), the chosen feature modules (`js.feats[name]`) and the line
 * that starts it. `js` is made by build-game.mjs.
 */
function gameScript(js, features) {
  const start = "klPlayer(document.getElementById('game'),JSON.parse(document.getElementById('story-data').textContent),{persist:true});";
  return `(()=>{\n${js.head}\n${features.map(n => js.feats[n]).join('\n')}\n${start}\n})();`;
}

/** An object, a state or a stat (a number). New ones are shown to the player until the author hides them. */
function makeItem(name, kind) {
  kind = kind === 'state' || kind === 'stat' ? kind : 'object';
  const it = { id: uid('i_'), name: name || (kind === 'state' ? 'New state' : kind === 'stat' ? 'New number' : 'New object'), kind, show: true };
  if (kind === 'stat') Object.assign(it, { lo: 0, hi: 10, start: 0 });
  return it;
}

/** The kind of an item as one of 'object' | 'state' | 'stat'. */
const kindOf = it => (it && it.kind === 'state' ? 'state' : it && it.kind === 'stat' ? 'stat' : 'object');
/** The virtual condition id meaning "stat `id` is `n` or more". */
const statTest = (id, n) => `t:${id}:${n}`;
/** Splits a "t:<stat>:<n>" id into { stat, n }, or null if it is not one. */
function parseStatTest(id) {
  const m = /^t:([^:]+):(-?\d+)$/.exec(id);
  return m ? { stat: m[1], n: +m[2] } : null;
}

/** A story page with one empty paragraph. */
function makePassage(name) {
  return {
    id: uid('p_'),
    name: name || 'Untitled page',
    heading: '',
    ending: false,
    valence: '',
    todo: false,
    color: '',
    note: '',
    blocks: [makeBlock('')],
    gives: [],
    takes: [],
    adds: {},
    sends: {},
    choices: []
  };
}

/** A new story with a single starting page. */
function makeProject(title) {
  const p = {
    format: 'story-editor',
    version: STORY_VERSION,
    id: uid('s_'),
    title: title || 'Untitled story',
    author: '',
    start: '',
    items: [],
    givens: [],
    passages: [],
    game: cleanGame()
  };
  const first = makePassage('The beginning');
  p.passages.push(first);
  p.start = first.id;
  return p;
}

/**
 * Turns anything that was saved earlier (or edited by hand, or is malformed or
 * hostile) into a clean, safe project. Every value is coerced to the expected
 * type, ids are validated, and references to things that do not exist are dropped.
 * Throws an Error with a friendly message if the data is not a story at all.
 */
/** The story file format this editor writes. A file with an older number is brought up to date by MIGRATIONS; a newer one is opened with a warning. */
const STORY_VERSION = 1;
/**
 * The upgrade chain: MIGRATIONS[n] takes the raw data of a version-n file and returns the raw data of a version n+1 file.
 * Empty while there is only version 1. When the format changes, bump STORY_VERSION, add the step here, and keep an old-format file in
 * qa/fixtures so the story-format test proves it still opens (that test already opens every fixture there).
 */
const MIGRATIONS = {};
/** Set by normalizeProject when it had to change something the author should hear about (shown after opening a file). */
let startFixNote = '';
function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.passages)) {
    throw new Error('This file is not a story backup.');
  }
  const fileVersion = Math.round(Number(raw.version)) || 1;
  for (let v = fileVersion; MIGRATIONS[v]; v++) raw = MIGRATIONS[v](raw); // oldest format first, one step at a time
  const A = x => (Array.isArray(x) ? x : []); // a field of the wrong type (a hand-edited file) counts as empty instead of crashing
  const taken = Object.create(null); // ids already handed out
  const itemMap = Object.create(null); // id as found in the file -> id we use
  const passMap = Object.create(null); // same, for pages

  /* Ids become object keys and are shown in nothing, so they only need to be
     simple and unique. Anything else gets a fresh id. */
  function cleanId(found, prefix, map) {
    let id = String(found === undefined || found === null ? '' : found);
    if (!/^[A-Za-z0-9_\-]{1,64}$/.test(id) || RESERVED_IDS.includes(id) || taken[id]) id = uid(prefix);
    while (taken[id]) id = uid(prefix);
    taken[id] = true;
    if (map && found !== undefined && found !== null && map[String(found)] === undefined) map[String(found)] = id;
    return id;
  }

  const p = {
    format: 'story-editor',
    version: STORY_VERSION,
    id: String(raw.id || uid('s_')).slice(0, 64),
    title: String(raw.title || 'Untitled story'),
    author: String(raw.author || ''),
    start: '',
    items: [],
    givens: [],
    passages: []
  };
  /* the revision counter and the time of the last save to a file (written by Save; display only, the game never reads them) */
  if (raw.rev !== undefined || raw.savedAt !== undefined) {
    const r = Math.round(Number(raw.rev));
    if (Number.isFinite(r) && r > 0) p.rev = Math.min(r, 1e9);
    if (typeof raw.savedAt === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]{5,16}Z$/.test(raw.savedAt)) p.savedAt = raw.savedAt;
  }

  const intIn = (v, lo, hi, d) => {
    v = Math.round(Number(v));
    return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  };
  A(raw.items).forEach(it => {
    if (!it) return;
    const kind = it.kind === 'state' || it.kind === 'stat' ? it.kind : 'object';
    const clean = {
      id: cleanId(it.id, 'i_', itemMap),
      name: String(it.name || 'Item'),
      kind,
      show: !!it.show
    };
    if (kind === 'stat') {
      clean.lo = intIn(it.lo, STAT_MIN, STAT_MAX - 1, 0);
      clean.hi = intIn(it.hi, clean.lo + 1, Math.min(STAT_MAX, clean.lo + STAT_SPAN), Math.min(STAT_MAX, clean.lo + 10));
      clean.start = intIn(it.start, clean.lo, clean.hi, clean.lo);
    }
    clean._names = Array.isArray(it.names) ? it.names : [];
    p.items.push(clean);
  });
  /* "shown as" names: only for a state or object that exists */
  p.items.forEach(it => {
    const names = it._names
      .map(n => (n && itemMap[String(n.when)] && String(n.name || '').trim() ? { when: itemMap[String(n.when)], name: String(n.name).trim() } : null))
      .filter(Boolean);
    delete it._names;
    if (names.length) it.names = names;
  });

  /* Givens: each answer must be a state, and a state can answer only one Given */
  const answer = Object.create(null);

  const isState = Object.create(null);
  p.items.forEach(it => {
    if (it.kind === 'state') isState[it.id] = true;
  });
  (Array.isArray(raw.givens) ? raw.givens : []).forEach(g => {
    if (!g) return;
    const opts = uniqList(A(g.options).map(id => itemMap[String(id)]).filter(id => id && isState[id] && !answer[id]));
    const gid = cleanId(g.id, 'g_');
    opts.forEach(id => {
      answer[id] = gid;
    });
    p.givens.push({ id: gid, question: String(g.question || 'Who are you?'), options: opts });
  });
  const rawPages = raw.passages.filter(q => q && typeof q === 'object'); // an entry that is not a page (hand-edited file) is skipped
  rawPages.forEach(q => {
    if (q) q._newId = cleanId(q.id, 'p_', passMap);
  });

  /* Keep only ids that exist. Conditions may also name "where things went" (m: ids);
     those are re-validated at the end by pruneVirtual(). */
  function item(id) {
    return itemMap[String(id)];
  }
  const isStat = Object.create(null);
  p.items.forEach(it => {
    if (it.kind === 'stat') isStat[it.id] = true;
  });
  /** A condition list: items, "where it went" ids (checked later by pruneVirtual) and stat tests ("t:<stat>:<n>"). */
  function known(list) {
    return uniqList(
      A(list)
        .map(id => {
          id = String(id);
          if (id.indexOf('m:') === 0) return id;
          if (id.indexOf('t:') === 0) {
            const t = parseStatTest(id);
            const st = t && item(t.stat);
            return st && isStat[st] ? statTest(st, t.n) : null;
          }
          const r = item(id);
          return r && !isStat[r] ? r : null; // a stat is tested with "t:" ids, never on its own
        })
        .filter(Boolean)
    );
  }
  /** Items a page or choice can give or take: real items, but never a stat (stats change by adding) or a Given answer. */
  function knownReal(list) {
    return uniqList(A(list).map(item).filter(id => id && !isStat[id]));
  }
  /** { statId: whole number } of stat changes, dropping zeros and anything that is not a stat. */
  function cleanAdds(o) {
    const out = {};
    if (o && typeof o === 'object')
      Object.keys(o).forEach(k => {
        const id = item(k);
        const d = intIn(o[k], -STAT_SPAN, STAT_SPAN, 0);
        if (id && isStat[id] && d) out[id] = d;
      });
    return out;
  }

  rawPages.forEach(q => {
    if (!q) return;
    const blocks = A(q.blocks).map(b => ({
      text: String((b && b.text) || ''),
      needs: known(b && b.needs),
      forbid: known(b && b.forbid),
      orPrev: !!(b && b.orPrev)
    }));
    if (!blocks.length) blocks.push(makeBlock(''));
    const sends = {};
    if (q.sends && typeof q.sends === 'object') {
      Object.keys(q.sends).forEach(k => {
        if (item(k) && typeof q.sends[k] === 'string') sends[item(k)] = q.sends[k];
      });
    }
    p.passages.push({
      id: q._newId,
      name: String(q.name || 'Untitled page'),
      heading: String(q.heading || ''),
      ending: !!q.ending,
      valence: q.valence === 'good' || q.valence === 'bad' ? q.valence : '',
      todo: !!q.todo,
      color: PAGE_COLORS.includes(q.color) ? q.color : '',
      note: String(q.note || '').slice(0, PAGE_NOTE_MAX),
      blocks,
      gives: knownReal(q.gives).filter(id => !answer[id]), // Givens never change during the story
      takes: knownReal(q.takes).filter(id => !answer[id]),
      adds: cleanAdds(q.adds),
      sends,
      choices: A(q.choices).map(c => {
        const k = c && c.check && typeof c.check === 'object' ? c.check : null;
        const stat = k && item(k.stat);
        return {
          label: String((c && c.label) || ''),
          to: (c && passMap[String(c.to)]) || '',
          needs: known(c && c.needs),
          forbid: known(c && c.forbid),
          gives: knownReal(c && c.gives).filter(id => !answer[id]),
          takes: knownReal(c && c.takes).filter(id => !answer[id]),
          adds: cleanAdds(c && c.adds),
          check: stat && isStat[stat] ? { stat, target: intIn(k.target, -STAT_SPAN, STAT_SPAN + 12, 7), fail: passMap[String(k.fail)] || '' } : null,
          lock: !!(c && c.lock),
          why: String((c && c.why) || '').slice(0, 120)
        };
      })
    });
  });
  if (!p.passages.length) p.passages.push(makePassage('The beginning'));
  p.start = passMap[String(raw.start)] || p.passages[0].id;
  /* the first page can never be an ending: a story that begins by ending is not a story, so such a page becomes a normal one */
  startFixNote = '';
  const sp0 = p.passages.find(q => q.id === p.start);
  if (sp0 && sp0.ending) {
    sp0.ending = false;
    sp0.valence = '';
    startFixNote = `“${sp0.name}” was marked as an ending, but it is where the story starts, and a first page cannot be an ending. It is now a normal page.`;
  }
  if (raw.gameFont === 'system') p.gameFont = 'system';
  p.game = cleanGame(raw.game);
  const langs = cleanLangs(raw.langs);
  if (langs.length) p.langs = langs;
  if (typeof raw.lang0 === 'string' && raw.lang0.trim() && raw.lang0.trim() !== 'English') p.lang0 = raw.lang0.trim().slice(0, LANG_NAME_MAX);
  if (typeof raw.lang0c === 'string' && LANG_CODE.test(raw.lang0c.trim()) && raw.lang0c.trim().toLowerCase() !== 'en') p.lang0c = raw.lang0c.trim();
  pruneVirtual(p);
  if (fileVersion > STORY_VERSION && !startFixNote) startFixNote = `This story was saved by a newer version of the editor (file format ${fileVersion}; this editor reads format ${STORY_VERSION}). It opened, but anything this editor does not know about was left out. Do not save over the original file.`;
  return p;
}

/* ---------------------------------------------------------------------------
   Translations
   ---------------------------------------------------------------------------
   A translation is a table from the exact source text to its translation: project.langs[n].t = { 'Push the door open': 'Empuja la puerta' }.
   Keying by the words (not by a page and position) means moving, reordering or duplicating pages and paragraphs never mixes translations up,
   the same sentence on two pages is translated once, and a sentence that was edited simply shows up as "not translated yet".
   xlStrings lists everything a player can read, each different text once. An exported game carries each language as lists lined up with the
   exported story (xlCompile), and the game's `lang` module swaps the words in when the reader picks a language.
   --------------------------------------------------------------------------- */

const LANG_MAX = 12;
const LANG_NAME_MAX = 40;
const LANG_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const LANG_RTL = /^(ar|he|fa|ur|yi|ps|sd|ug|dv)$/i; // languages written right to left (the game sets dir from the code)
const LANG_TEXT_MAX = 4000;
const LANG_ENTRIES_MAX = 8000;
/** The fixed words of the game itself that a translation can cover (the player calls T() on each). */
const LANG_UI = ['The end.', 'Play again', 'Start over', 'Tap again to start over', 'Back', 'Roads not taken', 'Carrying:', 'Feeling / status:'];

/** A text as a translation table key: line ends made alike, outer blanks removed. */
const xlNorm = s => String(s === undefined || s === null ? '' : s).replace(/\r\n?/g, '\n').trim();

/**
 * Every text a player can read, in reading order, each different text once: [{ text, where, more }]. `where` names the first place it
 * is used (for the translator) and `more` counts the other places. Item names are included when the game can show them.
 */
function xlStrings(project) {
  const index = Object.create(null);
  const out = [];
  const add = (raw, where) => {
    const text = xlNorm(raw);
    if (!text) return;
    if (index[text]) index[text].more++;
    else out.push((index[text] = { text, where, more: 0 }));
  };
  add(project.title, 'Story title');
  LANG_UI.forEach(w => add(w, 'Game button or label'));
  const given = {};
  (project.givens || []).forEach(g => g.options.forEach(o => (given[o] = 1)));
  project.items.forEach(i => {
    if (!i.show && !given[i.id] && !(i.names || []).length) return;
    add(i.name, 'Item name');
    (i.names || []).forEach(n => add(n.name, `Another name for ${i.name || 'an item'}`));
  });
  (project.givens || []).forEach(g => add(g.question, 'Question asked before the story'));
  project.passages.forEach(p => {
    const nm = p.name || 'Untitled page';
    add(p.heading, `${nm}: heading`);
    p.blocks.forEach((b, k) => add(b.text, `${nm}: paragraph ${k + 1}`));
    p.choices.forEach((c, k) => {
      add(c.label, `${nm}: choice ${k + 1}`);
      if (c.lock) add(c.why, `${nm}: reason on locked choice ${k + 1}`);
    });
  });
  return out;
}

/** The translation table of a language, checked: text keys and values only, each cut to size. */
function cleanLangs(raw) {
  const out = [];
  const used = {};
  (Array.isArray(raw) ? raw : []).slice(0, LANG_MAX).forEach((L, n) => {
    if (!L || typeof L !== 'object') return;
    let id = String(L.id || '');
    if (!/^[A-Za-z0-9_\-]{1,24}$/.test(id) || used[id]) id = `lg${n + 1}`;
    while (used[id]) id += 'x';
    used[id] = true;
    const t = {};
    let count = 0;
    if (L.t && typeof L.t === 'object' && !Array.isArray(L.t))
      Object.keys(L.t).forEach(k => {
        const v = L.t[k];
        if (typeof v !== 'string' || !v.trim() || !k.trim() || k.length > LANG_TEXT_MAX || count >= LANG_ENTRIES_MAX) return;
        t[xlNorm(k)] = xlNorm(v).slice(0, LANG_TEXT_MAX);
        count++;
      });
    const code = String(L.code || '').trim();
    out.push({ id, name: String(L.name || 'Language').trim().slice(0, LANG_NAME_MAX) || 'Language', code: LANG_CODE.test(code) ? code : '', t });
  });
  return out;
}

/** How much of the story one language covers: { done, total, missing[] } counted in different texts. */
function xlCoverage(project, lang) {
  const all = xlStrings(project);
  const missing = all.filter(s => !lang.t[s.text]);
  return { done: all.length - missing.length, total: all.length, missing };
}

/**
 * One language ready for the game: the lists line up with the exported story `out` (items, Given questions, pages; blocks; the choices that
 * were exported). An empty text means "no translation, keep the original".
 */
function xlCompile(project, lang, out) {
  const g = s => lang.t[xlNorm(s)] || '';
  const L = { n: lang.name };
  if (lang.code) L.c = lang.code;
  const title = g(project.title);
  if (title) L.title = title;
  const ui = {};
  LANG_UI.forEach(w => g(w) && (ui[w] = g(w)));
  if (Object.keys(ui).length) L.ui = ui;
  L.i = out.items.map(x => g(x.name));
  const alt = {};
  out.items.forEach((x, k) => (x.names || []).some(n => g(n.name)) && (alt[k] = x.names.map(n => g(n.name))));
  if (Object.keys(alt).length) L.a = alt;
  if (out.givens && out.givens.some(q => g(q.question))) L.g = out.givens.map(q => g(q.question));
  L.p = out.passages.map(p => {
    const e = [g(p.heading), p.blocks.map(b => g(b.text)), (p.choices || []).map(c => g(c.label)), (p.choices || []).map(c => (c.lock ? g(c.why) : ''))];
    return e[0] || e[1].some(Boolean) || e[2].some(Boolean) || e[3].some(Boolean) ? e : 0;
  });
  return L;
}

/** The reader options, each value checked and every one present (so the editor can read them without guessing). */
function cleanGame(g) {
  g = g && typeof g === 'object' ? g : {};
  const out = {};
  GAME_OPTIONS.forEach(o => {
    const v = g[o.key];
    if (o.kind === 'choice') out[o.key] = o.ok(v) ? v : o.def;
    else out[o.key] = v === undefined ? o.def : o.def ? v !== false : v === true; // a flag that is on by default turns off only when exactly false
  });
  return out;
}

/** The Given that state `id` answers, or null. */
function givenOf(project, id) {
  for (let i = 0; i < (project.givens || []).length; i++) if (project.givens[i].options.includes(id)) return project.givens[i];
  return null;
}

/* ---------------------------------------------------------------------------
   3. The game rules
   ---------------------------------------------------------------------------
   These functions ARE the game. They are copied word for word (with
   Function.prototype.toString) into every exported game, so the editor's Play
   tab and the exported file always behave identically. The list that is copied
   is KL_RULES below, and the checker (section 5) must mirror every one of them:
   contract.mjs, run on every build, plays random stories with these functions
   and with analyze() and fails the build if they ever disagree.
   `flags` is a plain object: { itemId: true } for what the player has or is, and
   { 'v:<statId>': number } for each number (a missing number counts as 0).
   `st` is the numbers' limits, { statId: [lowest, highest, start] } (klStatMap).
   --------------------------------------------------------------------------- */

/**
 * True if the player has or is `id`. A stat test "t:<stat>:<n>" is true when that number is n or more.
 */
function klHas(flags, id) {
  if (id.charCodeAt(0) === 116 && id.charCodeAt(1) === 58) {
    const j = id.lastIndexOf(':');
    return (flags[`v:${id.slice(2, j)}`] || 0) >= +id.slice(j + 1);
  }
  return !!flags[id];
}

/** True if every "needs" item is in `flags` and no "forbid" item is. */
function klCondOk(c, flags) {
  let i;
  const n = c.needs || [];
  const f = c.forbid || [];
  for (i = 0; i < n.length; i++) if (!klHas(flags, n[i])) return false;
  for (i = 0; i < f.length; i++) if (klHas(flags, f[i])) return false;
  return true;
}

/** The paragraphs of page `p` the player sees, honoring conditions and "otherwise" chains. */
function klVisibleBlocks(p, flags) {
  const out = [];
  let chainDone = false;
  let i;
  let b;
  let ok;
  let show;
  const blocks = p.blocks || [];
  for (i = 0; i < blocks.length; i++) {
    b = blocks[i];
    ok = klCondOk(b, flags);
    if (b.orPrev) {
      show = !chainDone && ok;
      if (show) chainDone = true;
    } else {
      show = ok;
      chainDone = ok;
    }
    if (show) out.push(b);
  }
  return out;
}

/** { statId: [lowest, highest, start] } for the stats among a story's items. */
function klStatMap(items) {
  const st = {};
  (items || []).forEach(i => {
    if (i.kind === 'stat') st[i.id] = [i.lo || 0, i.hi === undefined ? 10 : i.hi, i.start || 0];
  });
  return st;
}

/** `flags` with every number at its starting value (given as `st`, see klStatMap). Changes and returns `flags`. */
function klInit(flags, st) {
  for (const id in st) if (st[id][2]) flags[`v:${id}`] = st[id][2];
  return flags;
}

/** Adds each change in `adds` ({ statId: amount }) to `next`, keeping every number inside its limits. Changes `next`. */
function klAdd(next, adds, st) {
  for (const id in adds) {
    const b = st && st[id];
    let v = (next[`v:${id}`] || 0) + adds[id];
    if (b) v = Math.max(b[0], Math.min(b[1], v));
    next[`v:${id}`] = v;
  }
}

/**
 * What the player has or is right after picking choice `c`, before arriving anywhere: what the choice gives is
 * added (forgetting any old "where it went" record for it), what it takes is removed, and its number changes apply.
 */
function klChoose(flags, c, st) {
  const next = {};
  let k;
  let i;
  const g = c.gives || [];
  const t = c.takes || [];
  if (!g.length && !t.length && !c.adds) return flags;
  for (k in flags) if (flags[k]) next[k] = flags[k];
  for (i = 0; i < g.length; i++) {
    for (k in next) if (k.indexOf(`m:${g[i]}:`) === 0) delete next[k];
    next[g[i]] = true;
  }
  for (i = 0; i < t.length; i++) delete next[t[i]];
  if (c.adds) klAdd(next, c.adds, st);
  return next;
}

/** The choices of page `p` the player can use right now. */
function klVisibleChoices(p, flags) {
  return (p.choices || []).filter(c => klCondOk(c, flags));
}

/** The choices of page `p` that appear at all: usable ones, plus locked ones (shown greyed out) that cannot be used yet. */
function klShown(p, flags) {
  return (p.choices || []).filter(c => c.lock || klCondOk(c, flags));
}

/**
 * What the player has or is after arriving on page `p`.
 * Order: what is given here comes back, so any record of where it went is forgotten; an object handed over
 * (or left here) is recorded as such, but only if the player really had it; then what is given is added,
 * what is taken is removed, and the page's number changes apply. A hand-over with no recipient typed is simply a loss.
 */
function klArrive(flags, p, st) {
  const next = {};
  const gives = p.gives || [];
  const takes = p.takes || [];
  const sends = p.sends || {};
  for (const k in flags) if (flags[k]) next[k] = flags[k];
  const forget = id => {
    for (const k in next) if (k.startsWith(`m:${id}:`)) delete next[k];
  };
  for (const id of gives) forget(id);
  for (const id of takes) {
    const d = sends[id];
    const who = typeof d === 'string' && d.startsWith('w:') ? d.slice(2).trim() : '';
    const to = d === 'here' ? `p:${p.id}` : who ? `w:${who}` : '';
    if (to && flags[id]) {
      forget(id);
      next[`m:${id}:${to}`] = true;
    }
  }
  for (const id of gives) next[id] = true;
  for (const id of takes) delete next[id];
  if (p.adds) klAdd(next, p.adds, st);
  return next;
}

/**
 * The page choice `c` leads to. An ordinary choice always goes to `c.to`. A skill check goes there if the dice
 * (`roll`, 2 to 12, two six-sided dice added together) plus the player's number reach the target, otherwise to the fail page.
 */
function klTarget(flags, c, roll) {
  const k = c.check;
  if (!k) return c.to;
  return roll + (flags[`v:${k.stat}`] || 0) >= k.target ? c.to : k.fail;
}

/** The chance (0 to 100, a whole percent) that skill check `k` succeeds for a player with these `flags`. */
function klOdds(flags, k) {
  const need = k.target - (flags[`v:${k.stat}`] || 0); // what two dice must add up to, at least
  if (need <= 2) return 100;
  if (need > 12) return 0;
  const ways = need <= 7 ? 36 - ((need - 2) * (need - 1)) / 2 : ((13 - need) * (14 - need)) / 2; // of the 36 equally likely rolls
  return Math.round((ways * 100) / 36);
}

/** The rule functions exported games carry, by name. contract.mjs and build-game.mjs read this list. */
const KL_RULES = [
  'klHas',
  'klCondOk',
  'klVisibleBlocks',
  'klStatMap',
  'klInit',
  'klAdd',
  'klChoose',
  'klVisibleChoices',
  'klShown',
  'klArrive',
  'klTarget',
  'klOdds'
];

/* ---------------------------------------------------------------------------
   4. "Where things went"
   ---------------------------------------------------------------------------
   When an object is lost on a page, the author can say where it went:
     sends[objectId] = 'here'          -> left on that page
     sends[objectId] = 'w:<text>'      -> handed to <text>
   The game then remembers it as a derived flag with an id such as
     m:<objectId>:p:<pageId>   or   m:<objectId>:w:<recipient>
   which any "show only if" box can use. These helpers keep that tidy.
   --------------------------------------------------------------------------- */

/** Reads a sends value. Returns { kind:'p' } | { kind:'w', rest:'text' } | null. */
function parseSend(v) {
  if (v === 'here') return { kind: 'p' };
  if (typeof v === 'string' && v.indexOf('w:') === 0) {
    const t = v.slice(2).trim();
    return t ? { kind: 'w', rest: t } : null;
  }
  return null;
}

/** Every "where it went" record that currently exists, with a readable label. */
function virtualRefs(project) {
  const items = {};
  const out = [];
  const seen = {};
  project.items.forEach(i => {
    items[i.id] = i;
  });
  project.passages.forEach(p => {
    (p.takes || []).forEach(id => {
      const it = items[id];
      if (!it || kindOf(it) !== 'object') return;
      const sd = parseSend((p.sends || {})[id]);
      if (!sd) return;
      const vid = `m:${id}:${sd.kind === 'p' ? `p:${p.id}` : `w:${sd.rest}`}`;
      if (seen[vid]) return;
      seen[vid] = true;
      out.push({
        id: vid,
        itemId: id,
        kind: sd.kind,
        pageId: sd.kind === 'p' ? p.id : '',
        label: sd.kind === 'p' ? `${it.name} left on ${p.name || 'Untitled page'}` : `${it.name} handed to ${sd.rest}`
      });
    });
  });
  return out;
}

/**
 * Drops hand-over data, stat changes, skill checks and conditions that point at things that no longer exist
 * (a deleted object, stat or page). Runs after every edit, so the story never holds a dangling reference.
 */
function pruneVirtual(project) {
  const kinds = {};
  const pages = {};
  project.items.forEach(i => {
    kinds[i.id] = kindOf(i);
  });
  project.passages.forEach(p => {
    pages[p.id] = true;
  });
  project.passages.forEach(p => {
    const keep = {};
    Object.keys(p.sends || {}).forEach(id => {
      const v = p.sends[id];
      if (kinds[id] === 'object' && p.takes.includes(id) && (v === 'here' || (typeof v === 'string' && v.indexOf('w:') === 0))) keep[id] = v;
    });
    p.sends = keep;
  });
  const valid = {};
  virtualRefs(project).forEach(v => {
    valid[v.id] = true;
  });
  function clean(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      const id = list[i];
      if (id.indexOf('m:') === 0 ? !valid[id] : id.indexOf('t:') === 0 ? kinds[(parseStatTest(id) || {}).stat] !== 'stat' : false) list.splice(i, 1);
    }
  }
  function cleanAddsOf(o) {
    if (o) Object.keys(o).forEach(k => kinds[k] !== 'stat' && delete o[k]);
  }
  project.passages.forEach(p => {
    cleanAddsOf(p.adds);
    p.blocks.forEach(b => {
      clean(b.needs);
      clean(b.forbid);
    });
    p.choices.forEach(c => {
      clean(c.needs);
      clean(c.forbid);
      cleanAddsOf(c.adds);
      if (c.check) {
        if (kinds[c.check.stat] !== 'stat') c.check = null;
        else if (c.check.fail && !pages[c.check.fail]) c.check.fail = '';
      }
    });
  });
}

/** The "where it went" id that page `p` creates for object `id` with sends value `v` ('' if none). */
function vidOf(p, id, v) {
  const sd = parseSend(v);
  if (!sd) return '';
  return `m:${id}:${sd.kind === 'p' ? `p:${p.id}` : `w:${sd.rest}`}`;
}

/** Renames a "where it went" id everywhere it is used in conditions. */
function renameVirtual(project, oldId, newId) {
  function r(list) {
    const i = list.indexOf(oldId);
    if (i >= 0) list[i] = newId;
  }
  project.passages.forEach(p => {
    p.blocks.forEach(b => {
      r(b.needs);
      r(b.forbid);
    });
    p.choices.forEach(c => {
      r(c.needs);
      r(c.forbid);
    });
  });
}

/** "Only if wallet and not sick" - a one-line plain-English summary of a condition. */
function condSummary(c, nameOf) {
  const parts = [];
  (c.needs || []).forEach(id => {
    parts.push(nameOf(id));
  });
  (c.forbid || []).forEach(id => {
    parts.push(id.indexOf('t:') === 0 ? `${nameOf(id).replace(/ \d+ or more$/, '')} below ${parseStatTest(id)?.n}` : `not ${nameOf(id)}`);
  });
  return parts.length ? `Only if ${joinAnd(parts)}` : '';
}

/* ---------------------------------------------------------------------------
   5. The checker
   ---------------------------------------------------------------------------
   Plays the story for you. It explores every situation (page + what the player
   has and is) that a player could reach, breadth first, using exactly the game's
   rules (klChoose, then klArrive). It reports:
     problems  things that stop a player: choices that lead nowhere, dead ends,
               pages nobody can reach, places a player gets stuck, loops a player
               can never leave
     warnings  things that are probably mistakes: missing words, text or choices
               that can never appear, two identical choices side by side, items
               that are unused, change nothing or can never be obtained, a choice
               that takes something the player never has
     notes     worth knowing, not mistakes: optional choices a player can miss for
               good, a page that takes something nobody has (often a deliberate
               reset) or gives something everybody already has
     endings   each ending, whether it can be reached, and the shortest way there
   Only items that can change what a player sees are tracked (an item no text,
   choice or name depends on, and that the player never sees, changes nothing), so
   most stories need few bits. Up to 30 tracked items use fast numbers; beyond that
   BigInt, which is slower but has no limit. Work stops after `limit` situations,
   and then nothing is reported as impossible: it may simply not have been found.
   Numbers are not tracked value by value: values that the story can never tell apart share one situation (klGroupValues),
   so a number tested only against 6 costs 7 situations, not 11. Nothing reported changes; "Test from here" replays a route
   so it still shows real values.
   Returns { problems[], warnings[], notes[], endings[], states, grouped, truncated }.
   --------------------------------------------------------------------------- */
/**
 * Groups the values of one number that can never lead to a different result, so the checker keeps one situation for the
 * whole group instead of one per value. Two values are grouped only when (1) every "needs" test, "hidden when" test and
 * skill check in the story answers the same for both, and (2) after any change the story makes to this number (each
 * amount in `deltas`, kept inside the number's limits) they still land in the same group. Applying (2) until nothing
 * changes gives the coarsest grouping that is exact: nothing the checker reports can differ. A group is always a run of
 * neighboring values, numbered upward. `span` is the highest value above the lowest (0 to span); `cuts` are the values
 * above the lowest at which some test changes its answer ("at least 6" is a cut at 6 - lowest).
 * Returns { of: group of each value, first: lowest value of each group, last: highest value of each group }.
 */
function klGroupValues(span, cuts, deltas) {
  const cut = [...new Set(cuts)].filter(c => c > 0 && c <= span).sort((a, b) => a - b);
  const delta = [...new Set(deltas)].filter(d => d !== 0);
  let of = [];
  for (let v = 0; v <= span; v++) of.push(cut.filter(c => c <= v).length);
  let count = new Set(of).size;
  for (;;) {
    const ids = new Map();
    const next = of.map((g, v) => {
      const key = `${g}:${delta.map(d => of[Math.max(0, Math.min(span, v + d))]).join(',')}`;
      if (!ids.has(key)) ids.set(key, ids.size);
      return ids.get(key);
    });
    if (ids.size === count) break;
    of = next;
    count = ids.size;
  }
  /* number the groups upward and note each one's lowest and highest value */
  const rank = new Map();
  const first = [];
  const last = [];
  of = of.map((g, v) => {
    if (!rank.has(g)) {
      rank.set(g, rank.size);
      first.push(v);
      last.push(v);
    }
    last[rank.get(g)] = v;
    return rank.get(g);
  });
  return { of, first, last };
}

const EDGE_CAP = 150000; // above this many situations the move graph is not kept (no trap or way-back checks)

/** A story whose check passes this many situations, and that has numbers, is checked again with dead numbers forgotten (see analyzeRun). */
const PRUNE_AFTER = 20000;
/**
 * Checks a story: see analyzeRun for what comes back. Small stories are checked exactly as always. When a story with numbers has more
 * than PRUNE_AFTER situations, it is checked again with "dead" numbers forgotten, which gives the same verdicts in far fewer situations
 * (the answer then carries `pruned: true` and leaves numbers out of its explanations). `opt.prune` forces the choice (true or false).
 */
function analyze(project, limit = 200000, opt) {
  const o = opt || {};
  if (o.prune === true || o.prune === false) return analyzeRun(project, limit, o.prune);
  if (limit <= PRUNE_AFTER || !project.items.some(it => it.kind === 'stat')) return analyzeRun(project, limit, false);
  const first = analyzeRun(project, PRUNE_AFTER, false);
  return first.truncated ? analyzeRun(project, limit, true) : first;
}

function analyzeRun(project, limit, prune) {
  const order = project.passages;
  const byId = Object.create(null);
  const items = Object.create(null);
  order.forEach(p => {
    byId[p.id] = p;
  });
  project.items.forEach(it => {
    items[it.id] = it;
  });
  const vrefs = virtualRefs(project);
  const vById = Object.create(null);
  vrefs.forEach(v => {
    vById[v.id] = v;
  });
  const problems = [];
  const warnings = [];
  const notes = [];
  const P = (pid, msg) => problems.push({ pid, msg });
  const W = (pid, msg) => warnings.push({ pid, msg });
  const N = (pid, msg) => notes.push({ pid, msg });
  const label = p => `“${p.name || 'Untitled page'}”`;
  const iname = id => {
    if (id.startsWith('m:')) return vById[id]?.label || '?';
    const t = parseStatTest(id);
    if (t) return `${items[t.stat]?.name || 'unnamed'} ${t.n} or more`;
    return items[id]?.name || 'unnamed';
  };
  const q = s => `“${s}”`;
  const plural = (n, one, many) => (n === 1 ? one : many);

  if (!byId[project.start]) P('', 'The story has no first page.');

  /* --- checks that need no exploring --- */
  order.forEach(p => {
    if (!p.blocks.some(b => String(b.text).trim()) && !p.heading) W(p.id, `${label(p)} has no text yet.`);
    p.takes.forEach(id => {
      if (String(p.sends?.[id] ?? '').trim() === 'w:')
        W(
          p.id,
          `${label(p)} hands over ${q(iname(id))} but does not say to whom, so it is simply lost. Type who receives it, or switch “Hands over” off.`
        );
    });
    if (p.ending) {
      if (p.choices.length)
        W(
          p.id,
          `${label(p)} is an ending, so its ${p.choices.length === 1 ? 'choice is' : `${p.choices.length} choices are`} never shown. Delete ${plural(p.choices.length, 'it', 'them')}, or make this an ordinary page.`
        );
      return;
    }
    if (!p.choices.length) P(p.id, `${label(p)} is a dead end. Add a choice, or mark it as an ending.`);
    p.choices.forEach(c => {
      if (!String(c.label).trim()) W(p.id, `A choice on ${label(p)} has no words yet.`);
      if (!c.to) P(p.id, `A choice on ${label(p)}${c.label ? ` (${q(c.label)})` : ''} does not lead anywhere yet.`);
      else if (!byId[c.to]) P(p.id, `A choice on ${label(p)} leads to a page that no longer exists.`);
      const k = c.check;
      if (k && !k.fail)
        P(
          p.id,
          `The skill check ${q(c.label || 'unnamed')} on ${label(p)} has no page for when the roll fails. Pick one (a page that moves the story on is best).`
        );
      else if (k && !byId[k.fail])
        P(p.id, `The skill check ${q(c.label || 'unnamed')} on ${label(p)} sends a failed roll to a page that no longer exists.`);
      if (c.lock && !c.needs.length && !c.forbid.length)
        W(
          p.id,
          `The choice ${q(c.label || 'unnamed')} on ${label(p)} is set to show greyed out, but it has no “Only if” conditions, so it is never greyed out.`
        );
    });
  });
  /* number tests that can never be met, because the number's range does not allow them */
  const statLimit = (c, where, pid) => {
    (c.needs || []).forEach(id => {
      const t = parseStatTest(id);
      const it = t && items[t.stat];
      if (it && t.n > it.hi) W(pid, `${where} needs ${q(it.name)} to be ${t.n} or more, but it never goes above ${it.hi}.`);
    });
    (c.forbid || []).forEach(id => {
      const t = parseStatTest(id);
      const it = t && items[t.stat];
      if (it && t.n <= it.lo)
        W(pid, `${where} is hidden when ${q(it.name)} is ${t.n} or more, but it never goes below ${it.lo}, so it is always hidden.`);
    });
  };
  order.forEach(p => {
    p.blocks.forEach(b => statLimit(b, `A piece of text on ${label(p)}`, p.id));
    p.choices.forEach(c => statLimit(c, `The choice ${q(c.label || 'unnamed')} on ${label(p)}`, p.id));
  });

  /* --- housekeeping checks: slips that need no exploring (added Oct 8) --- */
  const startPage = byId[project.start];
  if (startPage && startPage.ending) P(startPage.id, `${label(startPage)} is an ending, but it is also where the story starts, so players would finish before they begin. A first page cannot be an ending.`);
  const seenName = Object.create(null);
  order.forEach(p => {
    const k = String(p.name).trim().toLowerCase();
    if (!k) return;
    (seenName[k] ||= []).push(p);
  });
  Object.keys(seenName).forEach(k => {
    const l = seenName[k];
    if (l.length > 1) W(l[1].id, `${l.length} pages are all called ${q(l[0].name)}. Give each page its own name so you can tell them apart in the lists and pickers.`);
  });
  const ttl = String(project.title || '').trim();
  if (!ttl || /^untitled story$/i.test(ttl)) N('', 'The story has no title yet. Type one in the top bar; it names the exported game.');
  const holes = /\b(todo|tbd|lorem ipsum|xxx+|placeholder|fixme)\b/i;
  let straight = 0,
    curly = 0;
  order.forEach(p => {
    if (/^untitled page( \(\d+\))?$/i.test(String(p.name).trim())) N(p.id, `${label(p)} still has its starting name. Rename it so it is easy to find.`);
    const texts = p.blocks.map(b => String(b.text)).concat(p.choices.map(c => String(c.label)), [String(p.heading)]);
    if (texts.some(t => holes.test(t))) W(p.id, `${label(p)} has a leftover placeholder word (TODO, TBD, lorem ipsum…) in its words.`);
    texts.forEach(t => {
      if (/["']/.test(t)) straight++;
      if (/[\u2018\u2019\u201C\u201D]/.test(t)) curly++;
    });
    const rep = /\b([a-z]{2,})\s+\1\b/i.exec(p.blocks.map(b => b.text).join('\n'));
    if (rep && !/^(had|that)$/i.test(rep[1])) N(p.id, `${label(p)} repeats a word: ${q(`${rep[1]} ${rep[1]}`)}. A typo?`);
    const words = p.blocks.reduce((n, b) => n + (String(b.text).match(/\S+/g) || []).length, 0);
    if (words > 350) N(p.id, `${label(p)} is long (${words} words). Players read it on one screen; splitting it (Ctrl+Shift+Enter at the cursor) gives them a choice sooner.`);
    if (!p.ending && p.choices.length > 7) N(p.id, `${label(p)} has ${p.choices.length} choices. Players may find that many hard to choose between.`);
    if (p.blocks.length > 1 && p.blocks.some(b => !String(b.text).trim())) W(p.id, `${label(p)} has an empty paragraph. Delete it, or write something in it.`);
    if (p.blocks[0] && p.blocks[0].orPrev) W(p.id, `The first paragraph on ${label(p)} is marked as an “otherwise” to text above it, but nothing is above it, so it never appears.`);
    const both = c => (c.needs || []).filter(id => (c.forbid || []).includes(id));
    p.blocks.forEach(b => {
      const x = both(b);
      if (x.length) W(p.id, `A piece of text on ${label(p)} needs and is also hidden by ${q(iname(x[0]))}, so it never appears.`);
    });
    p.gives.forEach(id => {
      if (p.takes.includes(id)) W(p.id, `${label(p)} both gives and takes ${q(iname(id))}, so they cancel out.`);
    });
    if (!p.ending) {
      const seen = Object.create(null);
      p.choices.forEach(c => {
        const x = both(c);
        if (x.length) W(p.id, `The choice ${q(c.label || 'unnamed')} on ${label(p)} needs and is also hidden by ${q(iname(x[0]))}, so it never appears.`);
        const lab = String(c.label).trim().toLowerCase();
        if (!lab) return;
        const key = `${lab}|${[...(c.needs || [])].sort()}|${[...(c.forbid || [])].sort()}`;
        if (seen[key]) W(p.id, `${label(p)} has two choices that both say ${q(c.label.trim())}. Players cannot tell them apart.`);
        seen[key] = true;
        if (lab.length > 120) N(p.id, `The choice ${q(c.label.slice(0, 40).trim() + '…')} on ${label(p)} is long (${lab.length} letters). Short choices read better on a button.`);
      });
    }
  });
  if (straight && curly) N('', 'The story mixes straight quotes (" and \') with curly ones (“ ”, ’). Turn on Options, Smart quotes and dashes, and retype the odd ones, so they match.');
  const itemNames = Object.create(null);
  project.items.forEach(it => {
    if (givenOf(project, it.id)) return;
    const k = `${kindOf(it)}|${String(it.name).trim().toLowerCase()}`;
    if (!String(it.name).trim()) return;
    if (itemNames[k]) warnings.push({ pid: '', items: true, kind: kindOf(it), msg: `Two ${kindOf(it) === 'stat' ? 'numbers' : `${kindOf(it)}s`} are both called ${q(it.name)}. Rename one so you can tell them apart.` });
    itemNames[k] = true;
  });

  /* pages nothing leads to: certain without exploring, so reported even when a huge story stops the check early */
  const linked = new Set();
  order.forEach(p => {
    if (!p.ending)
      p.choices.forEach(c => {
        linked.add(c.to);
        if (c.check) linked.add(c.check.fail);
      });
  });
  const orphan = new Set(order.filter(p => p.id !== project.start && !linked.has(p.id)).map(p => p.id));
  orphan.forEach(id =>
    P(
      id,
      `No choice leads to ${label(byId[id])}, so nobody can reach it${byId[id].ending ? ' (this ending can never happen)' : ''}. Link a choice to it, or delete it.`
    )
  );
  const endingsAll = order.filter(p => p.ending);
  if (endingsAll.length && !endingsAll.some(p => p.valence === 'good'))
    N('', 'The story has no good ending yet. Mark an ending as good when you have one; the map’s Good path and ending odds use it.');

  /* --- Givens, and items that are unused or change nothing --- */
  const condIds = new Set(); // everything any text, choice or "shown as" name depends on
  order.forEach(p =>
    p.blocks.concat(p.choices).forEach(c => {
      c.needs.forEach(id => condIds.add(id));
      c.forbid.forEach(id => condIds.add(id));
    })
  );
  project.items.forEach(x => (x.names || []).forEach(n => condIds.add(n.when)));
  const readsItem = id => condIds.has(id) || [...condIds].some(c => c.startsWith(`m:${id}:`));
  (project.givens || []).forEach(g => {
    if (g.options.length < 2)
      warnings.push({
        pid: '',
        items: true,
        kind: 'given',
        msg: `The Given ${q(g.question)} has ${g.options.length ? 'only one answer' : 'no answers'}. Add at least two on the Items tab.`
      });
    else if (!g.options.some(id => condIds.has(id)))
      warnings.push({
        pid: '',
        items: true,
        kind: 'given',
        msg: `The Given ${q(g.question)} does not change anything yet: no text, choice or item name depends on its answers.`
      });
  });
  const readStats = new Set(); // numbers some text, choice or skill check depends on
  condIds.forEach(id => {
    const t = parseStatTest(id);
    if (t) readStats.add(t.stat);
  });
  order.forEach(p => p.choices.forEach(c => c.check && readStats.add(c.check.stat)));
  project.items.forEach(it => {
    if (givenOf(project, it.id)) return; // a Given's answers are checked together, above
    const kind = kindOf(it);
    const word = kind === 'stat' ? 'number' : kind;
    let first = '';
    let used = 0;
    order.forEach(p => {
      const here =
        p.gives.includes(it.id) ||
        p.takes.includes(it.id) ||
        it.id in (p.adds || {}) ||
        p.choices.some(ch => ch.gives.includes(it.id) || ch.takes.includes(it.id) || it.id in (ch.adds || {}));
      if (here) {
        used++;
        first ||= p.id;
      }
    });
    const read = kind === 'stat' ? readStats.has(it.id) : readsItem(it.id);
    if (kind === 'stat' && it.hi - it.lo > STAT_SPAN_COMFY && (read || it.show))
      N(
        '',
        `The number ${q(it.name || 'unnamed')} ranges from ${it.lo} to ${it.hi}. The checker keeps values apart when the story can tell them apart, so wide ranges can slow it down. A range of 0 to 10 is plenty for most stories.`
      );
    if (!read && !used)
      warnings.push({
        pid: '',
        items: true,
        kind,
        msg: `The ${word} ${q(it.name || 'unnamed')} is not used anywhere. Use it on a page, or delete it on the Items tab.`
      });
    else if (!read && !it.show)
      warnings.push({
        pid: first,
        items: true,
        kind,
        msg: `The ${word} ${q(it.name || 'unnamed')} is ${kind === 'stat' ? 'changed' : 'given or taken'}, but no text or choice depends on it and the player never sees it (Show is off), so it changes nothing.`
      });
  });

  /* --- which items to track: only those that can change what a player sees ---
     A number takes several bits (it is stored as its distance above its lowest value); everything else takes one. */
  const track = new Set();
  condIds.forEach(id => {
    if (items[id] || vById[id]) track.add(id);
  });
  project.items.forEach(it => {
    if (it.show && it.kind !== 'stat') track.add(it.id);
  });
  vrefs.forEach(v => {
    if (track.has(v.id)) track.add(v.itemId);
  }); // a hand-over is only recorded if the player had the object
  const ids = [...track];
  const statList = project.items.filter(it => it.kind === 'stat' && (readStats.has(it.id) || it.show));
  /* what each tracked number is tested against and changed by, so equal-acting values can share one situation (klGroupValues) */
  const cuts = Object.create(null);
  const deltas = Object.create(null);
  statList.forEach(it => {
    cuts[it.id] = [];
    deltas[it.id] = [];
  });
  const noteTests = list =>
    (list || []).forEach(id => {
      const t = parseStatTest(id);
      if (t && cuts[t.stat]) cuts[t.stat].push(t.n - items[t.stat].lo);
    });
  const noteAdds = o =>
    Object.keys(o || {}).forEach(id => {
      if (deltas[id]) deltas[id].push(o[id]);
    });
  order.forEach(p => {
    noteAdds(p.adds);
    p.blocks.forEach(b => {
      noteTests(b.needs);
      noteTests(b.forbid);
    });
    p.choices.forEach(c => {
      noteTests(c.needs);
      noteTests(c.forbid);
      noteAdds(c.adds);
      /* a skill check: it can succeed once number + 12 reaches the target, and fail while number + 2 falls short of it */
      if (c.check && cuts[c.check.stat]) cuts[c.check.stat].push(c.check.target - 12 - items[c.check.stat].lo, c.check.target - 2 - items[c.check.stat].lo);
    });
  });
  let nb = ids.length;
  const fieldOf = Object.create(null); // statId -> { id, lo, hi, span, sh, m, of, first, last, n, start } (sh and m are BigInt when the story is big)
  /* a number is stored as the group its value falls in (0, 1, 2 ... upward), not as the value itself; with no grouping possible the two are the same */
  const fields = statList.map(it => {
    const span = it.hi - it.lo;
    const g = klGroupValues(span, cuts[it.id], deltas[it.id]);
    const n = g.first.length;
    const bits = Math.ceil(Math.log2(n));
    const f = { id: it.id, lo: it.lo, hi: it.hi, span, sh: nb, m: 2 ** bits - 1, of: g.of, first: g.first, last: g.last, n, start: g.of[it.start - it.lo] };
    nb += bits;
    fieldOf[it.id] = f;
    return f;
  });
  const grouped = fields.some(f => f.n < f.span + 1); // true when some number's values were grouped
  const big = nb > 30;
  const Z = big ? 0n : 0;
  const bitOf = Object.create(null);
  ids.forEach((id, i) => {
    bitOf[id] = big ? 1n << BigInt(i) : 1 << i;
  });
  if (big)
    fields.forEach(f => {
      f.sh = BigInt(f.sh);
      f.m = BigInt(f.m);
    });
  /** A number's value (distance above its lowest) in a situation, and a situation with that value changed. */
  const fv = big ? (fl, f) => Number((fl >> f.sh) & f.m) : (fl, f) => (fl >>> f.sh) & f.m;
  const fset = big ? (fl, f, v) => (fl & ~(f.m << f.sh)) | (BigInt(v) << f.sh) : (fl, f, v) => (fl & ~(f.m << f.sh)) | (v << f.sh);
  const mask = list => {
    let m = Z;
    (list || []).forEach(id => {
      if (bitOf[id] !== undefined) m |= bitOf[id];
    });
    return m;
  };
  /** The number tests in a "needs" (or "forbid") list: [{ f, min }], true when the number's offset is at least `min`. */
  const tests = list =>
    (list || [])
      .map(id => {
        const t = parseStatTest(id);
        const f = t && fieldOf[t.stat];
        return f ? { f, min: t.n - f.lo } : null;
      })
      .filter(Boolean);
  const NONE = [];
  /** A condition (needs/forbid) in bit form. */
  const cond = c => {
    const tn = tests(c.needs);
    const tf = tests(c.forbid);
    return { n: mask(c.needs), f: mask(c.forbid), tn: tn.length ? tn : NONE, tf: tf.length ? tf : NONE };
  };
  const has = (fl, b) => (fl & b) !== Z;
  /** klCondOk in bit form. */
  const okc = (fl, c) => {
    if ((fl & c.n) !== c.n || (fl & c.f) !== Z) return false;
    for (const t of c.tn) if (t.f.first[fv(fl, t.f)] < t.min) return false;
    for (const t of c.tf) if (t.f.first[fv(fl, t.f)] >= t.min) return false;
    return true;
  };
  /** A change to a number: for each group of values, the group it moves to (by the amount d, inside the number's limits). */
  const addsOf = o =>
    Object.keys(o || {})
      .filter(id => fieldOf[id])
      .map(id => {
        const f = fieldOf[id];
        return { f, to: f.first.map(v => f.of[Math.max(0, Math.min(f.span, v + o[id]))]) };
      });
  /** klAdd in bit form: each number moves by its change and stays inside its limits. */
  const addTo = (fl, adds) => {
    for (const a of adds) fl = fset(fl, a.f, a.to[fv(fl, a.f)]);
    return fl;
  };
  const vOfItem = Object.create(null);
  vrefs.forEach(v => {
    if (bitOf[v.id] !== undefined) vOfItem[v.itemId] = (vOfItem[v.itemId] ?? Z) | bitOf[v.id];
  });

  let truncated = false;
  const endings = [];
  const pIndex = Object.create(null);
  order.forEach((p, i) => {
    pIndex[p.id] = i;
  });

  /* each page's rules as bit masks, so the walk below is fast */
  const pre = order.map(p => {
    let giveClear = Z;
    p.gives.forEach(id => {
      giveClear |= vOfItem[id] ?? Z;
    });
    const sends = [];
    p.takes.forEach(id => {
      const vid = vidOf(p, id, p.sends?.[id]);
      if (vid && bitOf[id] !== undefined) sends.push({ item: bitOf[id], clear: vOfItem[id] ?? Z, set: bitOf[vid] ?? Z });
    });
    return {
      giveClear,
      sends,
      gives: mask(p.gives),
      takes: mask(p.takes),
      adds: addsOf(p.adds),
      blocks: p.blocks.map(b => Object.assign(cond(b), { or: b.orPrev })),
      choices: p.choices.map(c => {
        let clear = Z;
        c.gives.forEach(id => {
          clear |= vOfItem[id] ?? Z;
        });
        return Object.assign(cond(c), {
          to: p.ending ? undefined : pIndex[c.to],
          fail: c.check ? pIndex[c.check.fail] : undefined,
          ck: c.check ? { f: fieldOf[c.check.stat], target: c.check.target } : null,
          label: c.label,
          key: String(c.label).trim().toLowerCase(),
          g: mask(c.gives),
          t: mask(c.takes),
          adds: addsOf(c.adds),
          clear,
          lock: !!c.lock
        });
      })
    };
  });
  /*
   * Dead numbers (only when `prune` is on). A number matters only where some page can still read it: a condition on a paragraph or
   * choice, or a skill check. From a page where no page ahead (this one included) reads it, its value can never change what a player sees
   * or where they can go, so every situation there is stored with that number at its first group and situations that differ only in it
   * become one. The verdicts (pages reached, endings, stuck pages, usable choices, roll outcomes) are the same as without; only the
   * numbers in the explanations are lost for the pages where they are dead. contract.mjs proves this on random stories.
   */
  const deadAt = [];
  let pruned = false;
  if (prune && fields.length && fields.length <= 30) {
    const fi = Object.create(null);
    fields.forEach((f, i) => {
      fi[f.id] = i;
    });
    const reads = order.map(p => {
      let m = 0;
      const note = list =>
        (list || []).forEach(id => {
          const t = parseStatTest(id);
          if (t && fi[t.stat] !== undefined) m |= 1 << fi[t.stat];
        });
      p.blocks.forEach(b => {
        note(b.needs);
        note(b.forbid);
      });
      p.choices.forEach(c => {
        note(c.needs);
        note(c.forbid);
        if (c.check && fi[c.check.stat] !== undefined) m |= 1 << fi[c.check.stat];
      });
      return m;
    });
    const ahead = order.map(p =>
      p.ending
        ? []
        : p.choices.flatMap(c => [pIndex[c.to], c.check ? pIndex[c.check.fail] : undefined]).filter(x => x !== undefined)
    );
    const live = reads.slice();
    for (let changed = true; changed; ) {
      changed = false;
      for (let pi = 0; pi < order.length; pi++) {
        let m = live[pi];
        for (const t of ahead[pi]) m |= live[t];
        if (m !== live[pi]) {
          live[pi] = m;
          changed = true;
        }
      }
    }
    order.forEach((p, pi) => {
      deadAt[pi] = fields.filter((f, i) => !((live[pi] >> i) & 1));
      if (deadAt[pi].length) pruned = true;
    });
  }
  const isDead = (pi, f) => !!deadAt[pi] && deadAt[pi].includes(f);
  /** klArrive in bit form: forget where given things went, record hand-overs of things the player had, add, remove, change numbers. */
  function arrive(pi, fl) {
    const r = pre[pi];
    let n = fl & ~r.giveClear;
    for (const s of r.sends) if (has(fl, s.item)) n = (n & ~s.clear) | s.set;
    n = (n | r.gives) & ~r.takes;
    return r.adds.length ? addTo(n, r.adds) : n;
  }
  /** klChoose in bit form. */
  const choose = (fl, c) => {
    const n = ((fl & ~c.clear) | c.g) & ~c.t;
    return c.adds.length ? addTo(n, c.adds) : n;
  };

  /* situations get numbers in the order found; seen maps (page, items) to that number */
  const seen = new Map();
  const sPage = [];
  const sFlags = [];
  const sFrom = []; // the situation this one was first reached from (-1 for a start)
  const sStep = []; // and the choice taken: [label, page id, choice index]
  const startNote = []; // the Given answers that begin a starting situation
  let edges = []; // pairs [from, to] of situation numbers, while the story is small enough
  const span = 2 ** nb;
  const keyOf = big ? (pi, fl) => `${pi}|${fl.toString(36)}` : (pi, fl) => pi * span + fl;
  function visit(pi, fl, from, step, note) {
    if (pruned) for (const f of deadAt[pi]) fl = fset(fl, f, 0);
    const k = keyOf(pi, fl);
    let s = seen.get(k);
    if (s === undefined) {
      s = sPage.length;
      seen.set(k, s);
      sPage.push(pi);
      sFlags.push(fl);
      sFrom.push(from);
      sStep.push(step);
      startNote.push(note || null);
    }
    return s;
  }

  const reachedPage = new Set();
  const shownChoice = new Set(); // choices usable in some situation
  const shownBlock = new Set();
  const okBlock = new Set(); // a paragraph whose own conditions were met somewhere (even if "otherwise" hid it)
  const rolled = new Map(); // `${pi}:${ci}` -> 1 (a roll can succeed) | 2 (a roll can fail) | 3 (both), over every situation it is usable in
  const softlocks = new Map(); // page index -> items held when stuck
  const endingAt = new Map(); // ending page index -> first situation there
  const endingCount = new Map(); // ending page index -> how many different situations arrive there
  const dupes = new Map(); // page index -> a label shown twice at once
  const exits = new Set(); // situations that end, or stop because the story is unfinished there
  const heldOnArrival = new Map(); // `${pi}:${bit index}` -> [ever held, always held] for items given or taken on arrival
  const heldOnPick = new Map(); // `${pi}:${ci}:${bit index}` -> ever held, for items a choice takes
  let ever = Z;

  /** Notes, for page `pi`, whether each item it gives or takes was already held when the player came in. */
  function noteArrival(pi, fl) {
    const p = order[pi];
    p.gives.concat(p.takes).forEach(id => {
      const b = bitOf[id];
      if (b === undefined) return;
      const k = `${pi}:${id}`,
        h = has(fl, b),
        cur = heldOnArrival.get(k);
      heldOnArrival.set(k, cur ? [cur[0] || h, cur[1] && h] : [h, h]);
    });
  }

  const s0 = pIndex[project.start];
  if (s0 !== undefined) {
    /* Every story starts once for each combination of Given answers (one answer per Given), with every number at its start. */
    let base = Z;
    fields.forEach(f => {
      base = fset(base, f, f.start);
    });
    let combos = [[base, []]];
    (project.givens || []).forEach(g => {
      const next = [];
      combos.forEach(cb =>
        g.options.forEach(id => {
          next.push([cb[0] | (bitOf[id] ?? Z), cb[1].concat([{ label: items[id]?.name || '', given: true, question: g.question, id }])]);
        })
      );
      if (next.length) combos = next;
    });
    if (combos.length > 512) {
      combos = combos.slice(0, 512);
      truncated = true;
    }
    combos.forEach(cb => {
      noteArrival(s0, cb[0]);
      visit(s0, arrive(s0, cb[0]), -1, null, cb[1]);
    });

    for (let s = 0; s < sPage.length; s++) {
      if (sPage.length > limit) {
        truncated = true;
        break;
      }
      if (edges && sPage.length > EDGE_CAP) edges = null;
      const pi = sPage[s];
      const fl = sFlags[s];
      const r = pre[pi];
      const p = order[pi];
      reachedPage.add(pi);
      ever |= fl;
      let chainDone = false;
      r.blocks.forEach((b, bi) => {
        const ok = okc(fl, b);
        if (ok) okBlock.add(`${pi}:${bi}`);
        let show;
        if (b.or) {
          show = !chainDone && ok;
          if (show) chainDone = true;
        } else {
          show = ok;
          chainDone = ok;
        }
        if (show) shownBlock.add(`${pi}:${bi}`);
      });
      if (p.ending) {
        if (!endingAt.has(pi)) endingAt.set(pi, s);
        endingCount.set(pi, (endingCount.get(pi) || 0) + 1);
        exits.add(s);
        continue;
      }
      if (!p.choices.length) {
        exits.add(s);
        continue;
      }
      let anyShown = false;
      const labels = new Set();
      r.choices.forEach((c, ci) => {
        if (!okc(fl, c)) return;
        anyShown = true;
        shownChoice.add(`${pi}:${ci}`);
        if (c.key) {
          if (labels.has(c.key) && !dupes.has(pi)) dupes.set(pi, c.label);
          labels.add(c.key);
        }
        if (c.to === undefined || (c.ck && c.fail === undefined)) {
          exits.add(s);
          return;
        } // leads nowhere yet: reported above
        p.choices[ci].takes.forEach(id => {
          const b = bitOf[id];
          if (b !== undefined) {
            const k = `${pi}:${ci}:${id}`;
            heldOnPick.set(k, heldOnPick.get(k) || has(fl, b));
          }
        });
        const chosen = choose(fl, c);
        noteArrival(c.to, chosen);
        /* a skill check has two ways to go; which are possible depends on the number: two dice add up to 2 to 12 */
        let win = true;
        let lose = false;
        if (c.ck) {
          const need = c.ck.target - (c.ck.f.first[fv(fl, c.ck.f)] + c.ck.f.lo); // the number the player had when they picked (every value in its group gives the same answer)
          win = need <= 12;
          lose = need > 2;
          rolled.set(`${pi}:${ci}`, (rolled.get(`${pi}:${ci}`) || 0) | (win ? 1 : 0) | (lose ? 2 : 0));
        }
        if (win) {
          const t = visit(c.to, arrive(c.to, chosen), s, [c.label || '(unnamed choice)', order[c.to].id, ci]);
          if (edges) edges.push(s, t);
        }
        if (lose) {
          noteArrival(c.fail, chosen);
          const t = visit(c.fail, arrive(c.fail, chosen), s, [`${c.label || '(unnamed choice)'} (fails the roll)`, order[c.fail].id, ci, true]);
          if (edges) edges.push(s, t);
        }
      });
      if (!anyShown) {
        exits.add(s);
        if (!softlocks.has(pi)) softlocks.set(pi, fl);
      }
    }
  }

  /** A group of a number's values in words: "5", "6 or more", "3 or less" or "4 to 7". */
  const say = (f, g) => {
    const a = f.first[g] + f.lo;
    const b = f.last[g] + f.lo;
    return a === b ? String(a) : b === f.hi ? `${a} or more` : a === f.lo ? `${b} or less` : `${a} to ${b}`;
  };
  /* --- turn what was found into plain-English messages --- */
  /** "have the wallet and are Sick": what a set of tracked items means, for messages. */
  function describe(fl, pi) {
    const objs = [],
      sts = [],
      moved = [];
    ids.forEach(id => {
      if (!has(fl, bitOf[id])) return;
      if (vById[id]) moved.push(vById[id].label);
      else (kindOf(items[id]) === 'state' ? sts : objs).push(items[id].name);
    });
    const parts = [];
    if (objs.length) parts.push(`have ${joinAnd(objs)}`);
    if (sts.length) parts.push(`are ${joinAnd(sts)}`);
    if (moved.length) parts.push(`did these: ${joinAnd(moved)}`);
    const nums = fields.filter(f => !isDead(pi, f)).map(f => `${items[f.id].name} is ${say(f, fv(fl, f))}`);
    if (nums.length) parts.push(nums.join(' and '));
    return parts.length ? `they ${parts.join(' and ')}` : 'they have nothing and are in no particular state';
  }
  softlocks.forEach((fl, pi) =>
    P(order[pi].id, `Players can get stuck on ${label(order[pi])} when ${describe(fl, pi)}: none of its choices are available.`)
  );
  dupes.forEach((lbl, pi) => W(order[pi].id, `${label(order[pi])} can show two choices that both say ${q(lbl)}. Players cannot tell them apart.`));

  /** The shortest list of button presses to a situation, Given answers first. */
  function pathFor(s) {
    const steps = [];
    while (sFrom[s] !== -1) {
      const st = sStep[s];
      steps.push({ label: st[0], to: st[1], ci: st[2], fail: !!st[3] });
      s = sFrom[s];
    }
    return (startNote[s] || []).concat(steps.reverse());
  }
  order.forEach((p, pi) => {
    if (!p.ending) return;
    const s = endingAt.get(pi);
    endings.push({
      pid: p.id,
      name: p.name,
      heading: p.heading,
      valence: p.valence || '',
      reachable: s !== undefined ? true : truncated ? null : false, // null: not found before the check stopped
      situations: endingCount.get(pi) || 0, // how many different ways of arriving (items held, numbers) the check found
      path: s !== undefined ? pathFor(s) : []
    });
  });

  if (!truncated && s0 !== undefined) {
    /* items something depends on, that no player can ever hold */
    project.items.forEach(it => {
      const b = bitOf[it.id];
      if (b === undefined || has(ever, b) || givenOf(project, it.id)) return;
      const firstUse = order.find(p => p.blocks.concat(p.choices).some(c => c.needs.includes(it.id)));
      if (!firstUse) return;
      const gave = order.some(p => p.gives.includes(it.id) || p.choices.some(ch => ch.gives.includes(it.id)));
      const kind = it.kind === 'state' ? 'state' : 'object';
      warnings.push({
        pid: firstUse.id,
        items: true,
        kind,
        msg: `The ${kind} ${q(it.name || 'unnamed')} is needed on ${label(firstUse)}, but a player can never get it${gave ? ' (every page or choice that gives it is out of reach).' : ' (nothing gives it).'}`
      });
    });
    order.forEach((p, pi) => {
      if (!reachedPage.has(pi)) {
        if (!orphan.has(p.id))
          P(
            p.id,
            `${label(p)} can never be reached: the choices that lead to it never appear for any player who gets that far${p.ending ? ', so nobody can get this ending' : ''}.`
          );
        return;
      }
      if (!p.ending)
        p.choices.forEach((c, ci) => {
          if (byId[c.to] && !shownChoice.has(`${pi}:${ci}`))
            W(
              p.id,
              c.lock
                ? `The choice ${q(c.label || 'unnamed')} on ${label(p)} is greyed out for every player and never becomes available: no player who gets here meets its conditions (${condSummary(c, iname).replace(/^Only if /, '')}).`
                : `The choice ${q(c.label || 'unnamed')} on ${label(p)} never appears: no player who gets here meets its conditions (${condSummary(c, iname).replace(/^Only if /, '')}).`
            );
          const rl = rolled.get(`${pi}:${ci}`);
          if (c.check && rl && rl !== 3) {
            const nm = items[c.check.stat]?.name || 'the number';
            W(
              p.id,
              rl === 1
                ? `The skill check ${q(c.label || 'unnamed')} on ${label(p)} can never fail: ${nm} is always high enough for a target of ${c.check.target}. Raise the target, or make it an ordinary choice.`
                : `The skill check ${q(c.label || 'unnamed')} on ${label(p)} can never succeed: even the best roll with ${nm} falls short of a target of ${c.check.target}. Lower the target.`
            );
          }
          if (c.check && c.check.fail === c.to && rl === 3)
            N(
              p.id,
              `Both outcomes of the skill check ${q(c.label || 'unnamed')} on ${label(p)} lead to the same page, so the roll changes nothing there.`
            );
        });
      p.blocks.forEach((b, bi) => {
        if (!String(b.text).trim() || shownBlock.has(`${pi}:${bi}`)) return;
        W(
          p.id,
          okBlock.has(`${pi}:${bi}`)
            ? `A piece of text on ${label(p)} never appears: it is an “otherwise” to text above it that always shows instead.`
            : `A piece of text on ${label(p)} never appears: no player who gets here meets its conditions (${condSummary(b, iname).replace(/^Only if /, '')}).`
        );
      });
      /* taking what nobody has, giving what everybody has */
      p.takes.forEach(id => {
        const hk = heldOnArrival.get(`${pi}:${id}`);
        if (hk && !hk[0]) N(p.id, `${label(p)} takes ${q(iname(id))}, but players never have it when they arrive, so nothing is lost.`);
      });
      p.gives.forEach(id => {
        const hk = heldOnArrival.get(`${pi}:${id}`);
        if (hk && hk[1]) N(p.id, `${label(p)} gives ${q(iname(id))}, but every player already has it when they arrive.`);
      });
      p.choices.forEach((c, ci) =>
        c.takes.forEach(id => {
          if (shownChoice.has(`${pi}:${ci}`) && bitOf[id] !== undefined && !heldOnPick.get(`${pi}:${ci}:${id}`))
            W(p.id, `The choice ${q(c.label || 'unnamed')} on ${label(p)} takes ${q(iname(id))}, but players never have it when they pick it.`);
        })
      );
    });

    if (edges) {
      const n = sPage.length;
      const rev = Array.from({ length: n }, () => []);
      for (let e = 0; e < edges.length; e += 2) rev[edges[e + 1]].push(edges[e]);
      /** Every situation from which one of `targets` can be reached. */
      function canReach(targets) {
        const ok = new Uint8Array(n),
          stack = [];
        targets.forEach(t => {
          if (!ok[t]) {
            ok[t] = 1;
            stack.push(t);
          }
        });
        while (stack.length)
          for (const f of rev[stack.pop()])
            if (!ok[f]) {
              ok[f] = 1;
              stack.push(f);
            }
        return ok;
      }
      /* loops a player can never leave: situations from which no ending (and no unfinished spot) can be reached */
      const out = canReach(exits);
      const trapped = new Set();
      for (let s = 0; s < n; s++) if (!out[s]) trapped.add(sPage[s]);
      if (trapped.size) {
        const names = [...trapped].map(pi => label(order[pi]));
        P(
          order[[...trapped][0]].id,
          `Some players can never reach an ending: once at ${joinAnd(names.slice(0, 6))}${names.length > 6 ? ` and ${names.length - 6} more` : ''}, every choice leads round in circles. Add a way out.`
        );
      }
      /* a choice that needs something the player may lack, with no way to go and get it and come back */
      const givenBits = mask((project.givens || []).flatMap(g => g.options));
      const byPage = Array.from({ length: order.length }, () => []);
      for (let s = 0; s < n; s++) byPage[sPage[s]].push(s);
      order.forEach((p, pi) => {
        if (p.ending) return;
        pre[pi].choices.forEach((c, ci) => {
          const need = c.n & ~givenBits; // Given answers never change, so only the rest can be fetched
          if (need === Z || c.to === undefined) return;
          const fixed = c.n & givenBits,
            good = [],
            hidden = [];
          byPage[pi].forEach(s => {
            const fl = sFlags[s];
            if (okc(fl, c)) good.push(s);
            else if ((fl & fixed) === fixed && (fl & need) !== need) hidden.push(s);
          });
          if (!good.length || !hidden.length) return;
          const can = canReach(good);
          const miss = hidden.find(s => !can[s]);
          if (miss === undefined) return;
          const lacking = ids.filter(id => has(need, bitOf[id]) && !has(sFlags[miss], bitOf[id])).map(iname);
          N(
            p.id,
            `The choice ${q(c.label || 'unnamed')} on ${label(p)} needs ${joinAnd(lacking)}. A player who arrives without ${plural(lacking.length, 'it', 'them')} can never come back for it, so they miss this choice for good.`
          );
        });
      });
    }
  }

  /* --- on-demand answers for the editor (computed only when asked, so every edit's check stays fast) --- */
  /**
   * Plays the shortest route to situation `s` with the game's own rules and real numbers (a success rolls 12, a failure 2).
   * Used when numbers were grouped, because a situation then stands for several values and this gives one real value.
   */
  function replay(s) {
    const st = klStatMap(project.items);
    let f = klInit({}, st);
    let page = null;
    const arriveAt = p => {
      page = p;
      f = klArrive(f, p, st);
    };
    pathFor(s).forEach(step => {
      if (step.given) {
        f[step.id] = true;
        return;
      }
      if (!page) arriveAt(byId[project.start]);
      const c = page.choices[step.ci];
      const dest = byId[klTarget(f, c, step.fail ? 2 : 12)];
      f = klChoose(f, c, st);
      arriveAt(dest);
    });
    if (!page) arriveAt(byId[project.start]);
    return f;
  }
  /** The things the player has, is and the numbers they hold in situation `s`, as game flags. */
  function flagsOf(s) {
    if (grouped || pruned) {
      const out = {};
      Object.entries(replay(s)).forEach(([k, v]) => {
        if (v) out[k] = v;
      });
      return out;
    }
    const fl = sFlags[s];
    const out = {};
    ids.forEach(id => {
      if (has(fl, bitOf[id])) out[id] = true;
    });
    fields.forEach(f => {
      const v = f.first[fv(fl, f)] + f.lo;
      if (v) out[`v:${f.id}`] = v;
    });
    return out;
  }
  /** "has Key, is Brave, Courage 5": a short description of situation `s` for menus. */
  function sayHeld(s) {
    const fl = sFlags[s];
    const parts = [];
    ids.forEach(id => {
      if (has(fl, bitOf[id]) && items[id]) parts.push(items[id].name);
    });
    const real = grouped || pruned ? replay(s) : null;
    fields.filter(f => !isDead(sPage[s], f)).forEach(f => parts.push(`${items[f.id].name} ${real ? real[`v:${f.id}`] || 0 : f.first[fv(fl, f)] + f.lo}`));
    return parts.length ? parts.join(', ') : 'nothing special';
  }
  /**
   * Can a player arrive at page `pid` holding exactly `flags` (game flags: item ids, 'v:<stat>' numbers)? true or false,
   * or null when the check stopped early or the story is too big to say. Only what the checker tracks is compared.
   */
  function canArrive(pid, flags) {
    const pi = pIndex[pid];
    if (pi === undefined) return false;
    if (truncated) return null;
    let fl = Z;
    ids.forEach(id => {
      if (flags[id]) fl |= bitOf[id];
    });
    for (const f of fields) {
      if (isDead(pi, f)) continue; // forgotten at this page: any value is the same situation
      const v = (flags[`v:${f.id}`] || 0) - f.lo;
      if (v < 0 || v > f.hi - f.lo) return false;
      fl = fset(fl, f, f.of[v]);
    }
    return seen.has(keyOf(pi, fl));
  }
  let byPageAll = null;
  /**
   * Up to `max` different ways a player can arrive at page `pid` (each: what they hold, a menu line, and the choices that
   * lead there), spread from the emptiest-handed to the best-equipped. "Test from here" offers these.
   */
  function samples(pid, max = 6) {
    const pi = pIndex[pid];
    if (pi === undefined) return [];
    if (!byPageAll) {
      byPageAll = Array.from({ length: order.length }, () => []);
      for (let s = 0; s < sPage.length; s++) byPageAll[sPage[s]].push(s);
    }
    const all = byPageAll[pi];
    if (!all.length) return [];
    const weight = s => ids.filter(id => has(sFlags[s], bitOf[id])).length;
    const byWeight = all.slice().sort((a, b) => weight(a) - weight(b) || a - b);
    const chosen = new Set([all[0]]); // the quickest way there first
    for (let k = 0; chosen.size < Math.min(max, all.length) && k < max * 3; k++)
      chosen.add(byWeight[Math.round((k * (byWeight.length - 1)) / Math.max(1, max - 1)) % byWeight.length]);
    return [...chosen].slice(0, max).map(s => ({ flags: flagsOf(s), held: sayHeld(s), path: pathFor(s) }));
  }
  let fwd = null;
  /**
   * Why and how a player reaches ending `pid`: how many ways of arriving the check found, what every one of them has, the
   * range of each number, and the pages every route must pass through (null if the story is too big to keep the moves).
   */
  function explain(pid) {
    const pi = pIndex[pid];
    if (pi === undefined || !endingAt.has(pi)) return null;
    samples(pid, 1); // builds byPageAll
    const here = byPageAll[pi];
    let every = ~Z; // items held in all of them
    here.forEach(s => {
      every = every & sFlags[s];
    });
    const always = ids.filter(id => items[id] && has(every, bitOf[id])).map(id => items[id].name);
    const nums = fields.filter(f => !isDead(pi, f)).map(f => {
      let lo = Infinity;
      let hi = -Infinity;
      here.forEach(s => {
        const g = fv(sFlags[s], f);
        lo = Math.min(lo, f.first[g] + f.lo);
        hi = Math.max(hi, f.last[g] + f.lo);
      });
      return { name: items[f.id].name, lo, hi };
    });
    let must = null;
    if (edges) {
      if (!fwd) {
        fwd = Array.from({ length: sPage.length }, () => []);
        for (let e = 0; e < edges.length; e += 2) fwd[edges[e]].push(edges[e + 1]);
      }
      const starts = [];
      for (let s = 0; s < sPage.length && sFrom[s] === -1; s++) starts.push(s);
      const route = pathFor(endingAt.get(pi)).filter(x => !x.given);
      const candidates = [...new Set(route.map(x => pIndex[x.to]))].filter(x => x !== pi && x !== s0);
      must = candidates.filter(cand => {
        const ok = new Uint8Array(sPage.length);
        const stack = starts.filter(s => sPage[s] !== cand);
        stack.forEach(s => (ok[s] = 1));
        while (stack.length) {
          const s = stack.pop();
          if (sPage[s] === pi) return false; // still reachable without that page
          for (const t of fwd[s]) if (!ok[t] && sPage[t] !== cand) ((ok[t] = 1), stack.push(t));
        }
        return true;
      });
      must = must.map(x => ({ pid: order[x].id, name: order[x].name }));
    }
    return { situations: here.length, always, nums, must, path: pathFor(endingAt.get(pi)) };
  }

  /**
   * Why page `pid` can or cannot be reached, choice by choice. Returns null for an unknown page, else
   *   { reachable (true / false / null when the check stopped early), isStart, incoming: [ ... ] }
   * with one entry for every choice that leads here (by its button, or by failing its roll):
   *   { from, fromName, label, fail, fromReached, offered, blockers: [{ kind: 'needs' | 'forbid' | 'together', id }], roll }
   * `offered` is true when some player is shown that choice; `blockers` say what keeps every player who reaches `from` from seeing it;
   * `roll` is 'never-wins' or 'never-fails' when the dice make this way impossible.
   */
  function why(pid) {
    const pi = pIndex[pid];
    if (pi === undefined) return null;
    samples(pid, 1); // builds byPageAll
    const incoming = [];
    order.forEach((p, qi) => {
      if (p.ending) return;
      p.choices.forEach((c, ci) => {
        const isTo = c.to === pid;
        const isFail = !!c.check && c.check.fail === pid;
        if (!isTo && !isFail) return;
        const there = byPageAll[qi];
        const offered = shownChoice.has(`${qi}:${ci}`);
        const row = { from: p.id, fromName: p.name, label: c.label, fail: isFail && !isTo, fromReached: there.length > 0, offered, blockers: [], roll: '' };
        if (row.fromReached && !offered) {
          const one = (list, forbid) => {
            list.forEach(id => {
              const cd = cond(forbid ? { needs: [], forbid: [id] } : { needs: [id], forbid: [] });
              if (!there.some(sx => okc(sFlags[sx], cd))) row.blockers.push({ kind: forbid ? 'forbid' : 'needs', id });
            });
          };
          one(c.needs || [], false);
          one(c.forbid || [], true);
          if (!row.blockers.length) row.blockers.push({ kind: 'together', id: '' });
        }
        if (offered && c.check) {
          const bits = rolled.get(`${qi}:${ci}`) || 0;
          if (isTo && !isFail && !(bits & 1)) row.roll = 'never-wins';
          if (isFail && !isTo && !(bits & 2)) row.roll = 'never-fails';
        }
        incoming.push(row);
      });
    });
    return { reachable: truncated && !byPageAll[pi].length ? null : byPageAll[pi].length > 0, isStart: pi === s0, incoming };
  }

  return { problems, warnings, notes, endings, states: sPage.length, grouped, pruned, truncated, samples, explain, canArrive, why };
}

/**
 * The shape of the story as a map of pages (ignoring items and numbers): where it forks and merges, which pages every
 * route to an ending must pass through (bottlenecks), pages many routes pass through (hubs), an early page that sorts
 * the player onto a track of their own ("sorting hat"), and a plain-English name for the overall structure.
 * Cheap enough to run after every edit. Returns { label, tip, facts[], forks, merges, depth, endings, bottlenecks[], hubs[],
 * sorter, spine[] } where bottlenecks are { pid, name, gates } (gates: how many endings need that page).
 */
function analyzeStructure(project) {
  const order = project.passages;
  const n = order.length;
  const idx = Object.create(null);
  order.forEach((p, i) => {
    idx[p.id] = i;
  });
  const out = order.map(p => {
    const s = new Set();
    if (!p.ending)
      p.choices.forEach(c => {
        if (idx[c.to] !== undefined) s.add(idx[c.to]);
        if (c.check && idx[c.check.fail] !== undefined) s.add(idx[c.check.fail]);
      });
    return [...s];
  });
  const s0 = idx[project.start];
  const none = { label: '', tip: '', facts: [], forks: 0, merges: 0, depth: 0, endings: 0, bottlenecks: [], hubs: [], sorter: null, spine: [] };
  if (s0 === undefined) return none;
  /** Distance from the start to every page, never entering page `skip` (-1 = skip nothing); -1 for pages not reached. */
  const dist = skip => {
    const d = new Int32Array(n).fill(-1);
    if (s0 === skip) return d;
    d[s0] = 0;
    const q = [s0];
    for (let i = 0; i < q.length; i++) for (const w of out[q[i]]) if (w !== skip && d[w] < 0) ((d[w] = d[q[i]] + 1), q.push(w));
    return d;
  };
  const d0 = dist(-1);
  const live = order.map((_, i) => i).filter(i => d0[i] >= 0);
  const indeg = new Array(n).fill(0);
  live.forEach(i => out[i].forEach(w => w !== i && indeg[w]++));
  const forks = live.filter(i => out[i].length >= 2).length;
  const merges = live.filter(i => indeg[i] >= 2).length;
  const endIdx = live.filter(i => order[i].ending);
  const depth = Math.max(0, ...live.map(i => d0[i]));
  /* bottlenecks: pages whose removal cuts the start off from some ending (skipped for huge stories) */
  const bottlenecks = [];
  if (live.length <= 1500 && endIdx.length)
    live.forEach(c => {
      if (c === s0 || order[c].ending) return;
      const d = dist(c);
      const gates = endIdx.filter(e => d[e] < 0).length;
      if (gates) bottlenecks.push({ pid: order[c].id, name: order[c].name, gates, at: d0[c] });
    });
  bottlenecks.sort((a, b) => a.at - b.at);
  const hubs = live.filter(i => indeg[i] >= 3 && out[i].length >= 3).map(i => ({ pid: order[i].id, name: order[i].name, links: indeg[i] }));
  /* a sorting hat: an early page with three or more ways on, whose branches then keep apart */
  let sorter = null;
  live
    .filter(i => d0[i] <= 3 && out[i].length >= 3 && !order[i].ending)
    .forEach(v => {
      if (sorter) return;
      const d = dist(v);
      const sets = out[v].map(w => {
        const seen = new Set([w]);
        const q = [w];
        for (let k = 0; k < q.length; k++) for (const x of out[q[k]]) if (x !== v && x !== s0 && !seen.has(x)) (seen.add(x), q.push(x));
        return seen;
      });
      const count = new Map();
      sets.forEach(s => s.forEach(x => count.set(x, (count.get(x) || 0) + 1)));
      const total = count.size;
      const unique = [...count.values()].filter(k => k === 1).length;
      if (total >= 6 && unique / total >= 0.6 && sets.every(s => s.size >= 2))
        sorter = { pid: order[v].id, name: order[v].name, tracks: sets.length };
      void d;
    });
  const nonEnd = live.filter(i => !order[i].ending).length;
  const spine = bottlenecks.filter(b => b.gates === endIdx.length);
  const key = bottlenecks.filter(b => endIdx.length >= 2 && b.gates * 2 >= endIdx.length); // pages at least half of the endings depend on
  const joinGates = key.filter(b => indeg[idx[b.pid]] >= 2).length; // key scenes where separate roads meet
  let label;
  let tip;
  if (!forks) {
    label = 'Linear';
    tip = 'One road from start to finish. Add a choice or two to give the reader something to decide.';
  } else if (sorter && forks <= live.length * 0.3) {
    label = 'Parallel tracks (a sorting hat)';
    tip = `Early on, “${sorter.name}” sends each reader onto one of ${sorter.tracks} tracks that rarely meet. Each track needs its own care, because most readers see only one.`;
  } else if (hubs.some(h => h.links >= Math.max(3, Math.round(live.length * 0.2)))) {
    label = 'Hub and spokes';
    tip = `Readers keep coming back to “${hubs.slice().sort((a, b) => b.links - a.links)[0].name}”. Make sure each visit feels different (text that depends on what they have done), and give them a reason to leave.`;
  } else if (depth >= nonEnd * 0.85 && !merges) {
    label = 'Gauntlet (one main road, side trips)';
    tip = 'One main road with side trips that end early. Tight and fast; every reader sees the key scenes, so they are the ones to polish.';
  } else if (joinGates >= 2 || key.length >= nonEnd * 0.35) {
    label = 'Branch and bottleneck';
    tip =
      'Readers can wander, but must pass the same key scenes. Those pages are the most important in the story: everyone reads them, so a mistake there is seen by every reader.';
  } else if (merges <= live.length * 0.1) {
    label = 'Time cave (a tree of branches)';
    tip =
      'Every choice sends the reader down a branch of its own and they rarely rejoin. Fun to explore, but it grows quickly; letting a few branches meet again keeps it manageable.';
  } else {
    label = 'Open map (many routes cross)';
    tip =
      'Many routes cross and rejoin, so readers can reach pages in different orders. Check that every page makes sense whichever way the reader arrived.';
  }
  const facts = [
    `${live.length} reachable page${live.length === 1 ? '' : 's'}; the reader chooses on ${forks} of them`,
    `${merges} page${merges === 1 ? ' is' : 's are'} where routes join`,
    `${endIdx.length} reachable ending${endIdx.length === 1 ? '' : 's'}; the longest direct route is ${depth + 1} pages`
  ];
  if (key.length)
    facts.push(
      `${key.length} key page${key.length === 1 ? '' : 's'} that at least half of the endings depend on${spine.length ? ` (${spine.length} that all of them do)` : ''}`
    );
  return { label, tip, facts, forks, merges, depth, endings: endIdx.length, bottlenecks: key, hubs, sorter, spine };
}

/**
 * Starting points for new stories, one for each common shape. Each is a small, finished, working story (it passes the
 * checker with nothing to fix) with placeholder text for the author to replace; contract.mjs checks every one.
 * `shape` is the name analyzeStructure() gives it.
 */
const STARTERS = [
  {
    name: 'Time cave',
    shape: 'Time cave (a tree of branches)',
    blurb: 'Every choice leads down a branch of its own. Simple to write; grows fast.',
    make: () =>
      sketch('A time cave', {
        pages: [
          [
            'a',
            'The cave mouth',
            'Describe where the story begins.',
            null,
            [
              ['Go left', 'b'],
              ['Go right', 'c'],
              ['Climb up', 'd']
            ]
          ],
          [
            'b',
            'Left tunnel',
            'Describe what the reader finds going left.',
            null,
            [
              ['Knock on the door', 'b1'],
              ['Keep walking', 'b2']
            ]
          ],
          [
            'c',
            'Right tunnel',
            'Describe what the reader finds going right.',
            null,
            [
              ['Take the boat', 'c1'],
              ['Turn back', 'c2']
            ]
          ],
          [
            'd',
            'The ledge',
            'Describe the climb.',
            null,
            [
              ['Jump', 'd1'],
              ['Wait', 'd2']
            ]
          ],
          ['b1', 'A welcome', 'Write a good ending.', 'good'],
          ['b2', 'A long walk', 'Write a bad ending.', 'bad'],
          ['c1', 'Across the water', 'Write a good ending.', 'good'],
          ['c2', 'Lost', 'Write a bad ending.', 'bad'],
          ['d1', 'The leap', 'Write a surprising ending.', 'neutral'],
          ['d2', 'Rescue', 'Write a good ending.', 'good']
        ]
      })
  },
  {
    name: 'Branch and bottleneck',
    shape: 'Branch and bottleneck',
    blurb: 'Readers take different roads, but meet at key scenes. Easiest to keep consistent.',
    make: () =>
      sketch('Branch and bottleneck', {
        pages: [
          [
            'a',
            'Opening',
            'Describe where the story begins.',
            null,
            [
              ['Take the fast road', 'b1'],
              ['Take the quiet road', 'b2']
            ]
          ],
          ['b1', 'The fast road', 'Describe the fast road.', null, [['Arrive at the gate', 'g']]],
          ['b2', 'The quiet road', 'Describe the quiet road.', null, [['Arrive at the gate', 'g']]],
          [
            'g',
            'The gate',
            'Every reader passes here. Write the first key scene.',
            null,
            [
              ['Speak to the guard', 'c1'],
              ['Slip past', 'c2'],
              ['Turn back and give up', 'x1']
            ]
          ],
          ['c1', 'The guard’s way', 'Describe this route.', null, [['Reach the tower', 't']]],
          ['c2', 'The side way', 'Describe this route.', null, [['Reach the tower', 't']]],
          [
            't',
            'The tower',
            'The second key scene, shared by all.',
            null,
            [
              ['Open the door', 'e1'],
              ['Wait outside', 'e2']
            ]
          ],
          ['e1', 'Inside', 'Write the good ending.', 'good'],
          ['e2', 'Left outside', 'Write the bad ending.', 'bad'],
          ['x1', 'Home again', 'Write an early ending.', 'neutral']
        ]
      })
  },
  {
    name: 'Sorting hat',
    shape: 'Parallel tracks (a sorting hat)',
    blurb: 'An early choice puts each reader on a track of their own. Good for replay.',
    make: () =>
      sketch('Parallel tracks', {
        pages: [
          [
            'a',
            'Choose a path',
            'Describe the three paths on offer.',
            null,
            [
              ['The forest path', 'f1'],
              ['The river path', 'r1'],
              ['The mountain path', 'm1']
            ]
          ],
          ['f1', 'Into the forest', 'The first scene on the forest track.', null, [['Follow the sound', 'f2']]],
          ['f2', 'The clearing', 'The second scene on the forest track.', null, [['Go on', 'f3']]],
          [
            'f3',
            'The old oak',
            'The last scene on the forest track.',
            null,
            [
              ['Make camp', 'fe1'],
              ['Press on', 'fe2']
            ]
          ],
          ['r1', 'Down the river', 'The first scene on the river track.', null, [['Follow the current', 'r2']]],
          ['r2', 'The bend', 'The second scene on the river track.', null, [['Go on', 'r3']]],
          [
            'r3',
            'The falls',
            'The last scene on the river track.',
            null,
            [
              ['Portage', 're1'],
              ['Shoot the rapids', 're2']
            ]
          ],
          ['m1', 'Up the mountain', 'The first scene on the mountain track.', null, [['Climb higher', 'm2']]],
          ['m2', 'The ridge', 'The second scene on the mountain track.', null, [['Go on', 'm3']]],
          [
            'm3',
            'The pass',
            'The last scene on the mountain track.',
            null,
            [
              ['Cross at dawn', 'me1'],
              ['Cross at once', 'me2']
            ]
          ],
          ['fe1', 'Forest: good ending', 'Write it.', 'good'],
          ['fe2', 'Forest: bad ending', 'Write it.', 'bad'],
          ['re1', 'River: good ending', 'Write it.', 'good'],
          ['re2', 'River: bad ending', 'Write it.', 'bad'],
          ['me1', 'Mountain: good ending', 'Write it.', 'good'],
          ['me2', 'Mountain: bad ending', 'Write it.', 'bad']
        ]
      })
  },
  {
    name: 'Hub and spokes',
    shape: 'Hub and spokes',
    blurb: 'A home base the reader keeps returning to. Text changes as they collect things.',
    make: () =>
      sketch('Hub and spokes', {
        items: [
          ['k1', 'Lantern', 'object'],
          ['k2', 'Map', 'object'],
          ['k3', 'Key', 'object']
        ],
        pages: [
          [
            'a',
            'Town square',
            'The home base. Describe it; the reader returns here after every errand.',
            null,
            [
              ['Visit the shop', 's1'],
              ['Visit the library', 's2'],
              ['Visit the cellar', 's3'],
              ['Leave town, ready', 'z', { needs: ['k1', 'k2', 'k3'] }]
            ]
          ],
          ['s1', 'The shop', 'Describe the shop. The reader takes the lantern.', null, [['Back to the square', 'a']], { gives: ['k1'] }],
          ['s2', 'The library', 'Describe the library. The reader takes the map.', null, [['Back to the square', 'a']], { gives: ['k2'] }],
          ['s3', 'The cellar', 'Describe the cellar. The reader takes the key.', null, [['Back to the square', 'a']], { gives: ['k3'] }],
          ['z', 'The road out', 'The reader leaves with everything they need. Write the ending.', 'good']
        ]
      })
  },
  {
    name: 'Gauntlet',
    shape: 'Gauntlet (one main road, side trips)',
    blurb: 'One main road, with risky shortcuts that end badly. Tight and fast.',
    make: () =>
      sketch('The gauntlet', {
        pages: [
          [
            'a',
            'The start',
            'Describe where the road begins.',
            null,
            [
              ['Keep to the road', 'b'],
              ['Take the shortcut', 'x1']
            ]
          ],
          [
            'b',
            'First trial',
            'Describe the first trial.',
            null,
            [
              ['Keep to the road', 'c'],
              ['Take the shortcut', 'x2']
            ]
          ],
          [
            'c',
            'Second trial',
            'Describe the second trial.',
            null,
            [
              ['Keep to the road', 'd'],
              ['Take the shortcut', 'x3']
            ]
          ],
          [
            'd',
            'Third trial',
            'Describe the third trial.',
            null,
            [
              ['Keep to the road', 'e'],
              ['Take the shortcut', 'x4']
            ]
          ],
          ['e', 'The end of the road', 'Write the good ending.', 'good'],
          ['x1', 'A fall', 'Write the bad ending.', 'bad'],
          ['x2', 'A trap', 'Write the bad ending.', 'bad'],
          ['x3', 'A wrong turn', 'Write the bad ending.', 'bad'],
          ['x4', 'A close call', 'Write the bad ending.', 'bad']
        ]
      })
  },
  {
    name: 'Quest with dice',
    shape: '',
    blurb: 'A Courage number, a dice check you can fail forward from, and a locked choice.',
    make: () =>
      sketch('A quest with dice', {
        items: [['c', 'Courage', 'stat', { lo: 0, hi: 10, start: 3 }]],
        pages: [
          [
            'a',
            'The village',
            'Describe the village and the problem the reader must solve.',
            null,
            [
              ['Train for a day', 'b'],
              ['Go to the dragon’s cave', 'c'],
              ['Draw the hero’s sword', 'd', { needs: ['t:c:6'], lock: true }]
            ]
          ],
          ['b', 'Training', 'Describe the day of training. Courage goes up by 2.', null, [['Back to the village', 'a']], { adds: { c: 2 } }],
          [
            'c',
            'The cave mouth',
            'Describe the cave. The check below rolls two dice and adds Courage.',
            null,
            [['Face the dragon', 'win', { check: { stat: 'c', target: 10, fail: 'hurt' } }]]
          ],
          [
            'hurt',
            'Singed',
            'The roll failed, but the story carries on: the reader is hurt, and braver for it.',
            null,
            [['Try again, bleeding', 'win2']],
            { adds: { c: 1 } }
          ],
          ['d', 'The sword', 'The reader draws the sword.', null, [['Face the dragon', 'win']]],
          ['win', 'Victory', 'Write the good ending.', 'good'],
          ['win2', 'A hard-won victory', 'Write the good ending.', 'good']
        ]
      })
  }
];

/**
 * Builds a small project from a compact sketch: { items: [[key, name, kind, opts]], pages: [[key, name, text, ending, choices, opts]] }
 * where a choice is [label, pageKey, { needs, forbid, lock, check, adds }] and conditions name items by key ("t:key:3" for a number test).
 */
function sketch(title, spec) {
  const p = makeProject(title);
  const itemId = Object.create(null);
  (spec.items || []).forEach(([k, name, kind, o]) => {
    const it = makeItem(name, kind);
    Object.assign(it, o || {});
    itemId[k] = it.id;
    p.items.push(it);
  });
  const pid = Object.create(null);
  p.passages = spec.pages.map(([k, name]) => {
    const q = makePassage(name);
    pid[k] = q.id;
    return q;
  });
  const cond = list => (list || []).map(x => (x.startsWith('t:') ? statTest(itemId[x.split(':')[1]], x.split(':')[2]) : itemId[x]));
  spec.pages.forEach(([k, , text, end, choices, o], i) => {
    const q = p.passages[i];
    q.blocks = [makeBlock(text)];
    if (end) {
      q.ending = true;
      q.valence = end === 'neutral' ? '' : end;
    }
    o = o || {};
    q.gives = (o.gives || []).map(x => itemId[x]);
    Object.keys(o.adds || {}).forEach(x => (q.adds[itemId[x]] = o.adds[x]));
    (choices || []).forEach(([label, to, co]) => {
      const c = makeChoice(label, pid[to]);
      co = co || {};
      c.needs = cond(co.needs);
      c.forbid = cond(co.forbid);
      c.lock = !!co.lock;
      if (co.check) c.check = { stat: itemId[co.check.stat], target: co.check.target, fail: pid[co.check.fail] };
      p.passages[i].choices.push(c);
    });
  });
  p.start = p.passages[0].id;
  return p;
}

/* ---------------------------------------------------------------------------
   Find and replace. Plain text only (no patterns): what the author types is what is looked for. It reaches the words an
   author writes: page names, headings, paragraphs, choice labels and the reasons shown on locked choices. Item names are
   left out on purpose (they are changed on the Items tab, and everything that uses an item follows it by id).
   --------------------------------------------------------------------------- */
const FIND_FIELDS = { name: 'page name', heading: 'heading', text: 'paragraph', label: 'choice', why: 'reason on a locked choice' };
const FIND_LIMIT = 2000;
/** The regular expression for a plain search text, or null when there is nothing to look for. opt: { matchCase, whole }. */
function findPattern(query, opt) {
  if (!query) return null;
  const o = opt || {};
  const body = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const edge = '[\\p{L}\\p{N}_]';
  return new RegExp(o.whole ? `(?<!${edge})${body}(?!${edge})` : body, o.matchCase ? 'gu' : 'giu');
}
/** Every place in the story's writing where `query` occurs, in story order: [{ pid, field, i, pos, len }]. `i` is the paragraph or choice number. */
function storyFind(project, query, opt) {
  const re = findPattern(query, opt);
  const out = [];
  if (!re) return out;
  function scan(pid, field, i, str) {
    if (out.length >= FIND_LIMIT || !str) return;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(str)) && out.length < FIND_LIMIT) {
      out.push({ pid, field, i, pos: m.index, len: m[0].length });
      if (!m[0].length) re.lastIndex++;
    }
  }
  project.passages.forEach(p => {
    scan(p.id, 'name', 0, p.name);
    scan(p.id, 'heading', 0, p.heading);
    p.blocks.forEach((b, i) => scan(p.id, 'text', i, b.text));
    p.choices.forEach((c, i) => {
      scan(p.id, 'label', i, c.label);
      scan(p.id, 'why', i, c.why);
    });
  });
  return out;
}
/** The string a match points into, or undefined if the page, paragraph or choice has gone. */
function findTarget(project, f) {
  const p = project.passages.find(q => q.id === f.pid);
  if (!p) return undefined;
  if (f.field === 'name' || f.field === 'heading') return { o: p, k: f.field };
  if (f.field === 'text') return p.blocks[f.i] ? { o: p.blocks[f.i], k: 'text' } : undefined;
  return p.choices[f.i] ? { o: p.choices[f.i], k: f.field } : undefined;
}
/**
 * Replaces every occurrence of `query` with `repl`, or only the one match `only` (a result of storyFind) when it still
 * says the same thing. Returns how many were changed. Page headings stay within their 120-letter limit.
 */
function storyReplace(project, query, repl, opt, only) {
  const re = findPattern(query, opt);
  if (!re) return 0;
  const to = String(repl == null ? '' : repl);
  let n = 0;
  function fix(t) {
    let s = t.o[t.k];
    if (typeof s !== 'string') return;
    if (only) {
      re.lastIndex = only.pos;
      const m = re.exec(s);
      if (!m || m.index !== only.pos || m[0].length !== only.len) return;
      s = s.slice(0, only.pos) + to + s.slice(only.pos + only.len);
      n = 1;
    } else {
      s = s.replace(re, () => {
        n++;
        return to;
      });
    }
    t.o[t.k] = t.k === 'heading' ? s.slice(0, 120) : s;
  }
  if (only) {
    const t = findTarget(project, only);
    if (t) fix(t);
    return n;
  }
  project.passages.forEach(p => {
    fix({ o: p, k: 'name' });
    fix({ o: p, k: 'heading' });
    p.blocks.forEach(b => fix({ o: b, k: 'text' }));
    p.choices.forEach(c => {
      fix({ o: c, k: 'label' });
      fix({ o: c, k: 'why' });
    });
  });
  return n;
}

/**
 * The pages in the order a player meets them: breadth first from the first page along every choice (and failed-roll
 * page), then any page nothing leads to, in the order they were made. Returns [{ id, depth }]; unreached pages have depth 0.
 */
function storyOrder(project) {
  const byId = Object.create(null);
  project.passages.forEach(p => {
    byId[p.id] = p;
  });
  const out = [];
  const seen = Object.create(null);
  const q = [];
  if (byId[project.start]) {
    q.push([project.start, 0]);
    seen[project.start] = true;
  }
  for (let h = 0; h < q.length; h++) {
    const [id, depth] = q[h];
    out.push({ id, depth });
    byId[id].choices.forEach(c => {
      [c.to, c.check && c.check.fail].forEach(to => {
        if (to && byId[to] && !seen[to]) {
          seen[to] = true;
          q.push([to, depth + 1]);
        }
      });
    });
  }
  project.passages.forEach(p => {
    if (!seen[p.id]) out.push({ id: p.id, depth: 0, loose: true });
  });
  return out;
}

/**
 * The story as a plain Markdown manuscript, for proofreading or keeping a readable copy: the title, then every page in list order
 * (name, heading, paragraphs) with its choices and where each leads. Conditions, items and numbers are left out on purpose; this is
 * the words, not the rules. Pure text, so it can be tested without a page.
 */
function storyManuscript(project) {
  const nameOf = id => {
    const q = project.passages.find(x => x.id === id);
    return q ? q.name || 'Untitled page' : '';
  };
  const out = [`# ${project.title || 'Untitled story'}`];
  if (project.author) out.push(`_by ${project.author}_`);
  const st = storyStats(project);
  out.push(`${project.passages.length} page${project.passages.length === 1 ? '' : 's'}, ${st.words.toLocaleString('en')} words. The first page is “${nameOf(project.start) || '?'}”.`);
  project.passages.forEach(p => {
    const kind = p.ending ? `${p.valence ? `${p.valence} ` : ''}ending` : '';
    const tags = [kind, p.id === project.start ? 'first page' : '', p.todo ? 'marked unfinished' : ''].filter(Boolean);
    out.push(`## ${p.name || 'Untitled page'}${tags.length ? ` _(${tags.join(', ')})_` : ''}`);
    if (p.heading) out.push(`### ${p.heading}`);
    p.blocks.forEach(b => {
      const t = String(b.text || '').trim();
      if (t) out.push(t);
    });
    if (!p.ending && p.choices.length)
      out.push(
        p.choices
          .map(c => {
            const to = c.to ? nameOf(c.to) || '(a page that no longer exists)' : '(not linked yet)';
            const fail = c.check ? ` (if the roll fails: *${nameOf(c.check.fail) || 'not linked yet'}*)` : '';
            return `- **${c.label || '(no words yet)'}** → *${to}*${fail}`;
          })
          .join('\n')
      );
  });
  return out.join('\n\n') + '\n';
}

/**
 * Routes for a tester: a short list of walks through the story that together take every choice a player can ever be offered at least once
 * (every outcome of a skill check too). `a` is the analyze() result. Each route is the quickest way (with the right things in hand) to a page, plus
 * the one choice being tested; a greedy pick keeps the list short (the next route is the one with the most choices not yet covered).
 * Returns null when the story is too large to have been checked completely. { routes: [{ steps }], total, unbuilt: [`pageId: label`], unreached: [pageId] }.
 * A step is { given, question, label } (an answer to a Given), or { label, to, ci, fail } (a choice taken, the page it leads to).
 */
function storyTestRoutes(project, a) {
  if (!a || a.truncated || !a.samples) return null;
  const byId = {};
  project.passages.forEach(p => (byId[p.id] = p));
  const edgesOf = steps => {
    let at = project.start;
    const out = [];
    steps.forEach(st => {
      if (st.given) return;
      out.push(`${at}.${st.ci}.${st.fail ? 1 : 0}`);
      at = st.to;
    });
    return out;
  };
  const want = new Set();
  const cands = [];
  const unbuilt = [];
  const unreached = [];
  project.passages.forEach(p => {
    const sms = a.samples(p.id, 8);
    if (!sms.length) return void unreached.push(p.id);
    if (p.ending) return;
    p.choices.forEach((c, ci) => {
      if (!c.to || !byId[c.to] || (c.check && !byId[c.check.fail])) return;
      (c.check ? [false, true] : [false]).forEach(fail => {
        const dest = fail ? c.check.fail : c.to;
        const sm = sms.find(x => klCondOk(c, x.flags) && (!c.check || klTarget(x.flags, c, fail ? 2 : 12) === dest));
        if (!sm) {
          // never offered, or no sample holds what it takes: the checker's own warnings say which; the script just says it has no route
          if (sms.some(x => klCondOk(c, x.flags))) unbuilt.push(`${p.id}: ${c.label}${fail ? ' (fails the roll)' : ''}`);
          return;
        }
        const steps = sm.path.concat([{ label: fail ? `${c.label} (fails the roll)` : c.label, to: dest, ci, fail }]);
        const edges = edgesOf(steps);
        edges.forEach(e => want.add(e));
        cands.push({ steps, edges });
      });
    });
  });
  const total = want.size;
  const routes = [];
  const left = new Set(want);
  while (left.size) {
    let best = null;
    let bestN = 0;
    for (const cd of cands) {
      let n = 0;
      for (const e of cd.edges) if (left.has(e)) n++;
      if (n > bestN || (n === bestN && n && best && cd.steps.length < best.steps.length)) {
        best = cd;
        bestN = n;
      }
    }
    if (!best) break;
    best.edges.forEach(e => left.delete(e));
    routes.push({ steps: best.steps });
  }
  return { routes, total, unbuilt, unreached };
}

/** The tester's checklist as Markdown: the routes of storyTestRoutes() as tick boxes, with page names and the words to choose. */
function storyTestScript(project, a) {
  const r = storyTestRoutes(project, a);
  if (!r) return null;
  const nameOf = id => (project.passages.find(x => x.id === id) || {}).name || 'Untitled page';
  const out = [`# Test script: ${project.title || 'Untitled story'}`];
  out.push(
    `${r.routes.length} route${r.routes.length === 1 ? '' : 's'} that together take each of the ${r.total} choice${r.total === 1 ? '' : 's'} players can be offered at least once. ` +
      'Play each route in the Play tab or in an exported game, ticking each box. On every page, also read it: spelling, a missing line, anything that feels wrong.'
  );
  if (project.passages.some(p => p.choices.some(c => c.check)))
    out.push('A line ending “(fails the roll)” needs a failed dice roll: the Play tab can set the roll, or just play again until it happens.');
  r.routes.forEach((rt, i) => {
    const last = rt.steps[rt.steps.length - 1];
    const lines = [`## Route ${i + 1}: ends at “${nameOf(last.to)}”${(project.passages.find(x => x.id === last.to) || {}).ending ? ' _(an ending)_' : ''}`];
    rt.steps.filter(st => st.given).forEach(st => lines.push(`- [ ] Before the story: answer “${st.question}” with “${st.label}”`));
    lines.push(`- [ ] Start on “${nameOf(project.start)}”`);
    rt.steps.filter(st => !st.given).forEach(st => lines.push(`- [ ] Choose “${st.label}” → “${nameOf(st.to)}”`));
    out.push(lines.join('\n'));
  });
  if (r.unbuilt.length)
    out.push(
      '## Not covered\nThe editor found no route to these choices (they may need a combination of items it did not try). Test them by hand:\n' +
        r.unbuilt.map(u => `- [ ] ${nameOf(u.split(': ')[0])}: ${u.slice(u.indexOf(': ') + 2)}`).join('\n')
    );
  if (r.unreached.length) out.push('## Pages no route reaches\n' + r.unreached.map(id => `- ${nameOf(id)}`).join('\n') + '\nThe Check tab says why.');
  return out.join('\n\n') + '\n';
}

/**
 * Totals for the top bar. "Words" counts only what a player can read: the story title, page headings,
 * every paragraph and every choice label (all of them, whether or not an item currently shows them).
 * Page names and item names are for the author, so they are not counted.
 */
function storyStats(project) {
  let words = 0;
  let choices = 0;
  let good = 0;
  let bad = 0;
  function count(t) {
    const m = String(t || '').match(/\S+/g);
    words += m ? m.length : 0;
  }
  count(project.title);
  (project.givens || []).forEach(g => {
    // the questions and their answers are read by the player too
    count(g.question);
    g.options.forEach(id => {
      const it = project.items.filter(x => x.id === id)[0];
      if (it) count(it.name);
    });
  });
  project.passages.forEach(p => {
    count(p.heading);
    p.blocks.forEach(b => {
      count(b.text);
    });
    p.choices.forEach(ch => {
      count(ch.label);
      choices++;
    });
    if (p.ending && p.valence === 'good') good++;
    if (p.ending && p.valence === 'bad') bad++;
  });
  let answers = 0;
  (project.givens || []).forEach(g => {
    answers += g.options.length;
  });
  return { pages: project.passages.length, items: project.items.length - answers, givens: (project.givens || []).length, choices, words, good, bad };
}

/* ---------------------------------------------------------------------------
   7. Import of the old plain-text format
   ---------------------------------------------------------------------------
   Understands the earlier "[[page]]  -> words => target | needs: item" format.
   Returns { project, notes[] } where notes explain anything that was changed.
   --------------------------------------------------------------------------- */
function parseLegacy(text) {
  const m = /<script[^>]*id=["']story(?:-source)?["'][^>]*>([\s\S]*?)<\/script>/i.exec(text);
  const raw = m ? m[1] : text;
  const notes = [];
  const project = makeProject('Imported story');
  project.passages = [];
  const itemByName = Object.create(null);
  const byLegacy = Object.create(null);
  let current = null;
  const list = [];
  const helpers = [];
  function itemId(name) {
    const key = name.trim().toLowerCase();
    if (!itemByName[key]) {
      const it = makeItem(prettyName(name));
      itemByName[key] = it;
      project.items.push(it);
    }
    return itemByName[key].id;
  }
  raw.split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.indexOf('//') === 0) return;
    const h = /^\[\[(.+?)\]\]$/.exec(t);
    if (h) {
      const p = makePassage(prettyName(h[1].trim()));
      p.blocks = [];
      p._legacy = h[1].trim();
      byLegacy[p._legacy] = p;
      list.push(p);
      current = p;
      return;
    }
    if (!current) {
      const i = t.indexOf(':');
      if (i > 0 && t.slice(0, i).trim().toLowerCase() === 'title') project.title = t.slice(i + 1).trim();
      return;
    }
    if (t.indexOf('->') === 0) {
      const parts = t.slice(2).split('=>');
      if (parts.length !== 2) {
        notes.push(`Skipped a choice that could not be read: ${t}`);
        return;
      }
      const rest = parts[1].split('|').map(s => s.trim());
      const ch = makeChoice(parts[0].trim(), '');
      ch._target = rest[0];
      ch._gives = [];
      rest.slice(1).forEach(o => {
        const mm = /^(needs|unless|gives)\s*:\s*(.+)$/i.exec(o);
        if (!mm) return;
        const id = itemId(mm[2]);
        const kind = mm[1].toLowerCase();
        if (kind === 'needs') ch.needs.push(id);
        else if (kind === 'unless') ch.forbid.push(id);
        else ch._gives.push(id);
      });
      current.choices.push(ch);
      return;
    }
    if (t.indexOf('# ') === 0) {
      current.heading = t.slice(2).trim();
      return;
    }
    const c = /^\((if|unless)\s+([^)]+)\)\s*(.+)$/i.exec(t);
    const b = makeBlock(c ? c[3] : t);
    if (c) {
      if (c[1].toLowerCase() === 'if') b.needs.push(itemId(c[2]));
      else b.forbid.push(itemId(c[2]));
    }
    current.blocks.push(b);
  });
  list.forEach(p => {
    if (!p.blocks.length) p.blocks.push(makeBlock(''));
    if (!p.choices.length) p.ending = true;
    project.passages.push(p);
  });
  list.forEach(p => {
    p.choices.forEach(ch => {
      const target = byLegacy[ch._target];
      if (!target) {
        notes.push(`A choice on "${p.name}" led to "${ch._target}", which does not exist.`);
        ch.to = '';
      } else ch.to = target.id;
      if (ch._gives.length && target) {
        /* The old format gave items when a choice was picked. Here items are given
           when a page is reached, so a tiny page is added in between. */
        const names = ch._gives.map(id => project.items.filter(i => i.id === id)[0].name);
        const step = makePassage(`Picked up ${names.join(' and ')}`);
        step.blocks = [makeBlock('You take it.')];
        step.gives = ch._gives.slice();
        step.choices = [makeChoice('Continue', target.id)];
        helpers.push(step);
        ch.to = step.id;
        notes.push(`The choice "${ch.label}" gave items, so a small page called "${step.name}" was added after it.`);
      }
      delete ch._target;
      delete ch._gives;
    });
    delete p._legacy;
  });
  helpers.forEach(p => {
    project.passages.push(p);
  });
  if (!project.passages.length) throw new Error('No pages were found in that file.');
  project.start = project.passages[0].id;
  if (project.passages[0].ending) {
    project.passages[0].ending = false;
    notes.push(`The first page "${project.passages[0].name}" has no choices; it stays a normal page because a first page cannot be an ending.`);
  }
  return { project, notes };
}

/* ---------------------------------------------------------------------------
   8. Export of a finished game
   ---------------------------------------------------------------------------
   The exported file is one self-contained page: the story data, the five rule
   functions above, the player (PART 2) and its stylesheet. It makes no network
   requests, and a Content-Security-Policy tag forbids them.
   --------------------------------------------------------------------------- */

/**
 * The story data players need, as small as it can be: no editor-only fields (page names, unfinished choices),
 * and no field that only repeats the default (an empty list, false, an empty text). The game rules and the
 * player treat a missing field as its default.
 */
function exportStory(project) {
  const put = (o, k, v) => {
    if (Array.isArray(v) ? v.length : v && (typeof v !== 'object' || Object.keys(v).length)) o[k] = v;
    return o;
  };
  const out = {
    id: project.id,
    title: project.title,
    start: project.start,
    items: project.items.map(i => {
      const o = { id: i.id, name: i.name };
      if (i.kind === 'state' || i.kind === 'stat') o.kind = i.kind;
      if (i.kind === 'stat') {
        o.lo = i.lo;
        o.hi = i.hi;
        put(o, 'start', i.start);
      }
      put(o, 'show', !!i.show);
      return put(o, 'names', i.names);
    }),
    givens: (project.givens || []).filter(g => g.options.length).map(g => ({ id: g.id, question: g.question, options: g.options })),
    passages: project.passages.map(p => {
      const o = { id: p.id };
      put(o, 'heading', p.heading);
      put(o, 'ending', !!p.ending);
      put(o, 'valence', p.valence);
      o.blocks = p.blocks.map(b => put(put(put({ text: b.text }, 'needs', b.needs), 'forbid', b.forbid), 'orPrev', !!b.orPrev));
      put(o, 'gives', p.gives);
      put(o, 'takes', p.takes);
      put(o, 'adds', p.adds);
      put(o, 'sends', p.sends);
      if (!p.ending)
        put(
          o,
          'choices',
          p.choices
            .filter(c => c.to && (!c.check || c.check.fail)) // unfinished choices (and checks with no fail page) are left out
            .map(c => {
              const e = put(put(put(put({ label: c.label, to: c.to }, 'needs', c.needs), 'forbid', c.forbid), 'gives', c.gives), 'takes', c.takes);
              put(e, 'adds', c.adds);
              if (c.check) e.check = { stat: c.check.stat, target: c.check.target, fail: c.check.fail };
              if (c.lock) {
                e.lock = true;
                put(e, 'why', c.why);
              }
              return e;
            })
        );
      return o;
    })
  };
  /* reader options: only what differs from the defaults */
  const g = cleanGame(project.game);
  const go = {};
  Object.keys(GAME_DEFAULTS).forEach(k => {
    if (g[k] !== GAME_DEFAULTS[k]) go[k] = g[k];
  });
  put(out, 'game', go);
  if (project.lang0c) out.l0c = project.lang0c;
  if ((project.langs || []).length) {
    out.l0 = project.lang0 || 'English';
    out.langs = project.langs.map(L => xlCompile(project, L, out));
  }
  return out;
}

/** Escapes text for use inside HTML. */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The Content-Security-Policy used by the editor and by exported games: nothing may touch the network. */
const CSP_OFFLINE =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; " +
  "connect-src 'none'; form-action 'none'; base-uri 'none'";

/**
 * The characters the small typeface carries (build.py makes it and checks this list against it): plain English text, curly quotes,
 * dashes, the ellipsis, bullets and the multiplication sign. A game whose story and title use only these gets the small font, about
 * 7 KB lighter; any other character (é, ñ, ↑) gets the full one. The arrow → is in neither, so it never decides.
 */
const KL_LITE_FONT = /^[\u0020-\u007e\u00b7\u00d7\u2013\u2014\u2018-\u201a\u201c-\u201e\u2022\u2026\u2192]*$/;

/**
 * Builds the complete HTML text of an exported game. `assets` = { parts, fonts, fontsLite } (see gameAssets in the editor): `parts` holds the
 * game's code and style parts, and only the ones this story needs are written into the file; `fonts` is the full typeface and `fontsLite`
 * the small one, used when the story's characters allow it (KL_LITE_FONT). (`assets.features` can force a
 * different list; the tests use it to compare a lite game with a full one.)
 */
/**
 * A short fingerprint of the story's shape (the ids of its pages, items and Given questions, in order), written into exported
 * games. A player's saved place is kept under it, so a changed story (a page added or removed) starts fresh instead of
 * landing a player on the wrong page, while fixing a typo keeps everyone's place.
 */
function klFingerprint(project) {
  const text = [project.passages, project.items, project.givens || []].map(list => list.map(x => x.id).join(',')).join('|');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * The story as exportStory() made it, with every id swapped for a short code (pages a, b, c ... in order; items i0, i1 ...;
 * Given questions g0, g1 ...). Ids repeat all through the story data, so this makes games smaller. Only exported games get it:
 * the editor itself (the Play tab, the checker) keeps working with the real ids. Ids that are really "id inside text" are
 * rewritten too: "t:<number>:<n>" tests and "m:<object>:p:<page>" hand-over records. contract.mjs plays the shortened story
 * and the original and requires identical results.
 */
function klShortIds(story) {
  const page = Object.create(null);
  const item = Object.create(null);
  const given = Object.create(null);
  story.passages.forEach((p, i) => (page[p.id] = i.toString(36)));
  story.items.forEach((x, i) => (item[x.id] = `i${i.toString(36)}`));
  (story.givens || []).forEach((g, i) => (given[g.id] = `g${i.toString(36)}`));
  const it = id => item[id] ?? id;
  const pg = id => page[id] ?? id;
  /** Any id a condition or list can hold: an item, "t:<number>:<n>", or "m:<object>:p:<page>" / "m:<object>:w:<name>". */
  const cid = id => {
    if (id.startsWith('t:')) {
      const t = parseStatTest(id);
      return t ? `t:${it(t.stat)}:${t.n}` : id;
    }
    if (id.startsWith('m:')) {
      const m = /^m:([^:]+):([pw]):([\s\S]*)$/.exec(id);
      return m ? `m:${it(m[1])}:${m[2]}:${m[2] === 'p' ? pg(m[3]) : m[3]}` : id;
    }
    return it(id);
  };
  const list = a => (a ? a.map(cid) : a);
  const keyed = o => {
    if (!o) return o;
    const out = {};
    Object.keys(o).forEach(k => (out[it(k)] = o[k]));
    return out;
  };
  const out = { ...story, start: pg(story.start) };
  out.items = story.items.map(x => {
    const o = { ...x, id: it(x.id) };
    if (x.names) o.names = x.names.map(n => ({ ...n, when: cid(n.when) }));
    return o;
  });
  if (story.givens) out.givens = story.givens.map(g => ({ ...g, id: given[g.id], options: list(g.options) }));
  out.passages = story.passages.map(p => {
    const o = { ...p, id: pg(p.id) };
    o.blocks = p.blocks.map(b => {
      const x = { ...b };
      if (b.needs) x.needs = list(b.needs);
      if (b.forbid) x.forbid = list(b.forbid);
      return x;
    });
    ['gives', 'takes'].forEach(k => p[k] && (o[k] = list(p[k])));
    if (p.adds) o.adds = keyed(p.adds);
    if (p.sends) o.sends = keyed(p.sends);
    if (p.choices)
      o.choices = p.choices.map(c => {
        const x = { ...c, to: pg(c.to) };
        ['needs', 'forbid', 'gives', 'takes'].forEach(k => c[k] && (x[k] = list(c[k])));
        if (c.adds) x.adds = keyed(c.adds);
        if (c.check) x.check = { ...c.check, stat: it(c.check.stat), fail: pg(c.check.fail) };
        return x;
      });
    return o;
  });
  return out;
}

/* ----- Zipped pages -----
   A finished page (the editor, or an exported game) can be stored deflate-compressed inside a tiny page that unzips itself when opened:
   about half the size on disk, a few milliseconds to open. The browser's own DecompressionStream does the work; zipInflate below is the
   fallback for browsers that lack it (it is also run against zlib's output on every build, in contract.mjs). */

/** Raw-deflate bytes (Uint8Array) -> text. A plain, small inflater (RFC 1951): stored, fixed and dynamic blocks. */
function zipInflate(s) {
  let p = 0, bb = 0, bn = 0, o = new Uint8Array(s.length * 6 || 64), l = 0;
  const bits = c => {
    while (bn < c) {
      bb |= s[p++] << bn;
      bn += 8;
    }
    const v = bb & ((1 << c) - 1);
    bb >>>= c;
    bn -= c;
    return v;
  };
  const put = c => {
    if (l === o.length) {
      const t = new Uint8Array(l * 2);
      t.set(o);
      o = t;
    }
    o[l++] = c;
  };
  /* a canonical Huffman code from its code lengths: how many codes of each length, and the symbols in code order */
  const build = len => {
    const cnt = new Uint16Array(16), sym = new Uint16Array(len.length), off = new Uint16Array(16);
    for (let i = 0; i < len.length; i++) cnt[len[i]]++;
    cnt[0] = 0;
    for (let i = 1; i < 15; i++) off[i + 1] = off[i] + cnt[i];
    for (let i = 0; i < len.length; i++) if (len[i]) sym[off[len[i]]++] = i;
    return { cnt, sym };
  };
  const decode = h => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = h.cnt[len];
      if (code - count < first) return h.sym[index + code - first];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error('bad zip data');
  };
  const LB = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DB = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  let last;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bb = 0;
      bn = 0; // stored: skip to the next whole byte
      let n = s[p] | (s[p + 1] << 8);
      p += 4;
      while (n--) put(s[p++]);
      continue;
    }
    let lh, dh;
    if (type === 1) {
      const f = new Uint8Array(288);
      f.fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288);
      lh = build(f);
      dh = build(new Uint8Array(30).fill(5));
    } else {
      const nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4;
      const cl = new Uint8Array(19);
      [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15].slice(0, nc).forEach(i => (cl[i] = bits(3)));
      const ch = build(cl), lens = [];
      while (lens.length < nl + nd) {
        const x = decode(ch);
        if (x < 16) lens.push(x);
        else {
          let v = 0, r;
          if (x === 16) {
            v = lens[lens.length - 1];
            r = 3 + bits(2);
          } else r = x === 17 ? 3 + bits(3) : 11 + bits(7);
          while (r--) lens.push(v);
        }
      }
      lh = build(lens.slice(0, nl));
      dh = build(lens.slice(nl));
    }
    for (;;) {
      let x = decode(lh);
      if (x < 256) put(x);
      else if (x === 256) break;
      else {
        x -= 257;
        let n = LB[x] + bits(LE[x]);
        const d = decode(dh), back = DB[d] + bits(DE[d]);
        while (n--) put(o[l - back]);
      }
    }
  } while (!last);
  return new TextDecoder().decode(o.subarray(0, l));
}

/**
 * The LFC Foundry header comment at the top of every file this software makes: the editor itself and every exported game.
 * `name` is the application or game name; `note` is an optional extra sentence (an exported game says the story's words stay its author's).
 * The text is the same as foundry-header.txt, which build.py puts at the top of the editor; a test compares the two.
 */
function foundryHeader(name, note) {
  const nm = String(name || 'Story').replace(/\s+/g, ' ').replace(/-{2,}/g, '- -').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim().slice(0, 120) || 'Story';
  return `<!--
    ===================================================================================
    🛠️ APPLICATION : ${nm}
    🏭 FORGED BY : LFC Foundry (https://github.com/JNFoo)
    📜 LICENSE : MIT License
    ===================================================================================
    Copyright (c) 2026 LFC Foundry

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

${note ? `    ${note}\n\n` : ''}    BRANDING NOTICE: While the code is open under MIT, the name "LFC Foundry" and 
    associated project identities are reserved. If you fork, significantly modify, 
    or commercially redistribute this software, you must change the external public 
    product name and branding.
    ===================================================================================
    -->`;
}

/** The small page that holds `b64` (base64 of the raw-deflated page) and shows the page when opened. `title` is already HTML-safe. */
function zippedPage(b64, title, header) {
  const lines = b64.replace(/.{1,120}/g, '$&\n');
  const boot =
    '(function(){var u=atob(document.getElementById("z").textContent),n=u.length,a=new Uint8Array(n);while(n--)a[n]=u.charCodeAt(n);' +
    zipInflate.toString() +
    ';function w(t){document.open();document.write(t);document.close()}' +
    'if(window.DecompressionStream)new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text().then(w,function(){w(zipInflate(a))});' +
    'else w(zipInflate(a))})()';
  return (
    '<!doctype html>\n' + (header ? header + '\n' : '') + '<!-- This page is stored zipped, which makes the file about half its normal size. It unzips itself the moment it is opened (a few\n' +
    '     milliseconds) and works offline, like any page. The zipped copy is the block of letters below; the short script after it opens it. -->\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + title + '</title>\n' +
    '<noscript>This page needs JavaScript turned on to open.</noscript>\n<script type="text/plain" id="z">\n' + lines + '</script>\n<script>' + boot + '</script>\n'
  );
}

/** A finished page as a zipped page (browser only: uses CompressionStream). Returns the page unchanged where that is not available. */
async function zipPage(html) {
  if (typeof CompressionStream === 'undefined') return html;
  try {
    const packed = new Uint8Array(await new Response(new Blob([html]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let bin = '';
    for (let i = 0; i < packed.length; i += 8192) bin += String.fromCharCode.apply(null, packed.subarray(i, i + 8192));
    return zippedPage(btoa(bin), (/<title>([\s\S]*?)<\/title>/.exec(html) || [0, 'Story'])[1], (/<!--\n {4}={20,}[\s\S]*?-->/.exec(html) || [''])[0]); /* the header stays readable at the top of the zipped file */
  } catch (e) {
    return html;
  }
}

function buildGameHtml(project, assets) {
  /* "<" and the two JSON-legal line separators are escaped so story text can never close the script tag early. */
  const story = exportStory(project);
  const features = assets.features || klFeatures(story);
  story.fp = klFingerprint(project);
  const json = JSON.stringify(klShortIds(story))
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const title = escapeHtml(project.title || 'Story');
  const game = cleanGame(project.game);
  const pal = game.pal;
  /* the page behind the story takes the palette's color too (the default follows the device's light or dark setting) */
  const ground =
    pal === 'paper'
      ? 'html,body{margin:0;background:#e7e3d8}@media(prefers-color-scheme:dark){html,body{background:#0b1519}}'
      : `html,body{margin:0;background:${(PALETTES[pal].light || PALETTES[pal].dark).bg}}`;
  return `<!doctype html>
${foundryHeader(project.title, 'This notice covers the game program. The story’s words and art belong to the story’s author.')}
<!-- ${title.replace(/--/g, '- -')}: an interactive story. Open it in any web browser, on any device. It works offline and
     never contacts the internet; your place in the story is kept in this browser. Made with Story Editor. -->
<html lang="${LANG_CODE.test(project.lang0c || '') ? project.lang0c : 'en'}"${LANG_CODE.test(project.lang0c || '') && LANG_RTL.test(project.lang0c.split('-')[0]) ? ' dir="rtl"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${CSP_OFFLINE}">
<meta name="color-scheme" content="light dark">
<meta name="text-scale" content="scale">
<meta name="generator" content="Story Editor">
<link rel="icon" href="data:,">
<title>${title}</title>
<style>${ground}${project.gameFont === 'system' ? '' : (KL_LITE_FONT.test(json + title) && assets.fontsLite) || assets.fonts || ''}${gameCss(assets.parts.css, features, game)}</style>
</head>
<body>
<div id="game"><noscript>This story needs JavaScript, which is turned off in this browser.</noscript></div>
<script type="application/json" id="story-data">${json}</script>
<script>${gameScript(assets.parts.js, features)}</script>
</body>
</html>
`;
}
