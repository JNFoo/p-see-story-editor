/* ============================================================================
   PART 3 OF 3 · THE EDITOR  (what you see and click)
   ----------------------------------------------------------------------------
   Everything below runs inside one function so nothing leaks into the page.
   It is split into these sections, in this order:

     3a  State, DOM helper, saving and undo          (this section)
     3b  Widgets: toasts, tooltips, dialogs, files, drag and drop, menus, icons
     3c  The Write screen: page list, item list, and the three-part page editor
     3d  The Map (3d-1), then the Items, Check and Play screens
     3e  File menu, quick guide, top bar and start-up

   Conventions
     * Modern JavaScript (ES2020): const/let, arrow functions, template strings,
       optional chaining, async/await. Every current browser on computers,
       Android, iPhone and iPad runs it.
     * The page is built with h(); text always goes in as text, never as HTML.
     * "project" is the whole story (see PART 1). Edit it, then call refresh().
   ============================================================================ */

/* ---------------------------------------------------------------------------
   3a. State, DOM helper, saving and undo
   --------------------------------------------------------------------------- */

/* Start-up timing for the Speed report: the moment the editor's own code began (milliseconds since the page was asked for; with the packed page
   this includes unpacking it) and the moment the first screen was drawn, set at the end of init(). */
const BOOT_AT = performance.now();
let READY_AT = 0;
const STORE = 'story-editor-v1'; // localStorage key for the autosaved story
const UNDO_STEPS = 150; // most undo steps kept
const UNDO_BYTES = 24e6; // ...and at most this many characters of undo history
const SAVE_DELAY = 300; // ms to wait after the last edit before saving (typing stays smooth)
const CHECK_DELAY = 500; // ms to wait after the last edit before re-running the checker

let project; // the story being edited (see PART 1 for its shape)
let cur; // JSON text of `project` as last committed
const undoStack = []; // snapshots (JSON text) for Undo / Redo
let redoStack = [];
let undoBytes = 0;
let lastKey = ''; // used to merge rapid typing into one undo step
let lastT = 0;
let mergeStart = 0; // when the current merged undo step began
let view = 'write'; // which tab is showing: write | map | items | check | play
let selId = ''; // id of the page open in the Write tab
let analysis = null; // latest result of analyze(project)
let analysisFor = null; // the saved story text (cur) that `analysis` was made from
let checkTimer = 0; // pending timers
let saveTimer = 0;
let writerLost = false; // true while another window has the story: this one writes nothing to storage (see guardStart in ui5-app.js)
let filter = ''; // text typed in the page-list search box (no longer shown; kept for the list code)
/** Pages visited in the Write tab, for the Back and Forward buttons: `list` of ids, `i` the one showing. */
const hist = { list: [], i: -1, nav: false };
/** Called whenever the Write tab draws: records a new page, unless it was reached with Back or Forward. */
function histVisit() {
  if (hist.nav) {
    hist.nav = false;
    return;
  }
  if (hist.list[hist.i] === selId) return;
  hist.list.splice(hist.i + 1);
  hist.list.push(selId);
  if (hist.list.length > 100) hist.list.shift();
  hist.i = hist.list.length - 1;
}
/** The page Back (d = -1) or Forward (d = 1) would open, skipping pages that were deleted; null if none. */
function histTarget(d) {
  for (let j = hist.i + d; j >= 0 && j < hist.list.length; j += d) if (byId(hist.list[j])) return j;
  return -1;
}
const openCond = new WeakSet(); // blocks/choices whose condition row the author opened by hand
const openFx = new WeakSet(); // choices whose "when picked" row (gets / loses) the author opened by hand
let storageOk = true; // false if this browser refuses to save (private mode, etc.)

/* ----- settings and preferences -----
   settings  always kept in this browser: which advanced features each tab shows, and whether to remember
             preferences at all (settings.chosen: the author has set the Advanced choices themselves)
   prefs     light or dark, the editor's font and the map's settings: kept between visits only while
             "Remember preferences" (Options menu) is on. Turning it off forgets them. */
const SETTINGS_KEY = `${STORE}-settings`;
const PREF_KEYS = [`${STORE}-theme`, `${STORE}-map`, `${STORE}-prefs`];
const settings = { remember: true, chosen: false, advanced: { write: false, map: false, items: false, game: false } };
const prefs = { editorFont: 'ui', wpm: 230, sort: 'written', quotes: false, wsize: 'm', pagesOpen: true, itemsOpen: true, paraMax: 150, pageMax: 600, writingIgnore: [], swipeTip: false };
/** Saves the preferences (kept between visits only while "Remember preferences" is on). */
function savePrefs() {
  savePref(`${STORE}-prefs`, JSON.stringify(prefs));
}
/** Reads the settings kept in this browser (once, at start-up). */
function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (o && typeof o === 'object') {
      settings.remember = o.remember !== false;
      settings.chosen = o.chosen === true;
      for (const k of ['write', 'map', 'items', 'game']) settings.advanced[k] = o.advanced?.[k] === true;
    }
    const p = JSON.parse((settings.remember && localStorage.getItem(`${STORE}-prefs`)) || 'null');
    if (p?.editorFont === 'system') prefs.editorFont = 'system';
    if (Number.isFinite(p?.wpm)) prefs.wpm = Math.max(100, Math.min(500, Math.round(p.wpm)));
    if (['written', 'story', 'az'].includes(p?.sort)) prefs.sort = p.sort;
    if (p?.quotes === true) prefs.quotes = true;
    if (['s', 'm', 'l', 'x'].includes(p?.wsize)) prefs.wsize = p.wsize; // 'x' is Extra large (it used to fail to come back after a reload)
    if (p?.pagesOpen === false) prefs.pagesOpen = false;
    if (p?.itemsOpen === false) prefs.itemsOpen = false;
    if (p?.swipeTip === true) prefs.swipeTip = true;
    if (Number.isFinite(p?.paraMax)) prefs.paraMax = Math.max(30, Math.min(2000, Math.round(p.paraMax)));
    if (Number.isFinite(p?.pageMax)) prefs.pageMax = Math.max(100, Math.min(20000, Math.round(p.pageMax)));
    if (Array.isArray(p?.writingIgnore)) prefs.writingIgnore = p.writingIgnore.filter(k => typeof k === 'string' && k.length < 200).slice(-300);
  } catch {
    /* storage off or damaged: defaults */
  }
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage off: lasts until the page closes */
  }
}
/**
 * True on a device used by touch alone (a phone or tablet): the guide, the tour and the menus then say "tap" and leave out keyboard
 * shortcuts. A test can force it with window.__editor.touch(true / false / null).
 */
let touchForce = null;
function touchOnly() {
  if (touchForce !== null) return touchForce;
  return typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
}
/** True while the narrow-screen (phone) layout is in use. */
function phoneLayout() {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 820px)').matches;
}
/** Keeps a preference in this browser, but only while "Remember preferences" is on. */
function savePref(key, value) {
  if (!settings.remember) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage off */
  }
}
/** A remembered preference, or null (also null while preferences are not remembered). */
function readPref(key) {
  if (!settings.remember) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
/** True if the advanced features of `tab` ('write', 'map', 'items' or 'game') are shown. */
const adv = tab => settings.advanced[tab];
/** Hands over (giving an object to someone, or leaving it somewhere) is hidden in the editor for now. */
const HANDS_OVER = false;

/** Shorthand for document.querySelector. */
function $(s, r) {
  return (r || document).querySelector(s);
}

/**
 * Builds an element:  h('button', { class: 'btn', title: 'Tip', onclick: fn }, ['Label', child])
 * - `text` sets plain text; `class` sets className; `on...` adds an event listener
 * - `value` sets the property; null / undefined / false attributes are skipped
 * - children may be strings or elements; null children are skipped
 * Never uses innerHTML, so nothing typed by the author can become markup.
 */
function h(tag, a, kids) {
  const e = document.createElement(tag);
  let k;
  let v;
  a = a || {};
  for (k in a) {
    v = a[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  (kids || []).forEach(c => {
    if (c === null || c === undefined || c === false) return;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return e;
}

/* ----- looking things up by id ----- */

/** The page with this id, or null. */
function byId(id) {
  for (let i = 0; i < project.passages.length; i++) if (project.passages[i].id === id) return project.passages[i];
  return null;
}
/** The item (object or state) with this id, or null. */
function itemById(id) {
  for (let i = 0; i < project.items.length; i++) if (project.items[i].id === id) return project.items[i];
  return null;
}
/** A "where it went" record by id (ids starting "m:"), or null. */
function refById(id) {
  const v = virtualRefs(project);
  for (let i = 0; i < v.length; i++) if (v[i].id === id) return v[i];
  return null;
}
/** Readable name for an item id or a "where it went" id. */
function itemName(id) {
  if (id.indexOf('m:') === 0) {
    const r = refById(id);
    return r ? r.label : '?';
  }
  const t = parseStatTest(id);
  if (t) {
    const st = itemById(t.stat);
    return st ? `${st.name} ${t.n} or more` : '?';
  }
  const it = itemById(id);
  return it ? it.name : '?';
}
/** 'object' | 'state' | 'stat' (a number, or a test such as "Courage 5 or more") | 'moved' (a "where it went" record). */
function itemKind(id) {
  if (id.indexOf('m:') === 0) return 'moved';
  if (id.indexOf('t:') === 0) return 'stat';
  return kindOf(itemById(id));
}
/** True if the id still points at something. */
function refExists(id) {
  if (id.indexOf('t:') === 0) return !!(parseStatTest(id) && itemById(parseStatTest(id).stat));
  return id.indexOf('m:') === 0 ? !!refById(id) : !!itemById(id);
}
/** "has “Key”" / "is “Sick”" / "“Key handed to Pell” has happened" - for toasts. */
function wording(id) {
  const k = itemKind(id);
  return k === 'moved'
    ? `“${itemName(id)}” has happened`
    : k === 'stat'
      ? `has “${itemName(id)}”`
      : `${(k === 'state' ? 'is “' : 'has “') + itemName(id)}”`;
}
/** A page's name, or a stand-in if it is blank. */
function pname(p) {
  return (p && p.name) || 'Untitled page';
}

/** The last few things that went wrong, for the Speed report (see ui4-speed.js). Never written anywhere or sent anywhere. */
const errorLog = [];
const ERROR_KEEP = 5;
/**
 * Notes an error: where in the program it happened (`where`, a few words), what it said, and the names of the functions it
 * was inside (the file's line numbers mean little once the file is packed, the function names do not). Use it in every
 * `catch` that carries on instead of telling the person.
 */
function logError(where, err) {
  const msg = String((err && err.message) || err);
  const frames = String((err && err.stack) || '')
    .split('\n')
    .map(l => l.trim().match(/^(?:at\s+)?([\w$.<>]+)(?:@|\s\()/))
    .filter(Boolean)
    .map(m => m[1])
    .slice(0, 4);
  errorLog.push({ at: Math.round(performance.now()), where, msg: msg.slice(0, 200), frames });
  if (errorLog.length > ERROR_KEEP) errorLog.shift();
}
window.addEventListener('error', e => logError('uncaught', e.error || `${e.message} (${e.lineno}:${e.colno})`));
window.addEventListener('unhandledrejection', e => logError('uncaught promise', e.reason));

/* ----- saving ----- */

const BACKUP_KEY = `${STORE}-backup`; // the spare copy: the story as it was before the first save of a session, renewed every few minutes
const DAMAGED_KEY = `${STORE}-damaged`; // an unreadable save, kept so nothing is destroyed by the spare taking over
const BACKUP_EVERY = 10 * 60 * 1000;
let lastBackup = 0;
let lastLocalSave = 0; // when the autosave last wrote to this browser (shown in the status line)
let storeSeen; // the save text this window last read from storage or wrote to it; undefined while unknown (storage unreadable)
/** Is this text a whole story the editor could open? Checked before every save so a broken state never overwrites a good one. */
function savable(text) {
  try {
    const o = JSON.parse(text);
    return !!o && o.format === 'story-editor' && Array.isArray(o.passages) && o.passages.length > 0;
  } catch {
    return false;
  }
}
/** Writes the current story to this browser's storage right now, but only if it is a whole story; the old save becomes the spare. */
function persistNow(forceSpare) {
  if (writerLost) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!savable(cur)) {
    logError('autosave', 'The story text was not a whole story, so nothing was written.');
    return;
  }
  const keepSpare = before => {
    /* the spare: the save from before this one, renewed at most every ten minutes (and once at the first save of a session);
       always when a whole other story is about to take this one's place */
    if (before && before !== cur && (forceSpare || Date.now() - lastBackup > BACKUP_EVERY) && savable(before)) {
      try {
        localStorage.setItem(BACKUP_KEY, before);
        lastBackup = Date.now();
      } catch (e) {
        logError('spare copy', e); // the spare is a bonus: a full disk must not stop the real save
      }
    }
  };
  try {
    const before = localStorage.getItem(STORE);
    /* Another window saved since this one last looked (its `storage` event did not reach us, or it does not share our lock): do not write over it.
       A forced save is the person's own choice (Keep mine, New story, Open), and keeps their version as the spare. */
    if (!forceSpare && storeSeen !== undefined && before !== storeSeen && before !== cur && savable(before)) {
      guardBox('changed');
      return;
    }
    try {
      localStorage.setItem(STORE, cur);
    } catch (e) {
      /* a full disk: the spare copy gives up its room first, then one more try */
      localStorage.removeItem(BACKUP_KEY);
      localStorage.setItem(STORE, cur);
    }
    storeSeen = cur;
    keepSpare(before);
    lastLocalSave = Date.now();
    if (typeof renderStatus === 'function') renderStatus();
    if (!storageOk) {
      storageOk = true; // it works again (room was freed, or the browser let go)
      const w = $('#nosave');
      if (w) w.hidden = true;
    }
  } catch (e) {
    storageOk = false;
    logError('autosave', e);
    if (typeof renderStatus === 'function') renderStatus();
    const w = $('#nosave');
    if (w) w.hidden = false;
  }
}
/** Saves shortly after the last edit, so typing never waits on the disk. */
function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, SAVE_DELAY);
}
/* Make sure a pending save is never lost when the tab is hidden or closed. */
window.addEventListener('pagehide', () => {
  if (saveTimer) persistNow();
});
/* When this browser will not keep the story at all, closing the tab would lose the changes: ask first. */
window.addEventListener('beforeunload', e => {
  if (storageOk) return;
  if (typeof savedText !== 'undefined' && savedText !== null && cur === savedText) return; // saved to a file: nothing to lose
  e.preventDefault();
  e.returnValue = '';
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) persistNow();
});

/* ----- undo / redo (whole-story snapshots, memory-capped) ----- */

/*
   Each snapshot is { s: story as JSON text, e: epoch }. The epoch goes up whenever a whole new story is swapped in
   (open, import, new, example), so Undo can tell when it crosses into a different document: a file chosen for one
   document is then forgotten, and Save can never write one story over another's file.
*/
let epoch = 0;
let epochs = 0;
/** The story as it is now, as a snapshot. */
const snap = () => ({ s: cur, e: epoch, t: Date.now() });

/** Adds a snapshot to the undo list, dropping the oldest ones when over budget. */
function pushUndo(x) {
  undoStack.push(x);
  undoBytes += x.s.length;
  while (undoStack.length > UNDO_STEPS || (undoBytes > UNDO_BYTES && undoStack.length > 1)) undoBytes -= undoStack.shift().s.length;
}
/** Takes the newest snapshot off the undo list. */
function popUndo() {
  const x = undoStack.pop();
  undoBytes -= x.s.length;
  return x;
}

/**
 * Records the story's current state as an undo step (unless nothing changed) and saves it.
 * Calls with the same `key` within 1.2 s merge, so a burst of typing is one undo step (but never more than
 * 10 seconds of it, so Undo never throws away a long stretch of writing).
 */
function commit(key) {
  pruneVirtual(project);
  const s = JSON.stringify(project);
  if (s === cur) return;
  const now = Date.now();
  const merge = key && key === lastKey && now - lastT < 1200 && now - mergeStart < 10000;
  if (!merge) {
    pushUndo(snap());
    mergeStart = now;
  }
  redoStack = [];
  cur = s;
  lastKey = key || '';
  lastT = now;
  persistSoon();
  scheduleCheck();
  renderTopSoon();
}
/** Redraws the top bar (title, undo, tabs, totals) at most once per frame, however fast the person types. */
let topQueued = false;
function renderTopSoon() {
  if (topQueued) return;
  topQueued = true;
  (window.requestAnimationFrame || setTimeout)(() => {
    topQueued = false;
    renderTop();
  });
}
/** Loads a snapshot (used by Undo and Redo). */
function restore(x) {
  cur = x.s;
  epoch = x.e;
  project = normalizeProject(JSON.parse(cur));
  fileFollowsStory();
  if (!byId(selId)) selId = project.start;
  persistNow();
  renderAll();
  runCheck();
}
function undo() {
  if (!undoStack.length) return;
  const said = stepInfo(undoStack.length - 1); // what this undo takes back, worked out before the story changes
  redoStack.push(snap());
  if (said.pid) selId = said.pid;
  restore(popUndo());
  lastKey = '';
  afterTimeTravel(`Undid: ${said.text}.`, said.pid);
}
function redo() {
  if (!redoStack.length) return;
  const said = describeChange(cur, redoStack[redoStack.length - 1].s);
  pushUndo(snap());
  if (said.pid) selId = said.pid;
  restore(redoStack.pop());
  lastKey = '';
  afterTimeTravel(`Redid: ${said.text}.`, said.pid);
}
/** Goes back `k` steps in one move (the History list); Redo brings them back one by one. */
function undoMany(k) {
  k = Math.min(k, undoStack.length);
  if (k < 1) return;
  const said = stepInfo(undoStack.length - 1);
  let x;
  for (let i = 0; i < k; i++) {
    redoStack.push(snap());
    x = popUndo();
    cur = x.s;
    epoch = x.e;
  }
  if (said.pid) selId = said.pid;
  restore(x);
  lastKey = '';
  afterTimeTravel(`Went back ${k} step${k === 1 ? '' : 's'}. Redo brings them back.`, '');
}

/** Swaps in a whole new story (open file, new story, example). Undo can bring the old one back. */
function replaceProject(p, msg) {
  if (saveTimer) persistNow(); // the story being left is stored first, so the spare copy can hold exactly it
  pushUndo(snap());
  epoch = ++epochs;
  redoStack = [];
  project = p;
  cur = JSON.stringify(project);
  selId = project.start;
  view = 'write';
  lastKey = '';
  mapPick = null;
  persistNow(true);
  renderAll();
  runCheck();
  if (msg) toast(startFixNote ? `${msg}. ${startFixNote}` : msg);
  startFixNote = ''; // said once: the next New story or Example must not repeat it
}

/** After you change `project`: record it, then redraw everything, keeping the scroll position. */
function refresh(key) {
  /* A box that redraws the screen when its value is committed (a change event: leaving the box, pressing Enter) must not
     redraw before the browser has moved focus on, or the focus lands on nothing and the next keystrokes are lost. The story
     is committed now; only the redraw waits for that one turn. */
  const ev = typeof window !== 'undefined' ? window.event : null;
  if (ev && ev.type === 'change' && !redrawLater) {
    commit(key);
    redrawLater = true;
    setTimeout(() => {
      redrawLater = false;
      refreshNow();
    }, 0);
    return;
  }
  refreshNow(key);
}
let redrawLater = false;
/** Where the focused control sits (as child positions under its screen area), so it can be found again after a redraw. */
function focusMark() {
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  const root = a.closest('#main, #side, #itemside');
  if (!root || a === root) return null;
  const path = [];
  for (let n = a; n && n !== root; n = n.parentNode) path.unshift(Array.prototype.indexOf.call(n.parentNode.children, n));
  const text = a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|number|)$/.test(a.type));
  let from = null,
    to = null;
  if (text) {
    try {
      from = a.selectionStart;
      to = a.selectionEnd;
    } catch {
      /* some input types have no caret */
    }
  }
  return { root: root.id, path, tag: a.tagName, type: a.type, from, to };
}
/** Puts focus back where focusMark() found it, if the redraw left it nowhere and the same kind of control is there now. */
function focusBack(mk) {
  if (!mk) return;
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  let n = document.getElementById(mk.root);
  for (let i = 0; n && i < mk.path.length; i++) n = n.children[mk.path[i]];
  if (!n || n.tagName !== mk.tag || n.type !== mk.type || n.disabled) return;
  try {
    n.focus({ preventScroll: true });
    if (mk.from !== null && n.setSelectionRange) n.setSelectionRange(Math.min(mk.from, n.value.length), Math.min(mk.to, n.value.length));
  } catch {
    /* cannot take focus */
  }
}
function refreshNow(key) {
  let m = $('#main');
  const st = m ? m.scrollTop : 0;
  const mk = focusMark();
  commit(key);
  renderAll();
  m = $('#main');
  if (m) m.scrollTop = st;
  focusBack(mk);
}
