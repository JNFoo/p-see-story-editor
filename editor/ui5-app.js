/* ---------------------------------------------------------------------------
   3e. File menu, quick guide, top bar and start-up
   --------------------------------------------------------------------------- */

/* The two data blocks that sit in the page (see the <script type="..."> tags above). */
const GAME_PARTS = JSON.parse($('#game-parts').textContent); // the game's code and styles, one piece per optional feature (see build-game.mjs)
const STARTER = JSON.parse($('#starter-story').textContent); // the built-in example story, "The Keeper's Light"
const BUILT = '__BUILD_STAMP__'; // when build.py made this file (Eastern time): the version you are running

/* ----- file menu actions ----- */

/**
 * The pieces an exported game needs besides the story itself: its stylesheet, the typeface, and its code (the game
 * rules and the player, minified by build.py from the very functions the Play tab runs).
 */
function gameAssets() {
  return { parts: GAME_PARTS, fonts: $('#font-ui').textContent, fontsLite: $('#font-lite').textContent };
}

/**
 * Export: one click opens the system's Save window (or, in browsers without one, downloads the file).
 * Nothing is written until you choose; the message appears only after the file is really saved.
 */
let exporting = false;
async function quickExport() {
  if (exporting) return; // a double click must not start two saves
  exporting = true;
  try {
    const a = freshAnalysis();
    const html = await zipPage(buildGameHtml(project, gameAssets())); // the file is stored zipped: about half the size, opens by itself
    const name = `${slug(project.title)}.html`;
    const ok = await saveFile(name, html, 'text/html', 'Game (HTML)', 'games');
    if (!ok) return; // canceled in the Save window
    const n = a.problems.length;
    toast(
      n ? `Saved ${name} (${kb(html)}), but the checker found ${n} problem${n === 1 ? '' : 's'}.` : `Saved ${name} (${kb(html)}).`,
      'Show the code',
      exportGame
    );
  } catch (e) {
    logError('save game', e);
    info('The game could not be saved', [e?.message || String(e), 'Try again, or choose another folder.']);
  } finally {
    setTimeout(() => {
      exporting = false;
    }, 1500); // ignore the second click of a double click
  }
}
/** File -> Save manuscript: the story's words as one Markdown file (storyManuscript in core.js). */
async function exportManuscript() {
  const name = `${slug(project.title)}-manuscript.md`;
  try {
    const ok = await saveFile(name, storyManuscript(project), 'text/markdown', 'Manuscript (Markdown)', 'manuscripts');
    if (ok) toast(`Saved ${name}.`);
  } catch (e) {
    logError('save manuscript', e);
    info('The manuscript could not be saved', [e?.message || String(e), 'Try again, or choose another folder.']);
  }
}
/** File -> Save test script: tick-box routes that take every choice once (storyTestScript in core.js). */
async function exportTestScript() {
  const text = storyTestScript(project, freshAnalysis());
  if (!text) {
    toast('This story is too large to check completely, so the editor cannot work out a complete test script.');
    return;
  }
  const name = `${slug(project.title)}-test-script.md`;
  try {
    const ok = await saveFile(name, text, 'text/markdown', 'Test script (Markdown)', 'manuscripts');
    if (ok) toast(`Saved ${name}.`);
  } catch (e) {
    logError('save test script', e);
    info('The test script could not be saved', [e?.message || String(e), 'Try again, or choose another folder.']);
  }
}
/**
 * The switch for this story's games: embed Inter Tight (the same look everywhere) or use the device's own font
 * (about 17 KB smaller). Saved with the story. `after` runs once it has changed.
 */
function fontSwitch(after) {
  const box = h('input', {
    type: 'checkbox',
    checked: project.gameFont === 'system' ? true : null,
    onchange(e) {
      if (e.target.checked) project.gameFont = 'system';
      else delete project.gameFont;
      refresh();
      toast(
        e.target.checked
          ? 'Games from this story now use the system font: about 17 KB smaller.'
          : 'Games from this story now carry Inter Tight, so they look the same everywhere.'
      );
      after?.();
    }
  });
  return h(
    'label',
    {
      class: 'check',
      title:
        'Inter Tight looks the same on every device. The system font (San Francisco on Apple, Segoe on Windows, Roboto on Android) is already on the device, so it costs nothing to carry.'
    },
    [box, ' Use system font in this story’s games (about 17 KB smaller)']
  );
}
/** "23 KB": a file size people can read. */
function kb(text) {
  const n = new Blob([text]).size;
  return n < 1024 ? `${n} bytes` : `${Math.round(n / 1024)} KB`;
}

/** What each Back rule means, in plain words (keys are BACK_MODES in PART 1). */
const BACK_TEXT = {
  off: 'No Back button',
  remember: 'Back button; going forward again repeats the same dice',
  reroll: 'Back button; dice are rolled again',
  block: 'Back button, but never back past a dice roll'
};
/**
 * The options on the Game tab (shown only while the Game switch in Options → Advanced is on). Everything here is saved
 * with the story as project.game. `after(key)` is called once a choice is kept (the tab redraws its live preview).
 * `preview(k)` is called with a palette key while the author hovers over or moves through the color choices, and with
 * null when they stop, so the preview can show each one before it is kept.
 */
function gameOptions(after, preview) {
  const g = project.game;
  const set = (key, value) => {
    g[key] = value;
    commit('game');
    after(key);
  };
  const check = (key, label, tip) =>
    h('label', { class: 'check', title: tip }, [
      h('input', { type: 'checkbox', checked: g[key] ? true : null, onchange: e => set(key, e.target.checked) }),
      ` ${label}`
    ]);
  const sel = h(
    'select',
    { class: 'in', 'aria-label': 'Back button rule', onchange: e => set('back', e.target.value) },
    BACK_MODES.map(k => h('option', { value: k, text: BACK_TEXT[k], selected: g.back === k ? true : null }))
  );
  const swatches = PALETTE_KEYS.map(k => {
    const pl = PALETTES[k];
    const c = pl.light || pl.dark;
    return h(
      'button',
      {
        type: 'button',
        class: `palbtn${g.pal === k ? ' on' : ''}`,
        title: `${pl.name}: ${pl.note}`,
        'aria-label': `${pl.name}. ${pl.note}`,
        'aria-pressed': g.pal === k ? 'true' : 'false',
        style: `background:${c.paper};color:${c.fg};border-color:${c.line}`,
        'data-pal': k,
        onclick: () => set('pal', k),
        onmouseenter: () => preview && preview(k),
        onmouseleave: () => preview && preview(null),
        onfocus: () => preview && preview(k),
        onblur: () => preview && preview(null),
        onkeydown: e => {
          /* arrow keys move from one color to the next (and the preview follows the focus); Enter or Space keeps it */
          const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
          if (!d) return;
          e.preventDefault();
          const all = [...e.currentTarget.parentNode.querySelectorAll('.palbtn')];
          all[(all.indexOf(e.currentTarget) + d + all.length) % all.length].focus();
        }
      },
      [h('span', { class: 'sw-dot', style: `background:${c.lamp}` }), pl.name]
    );
  });
  /* every row comes from the GAME_OPTIONS table (core.js); the two that are not check boxes are drawn here */
  const rows = GAME_OPTIONS.map(o => {
    if (o.kind === 'flag') return check(o.key, o.label, o.hint);
    if (o.key === 'back') return h('label', { class: 'field' }, [h('span', { text: 'Back button' }), sel]);
    if (o.key === 'pal') return h('div', { class: 'field' }, [h('span', { text: 'Colors' }), h('div', { class: 'palbtns' }, swatches)]);
    throw new Error(`gameOptions() cannot draw the option “${o.key}”: add it to the code above`);
  });
  return h('div', { class: 'gameopts' }, [
    h('h4', { text: 'Options' }),
    h('div', { class: 'hint', text: 'These are saved with the story. The defaults suit most games.' }),
    ...rows
  ]);
}
/** Export dialog: the game as a download or as code to copy. */
async function exportGame() {
  const a = analyze(project);
  const html = buildGameHtml(project, gameAssets()); // the readable page: shown and copied as code
  const file = await zipPage(html); // the file that is downloaded: the same page, zipped (about half the size; it unzips itself when opened)
  const name = `${slug(project.title)}.html`;
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Your game is ready' }));
    if (a.problems.length)
      d.appendChild(
        h('div', {
          class: 'banner bad',
          text: `The checker found ${a.problems.length} problem${a.problems.length === 1 ? '' : 's'}. You can still export, but players may get stuck.`
        })
      );
    d.appendChild(
      h('div', {
        text: `This is one file named ${name} (${kb(file)}). Anyone can open it in a web browser, and you can put it on any website. It works offline and never contacts the internet.`
      })
    );
    d.appendChild(
      fontSwitch(() => {
        close();
        exportGame();
      })
    );
    const ta = h('textarea', { class: 'in mono', readonly: true, rows: 4, 'aria-label': 'Game code', value: html });
    d.appendChild(
      h('div', { class: 'row' }, [
        h('button', {
          class: 'btn primary',
          type: 'button',
          text: `Download ${name}`,
          onclick: function () {
            download(name, file, 'text/html');
          }
        }),
        h('button', {
          class: 'btn',
          type: 'button',
          text: 'Copy the code instead',
          onclick: function () {
            copyText(html, ta);
          }
        }),
        h('button', { class: 'btn', type: 'button', text: 'Close', onclick: close })
      ])
    );
    d.appendChild(h('details', {}, [h('summary', { text: 'Show the code (the readable page)' }), ta]));
  });
}
/** Downloads the story as a .story.json backup (the only way to move it between browsers or devices). */
/* ----- the story file you are working on -----
   Where the browser allows it (Chrome and Edge on a computer), the editor remembers the .story.json file you last
   saved or opened, so Save writes straight to it with no window. Elsewhere, Save downloads a copy each time. */
let storyFile = null; // that file's handle, or null
let savedText = null; // the story as it was last saved there, to show whether there are unsaved changes
let storyFileFor = ''; // the id of the story that file holds (to reconnect after a reload)
let storyFileEpoch = -1; // the stretch of undo history (see epoch in 3a) that belongs to that file

/** Called after Undo or Redo: a remembered file belongs to one story, so another story must not be saved into it. */
function fileFollowsStory() {
  if (storyFile && (storyFileEpoch !== epoch || storyFileFor !== project.id)) {
    storyFile = null;
    savedText = null;
    storyFileFor = '';
    kvSet('file', null);
  }
}

/** A short fingerprint of a story's text, kept with the file record so a reload can tell whether the file still matches the work. */
function sigOf(t) {
  let x = 0;
  for (let i = 0; i < t.length; i++) x = (x * 31 + t.charCodeAt(i)) | 0;
  return `${t.length}:${x}`;
}
function keepFileRecord() {
  kvSet('file', storyFile ? { handle: storyFile, story: project.id, sig: savedText == null ? '' : sigOf(savedText) } : null);
}
function rememberFile(handle, at) {
  storyFile = handle?.createWritable ? handle : null;
  savedText = at === undefined ? cur : at;
  storyFileFor = storyFile ? project.id : '';
  storyFileEpoch = epoch;
  keepFileRecord();
  renderTop();
}
let revSeen = 0; // the highest revision this session has written (Undo can bring an older story back, but the counter never goes down)
/** The next revision number and time, and the story text with them in it (what Save writes to the file). */
function stampNext() {
  const s = { rev: Math.max(project.rev || 0, revSeen) + 1, savedAt: new Date().toISOString() };
  const both = { ...project, ...s };
  return { s, compact: JSON.stringify(both), text: JSON.stringify(both, null, 1) };
}
/** After the file was written: the revision becomes part of the story (no undo step). Returns the text that is now saved in the file. */
function applyStamp(st, at) {
  revSeen = st.s.rev;
  const same = cur === at; // false when the person kept typing while the file was being written: those edits stay unsaved
  Object.assign(project, st.s);
  cur = JSON.stringify(project);
  persistSoon();
  return same ? cur : st.compact;
}
/* ----- Options → Safety: where the story is kept, and a gentle reminder to keep a copy in a file -----
   The autosave lives in this browser, which can clear it (low space, "clear site data", a private window). A file is the real copy.
   Reminder: once a story has some words in it and its last file save (or, if it never had one, the first day this browser saw it) is a week
   old, one toast offers Save now; at most once a day. The record is kept even when "Remember preferences" is off. */
const NUDGE_AFTER = 7 * 864e5;
const NUDGE_EVERY = 864e5;
const NUDGE_KEY = `${STORE}-nudge`;
const storyWords = () => project.passages.reduce((n, p) => n + wordsOnPage(p), 0);
function agoText(ms) {
  const m = Math.floor(ms / 6e4);
  if (m < 2) return 'just now';
  if (m < 120) return `${m} minutes ago`;
  const hrs = Math.floor(m / 60);
  if (hrs < 48) return `${hrs} hours ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}
/** The saved-to-a-file line of the Safety box (also used by the reminder): when, which revision, and whether there are newer edits. */
function fileSaveLine() {
  const at = project.savedAt ? Date.parse(project.savedAt) : NaN;
  if (!Number.isFinite(at)) return 'This story has not been saved to a file from this editor yet.';
  const when = new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  return `Last saved to a file ${agoText(Date.now() - at)} (${when}), revision ${project.rev || 1}. ${savedText === cur ? 'Nothing has changed since.' : 'There are changes since that are only in this browser.'}`;
}
function showSafety() {
  const lines = h('div', { class: 'safety' });
  const row = (label, text) => {
    const p = h('p', {}, [h('b', { text: label + ' ' }), document.createTextNode(text)]);
    lines.appendChild(p);
    return p;
  };
  row('This browser:', storageOk ? 'your story is autosaved here after every change.' : 'it refuses to keep anything (a private window or blocked site data), so nothing is autosaved. Save to a file.');
  row('A file:', fileSaveLine());
  const keep = row('Kept for good:', 'checking…');
  const space = row('Space:', 'checking…');
  const persistBtn = h('button', { class: 'btn', type: 'button', text: 'Ask the browser to keep it', hidden: true });
  const st = navigator.storage;
  if (st?.persisted) {
    const show = p => {
      keep.lastChild.textContent = p ? 'yes, the browser has promised not to clear the autosave when space runs low.' : 'not promised. The browser may clear the autosave when space runs low, or when you clear site data.';
      persistBtn.hidden = !!p || !st.persist;
    };
    st.persisted().then(show, () => (keep.lastChild.textContent = 'this browser cannot say.'));
    persistBtn.addEventListener('click', () => {
      st.persist().then(
        ok => {
          show(ok);
          toast(ok ? 'The browser will keep the autosave.' : 'The browser did not agree. Saving a file is the safe way.');
        },
        () => toast('The browser would not say yes. Saving a file is the safe way.')
      );
    });
  } else keep.lastChild.textContent = 'this browser cannot say.';
  if (st?.estimate)
    st.estimate().then(
      e => (space.lastChild.textContent = `about ${Math.max(1, Math.round((e.usage || 0) / 1024))} KB used here, of about ${Math.round((e.quota || 0) / 1048576)} MB the browser allows.`),
      () => (space.lastChild.textContent = 'this browser cannot say.')
    );
  else space.lastChild.textContent = 'this browser cannot say.';
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Safety' }));
    d.appendChild(h('div', { class: 'hint', text: 'Your story is autosaved in this browser, but a file is the copy you can trust. File → Save puts one wherever you choose.' }));
    d.appendChild(lines);
    d.appendChild(
      h('div', { class: 'row end' }, [
        persistBtn,
        h('button', { class: 'btn primary', type: 'button', text: 'Save now', onclick: () => { close(); saveStory(); } }),
        h('button', { class: 'btn', type: 'button', text: 'Close', onclick: close })
      ])
    );
  });
}
/** The once-a-day reminder (see above). Runs a moment after start-up, so it never competes with the start-up notes. */
function maybeNudge() {
  if (!storageOk || storyWords() < 50) return;
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(NUDGE_KEY) || 'null'); } catch { rec = null; }
  const now = Date.now();
  if (!rec || rec.id !== project.id) rec = { id: project.id, first: now, last: 0 };
  const savedAt = project.savedAt ? Date.parse(project.savedAt) : NaN;
  const since = Number.isFinite(savedAt) ? savedAt : rec.first;
  const due = now - since >= NUDGE_AFTER && now - rec.last >= NUDGE_EVERY;
  if (due) rec.last = now;
  try { localStorage.setItem(NUDGE_KEY, JSON.stringify(rec)); } catch { /* storage refused: no reminder state, no reminder */ }
  if (due) toast(`This story has not been saved to a file for ${Math.floor((now - since) / 864e5)} days. A file is your safe copy.`, 'Save now', saveStory);
}
let saving = false; // a Save or Save as is still under way (a second press of Ctrl+S must not start another)
/** Save: straight to the remembered file; the first time (or if that fails), asks where. */
function saveStory() {
  if (saving) return;
  if (!storyFile) {
    saveStoryAs();
    return;
  }
  saving = true;
  const sf = storyFile;
  const at = cur; // what is being written: edits made while the write is under way stay unsaved
  const st = stampNext();
  const text = st.text;
  const ep = epoch;
  canWrite(sf)
    .then(ok => {
      if (!ok) throw new Error('no permission');
      return writeTo(sf, text, 'application/json');
    })
    .then(
      () => {
        saving = false;
        if (storyFile === sf) {
          savedText = epoch === ep ? applyStamp(st, at) : at;
          keepFileRecord();
          renderTop();
        }
        toast(`Saved to ${sf.name} (revision ${st.s.rev}).`);
      },
      () => {
        saving = false;
        saveStoryAs();
      }
    ); // moved, deleted or refused: choose again
}
/** Save as: always asks where (in the folder last used for stories), then remembers that file. */
async function saveStoryAs() {
  if (saving) return;
  saving = true;
  const at = cur;
  const st = stampNext();
  const text = st.text;
  const ep = epoch;
  const name = `${slug(project.title)}.story.json`;
  let r;
  try {
    r = await saveFile(name, text, 'application/json', 'Story', 'stories');
  } catch (e) {
    saving = false;
    logError('save story', e);
    info('Your story could not be saved', [e?.message || String(e), 'Try again, or choose another folder.']);
    return;
  }
  saving = false;
  if (!r) return;
  const saved = epoch === ep ? applyStamp(st, at) : at;
  if (r !== true) rememberFile(r, saved);
  else {
    savedText = saved;
    renderTop();
  }
  toast(
    r === true
      ? `Downloaded ${name}. Keep it somewhere safe; File → Open a story loads it again.`
      : `Saved to ${r.name || name}. Save now writes straight to this file.`,
    'Copy as text',
    () => {
      copyText(text);
    }
  );
}
/** Lets the person pick a file: a .story.json backup ('json') or an old text-format story ('old'). */
function openFile(kind) {
  if (kind === 'json' && window.showOpenFilePicker && window.self === window.top) {
    // remembers the file, so Save can write back to it
    window.showOpenFilePicker({ id: 'stories', types: [{ description: 'Story', accept: { 'application/json': ['.json'] } }] }).then(
      hs =>
        hs[0].getFile().then(f => {
          if (f.size > 20e6) {
            info('That file is too large', ['Story files are normally well under 1 MB.']);
            return;
          }
          return f.text().then(t => {
            loadText(t, f.name, hs[0]);
          });
        }),
      () => {
        /* canceled */
      }
    );
    return;
  }
  readPicked(kind === 'old' ? '.html,.htm,.txt,.md' : '.json,.html,.htm,.txt', (text, name) => loadText(text, name));
}
/** Lets the person pick one file (up to 20 MB) and hands its text to `then(text, fileName)`. */
function readPicked(accept, then) {
  const inp = h('input', { type: 'file', accept, class: 'hidden' });
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    inp.remove();
    if (!f) return;
    if (f.size > 20e6) {
      info('That file is too large', ['Story files are normally well under 1 MB.']);
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      then(String(r.result), f.name);
    };
    r.readAsText(f);
  });
  inp.addEventListener('cancel', () => inp.remove()); // the person closed the window without choosing
  document.body.appendChild(inp);
  inp.click();
}
/** Reads file text as a story (JSON backup or old format) after confirming the replacement. */
function loadText(text, name, handle) {
  ask('Replace your current story?', `Opening “${name}” replaces what you see now. You can still undo it.`, 'Open it').then(ok => {
    if (!ok) return;
    try {
      if (/^\s*\{/.test(text)) {
        replaceProject(normalizeProject(JSON.parse(text)), `Opened ${name}`);
        noteAdvanced(adviseAdvanced(project));
        rememberFile(handle || null);
      } else {
        const res = parseLegacy(text);
        replaceProject(res.project, `Imported ${name}`);
        rememberFile(null); // a new document: Save must ask where, never reuse the last file
        savedText = null;
        renderTop();
        info(`Imported ${res.project.passages.length} pages`, res.notes.length ? res.notes : ['Everything was converted.']);
      }
    } catch (e) {
      logError('open file', e);
      info('That file could not be opened', [e.message || String(e)]);
    }
  });
}
/** File → Import Twine…: pick a Twine story file (Twine 2 HTML, Twee, Twine 1), choose how to treat its code, and replace the current story with it. */
function importTwineFile() {
  readPicked('.html,.htm,.twee,.tw,.txt', (text, name) => {
    let found;
    try {
      found = twineRead(text);
    } catch (e) {
      info('That is not a Twine story', [e.message || String(e)]);
      return;
    }
    twineChoose(text, name, found);
  });
}
function twineChoose(text, name, found) {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Import a Twine story' }));
    const box = h('div');
    d.appendChild(box);
    const row = (title, blurb, fn) => h('button', { class: 'startrow', type: 'button', onclick: fn }, [h('strong', { text: title }), h('span', { class: 'hint', text: blurb })]);
    const cancel = () => h('div', { class: 'row end' }, [h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close })]);
    const chooseCode = i => {
      const st = found.stories[i];
      box.replaceChildren(
        h('div', { class: 'hint', text: `“${st.name || 'Untitled story'}” from ${name}: ${st.passages.length} passages (${found.kind}). Your current story is replaced; you can undo this. Every [[link]] becomes a choice. What should happen to the story’s own code, such as <<set $gold to 5>> or (if: $key)[...]?` }),
        row('Keep the code as text', 'Edit it here as words. Pages that hold code are marked unfinished so you can find them.', () => run(i, 'text')),
        row('Convert the code to rules', 'Turn variables, if / else and links that set things into flags, numbers, conditions and choices. Anything that cannot be turned into rules stays as flagged text.', () => run(i, 'rules')),
        cancel()
      );
    };
    const run = (i, code) => {
      close();
      let res;
      try {
        res = importTwine(text, { story: i, code });
      } catch (e) {
        logError('import twine', e);
        info('That story could not be imported', [e.message || String(e)]);
        return;
      }
      replaceProject(res.project, `Imported “${res.project.title}” from Twine`);
      noteAdvanced(adviseAdvanced(project));
      rememberFile(null); // a new document: Save must ask where
      savedText = null;
      renderTop();
      info(`Imported ${res.project.passages.length} pages from Twine`, res.report, dlg => {
        dlg.appendChild(h('div', { class: 'row' }, [h('button', { class: 'btn', type: 'button', text: 'Copy this report', onclick: () => copyText(res.report.join('\n')) })]));
      });
    };
    if (found.stories.length > 1) {
      box.appendChild(h('div', { class: 'hint', text: `${name} holds ${found.stories.length} stories. Which one?` }));
      found.stories.forEach((st, i) => box.appendChild(row(st.name || 'Untitled story', `${st.passages.length} passages`, () => chooseCode(i))));
      box.appendChild(cancel());
    } else chooseCode(0);
  });
}
/** File → New story: a blank page, or one of the starting points (small working stories to reshape). */
function newStory() {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Start a new story' }));
    d.appendChild(
      h('div', {
        class: 'hint',
        text: 'Your current story is replaced. You can undo this, but save a backup first if you want to keep it. A starting point is a tiny story with the right shape: change the words and add more.'
      })
    );
    const begin = (make, msg) => {
      close();
      replaceProject(make(), msg);
      rememberFile(null);
      savedText = null;
      renderTop();
    };
    const row = (title, blurb, make) =>
      h(
        'button',
        { class: 'startrow', type: 'button', onclick: () => begin(make, `New story started${title === 'Blank story' ? '.' : `: ${title}.`}`) },
        [h('strong', { text: title }), h('span', { class: 'hint', text: blurb })]
      );
    d.appendChild(row('Blank story', 'One empty page. Start from scratch.', () => makeProject('Untitled story')));
    d.appendChild(h('div', { class: 'hint', text: 'Or start from a shape:' }));
    STARTERS.forEach(st =>
      d.appendChild(
        row(st.name, st.blurb, () => {
          const p = st.make();
          p.id = uid('s_');
          return p;
        })
      )
    );
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close })]));
  });
}
/**
 * A new copy of the example story with its own id. The id names the place a game keeps the player's progress,
 * so two games made from the example must not share one.
 */
function freshExample() {
  const p = normalizeProject(structuredClone(STARTER));
  p.id = uid('s_');
  return p;
}
function loadExample() {
  ask('Load the example story?', 'This replaces your current story with “The Keeper’s Light”. You can undo this.', 'Load example').then(ok => {
    if (ok) {
      replaceProject(freshExample(), 'Example loaded.');
      rememberFile(null);
      savedText = null;
      renderTop();
    }
  });
}
/** Flips between light and dark, overriding the device setting. */
/** Sets light or dark, and remembers the choice in this browser. Light is the default. */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  savePref(`${STORE}-theme`, t === 'dark' ? 'dark' : 'light');
}
/** Shows the editor in Inter Tight, or in the device's own font. */
function applyEditorFont() {
  document.documentElement.toggleAttribute('data-sysfont', prefs.editorFont === 'system');
}
const WSIZE_NAMES = { s: 'Small', m: 'Medium', l: 'Large', x: 'Extra large' };
/** The size of the words in the Write tab's boxes (Options). Only the writing boxes change, not the menus. */
function applyTextSize() {
  const b = document.body;
  ['s', 'm', 'l', 'x'].forEach(k => b.classList.toggle(`wsize-${k}`, prefs.wsize === k && k !== 'm'));
}
function cycleTextSize() {
  const order = ['s', 'm', 'l', 'x'];
  prefs.wsize = order[(order.indexOf(prefs.wsize) + 1) % order.length];
  savePrefs();
  applyTextSize();
  toast(`Writing text size: ${WSIZE_NAMES[prefs.wsize]}.`);
}
function toggleQuotes() {
  prefs.quotes = !prefs.quotes;
  savePrefs();
  toast(prefs.quotes ? 'Smart quotes on: typing " and \' makes curly quotes, and two hyphens make a dash.' : 'Smart quotes off.');
}
/** Turns straight quotes and double hyphens into curly quotes and dashes as they are typed (when the Option is on). */
function smartTyping(e) {
  if (!prefs.quotes || e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return;
  const t = e.target;
  if (!t || !t.closest || !t.closest('#main') || !(t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t.classList.contains('clabel') || t.id === 'pheading')))) return;
  const pos = t.selectionStart;
  if (pos !== t.selectionEnd || pos < 1) return;
  const prev = pos > 1 ? t.value[pos - 2] : '';
  const opens = !prev || /[\s([{\u2014\u2013\u201C\u2018-]/.test(prev);
  let rep = '';
  let from = pos - 1;
  if (e.data === '"') rep = opens ? '\u201C' : '\u201D';
  else if (e.data === "'") rep = opens ? '\u2018' : '\u2019';
  else if (e.data === '-' && prev === '-') {
    rep = '\u2014';
    from = pos - 2;
  } else return;
  t.setRangeText(rep, from, pos, 'end');
}
document.addEventListener('input', smartTyping, true);

/** Marks the middle area "wide" when there is room to set the text and the choices side by side. */
let mainWide = false; // kept here because drawing the screen resets the class list of #main
function watchWidth() {
  const m = $('#main');
  if (!m || typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => {
    mainWide = m.clientWidth >= 1100;
    m.classList.toggle('wide', mainWide);
  }).observe(m);
}

function toggleEditorFont() {
  prefs.editorFont = prefs.editorFont === 'system' ? 'ui' : 'system';
  applyEditorFont();
  savePref(`${STORE}-prefs`, JSON.stringify(prefs));
  toast(prefs.editorFont === 'system' ? 'The editor now uses the system font.' : 'The editor now uses Inter Tight.');
}
/** Games from this story: carry Inter Tight, or use the player's device font (about 17 KB smaller). */
function toggleGameFont() {
  if (project.gameFont === 'system') delete project.gameFont;
  else project.gameFont = 'system';
  refresh();
  toast(
    project.gameFont === 'system'
      ? 'Games from this story now use the system font: about 17 KB smaller.'
      : 'Games from this story now carry Inter Tight, so they look the same everywhere.'
  );
}
/** Turns remembering preferences on (saving the current ones) or off (forgetting the saved ones). */
function toggleRemember() {
  settings.remember = !settings.remember;
  saveSettings();
  if (settings.remember) {
    savePref(`${STORE}-theme`, document.documentElement.getAttribute('data-theme') || 'light');
    savePref(`${STORE}-prefs`, JSON.stringify(prefs));
    saveMapOpts();
    toast('Your preferences will be remembered in this browser.');
  } else {
    PREF_KEYS.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {
        /* storage off */
      }
    });
    toast('Preferences are no longer remembered. The Advanced choices are still kept.');
  }
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/** The keyboard shortcuts, shown from Options and from the quick guide. */
function showShortcuts() {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
  function row(keys, what) {
    return [
      h(
        'dt',
        {},
        keys.map((k, i) => [i ? ' ' : null, h('kbd', { text: k })]).reduce((a, b) => a.concat(b), [])
      ),
      h('dd', { text: what })
    ];
  }
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Keyboard shortcuts' }));
    d.appendChild(
      h(
        'dl',
        { class: 'keys' },
        [].concat(
          row([mod, 'S'], 'Save the story to its file (the first time, choose where)'),
          row([mod, 'K'], 'Go to a page: type part of its name, Enter opens it (or makes it, if it does not exist yet: Ctrl+Enter)'),
          row([mod, 'Shift', 'F'], 'Find and replace in all the words of the story'),
          row([mod, 'Shift', 'Enter'], 'In a paragraph: split the page at the cursor. The rest of the words and the choices move to a new page'),
          row(['Alt', '↑ ↓'], 'In a choice or paragraph box: move it up or down (the ⋮⋮ grip does the same with the mouse)'),
          row([mod, 'Z'], 'Undo (outside a text box; inside one, the box undoes your typing)'),
          row([mod, 'Y'], `Redo (also ${mod} Shift Z)`),
          row(['Enter'], 'In a choice: add the next choice. In a dialog: OK.'),
          row([mod, 'Enter'], 'In a choice: go to the page it leads to, creating it if needed'),
          row(['Esc'], 'Close a dialog, a menu or a side list; in the map search, clear it'),
          row(['Enter'], 'In the map search: jump to the first match'),
          row([mod, 'wheel'], 'On the map: zoom in and out'),
          row(['Tab'], 'Move between controls; Enter or Space opens a focused page on the map'),
          row(['Shift', 'F10'], 'Open the right-click menu for the focused page (or the Menu key)'),
          row(['↑', '↓', '←', '→'], 'Move around an open menu and its submenus')
        )
      )
    );
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Close', onclick: close })]));
  });
}

/* ----- quick guide ----- */

function showGuide() {
  let first = true;
  /** A guide line: {name} stands for that icon, drawn as it appears in the editor. */
  function line(text) {
    const li = h('li');
    text.split(/\{(\w+)\}/).forEach((part, i) => {
      if (!(i % 2)) {
        if (part) li.appendChild(document.createTextNode(part));
        return;
      }
      const ic = part === 'items' ? itemsTabIcon(15) : icon(part, 15);
      ic.classList.add('gico');
      li.appendChild(ic);
    });
    return li;
  }
  /** One section of the guide, folded except the first, so the whole guide can be scanned at a glance. */
  function sec(title, lines) {
    const d = h('details', { class: 'gsec', open: first || null }, [h('summary', { text: title }), h('ul', {}, lines.map(line))]);
    first = false;
    return [d];
  }
  dialog((d, close) => {
    d.classList.add('guide');
    d.appendChild(h('h3', { text: 'Quick guide' }));
    d.appendChild(h('div', { class: 'hint', text: `Version ${BUILT} (year.month.day.time, 24-hour, US Eastern)` }));
    []
      .concat(
        sec('How a story works', [
          'A story is a set of pages. Each page has some text and choices. A choice is a button that leads to another page.',
          'An ending is a page that stops the story: a good ending {smile}, a bad ending {frown} or a plain one. The checkered flag {flag} marks the first page, which can never be an ending.',
          'New here? Options → Take the tour shows the main areas and the usual order of work: write, link, Check, Play, Export.',
          'Tabs: {pen} Write to build pages, {mapi} Map to see the shape, {items} Items for objects and states, Check to find problems, {play} Play to try it, then Export game.'
        ]),
        sec('The Write tab, top to bottom', [
          'Getting around: Ctrl+K (or Go to… above the page list) jumps to any page by typing part of its name. Choosing where a choice leads works the same way: click the page name on the choice, type, press Enter. Go › opens that page and ‹ › at the top step back and forward through the pages you have been on. “From” shows which pages lead to this one. The panel buttons at the top of each side list hide it to give the writing more room.',
          'Quicker writing: click an item in the right-hand list to put it in the open page’s Gets box, Shift+click for Loses. Paste a scene whose choice lines start with -, • or > and they become choices. Ctrl+Shift+Enter in a paragraph splits the page at the cursor. Drag the ⋮⋮ grip to reorder choices and paragraphs (or press Alt+↑ or Alt+↓ inside one). “Next to write” opens the next empty page. Options holds smart quotes and the writing text size.',
          'Find (Ctrl+Shift+F, or Find… above the page list) searches every page name, heading, paragraph, choice and “why locked” text, with Match case and Whole words. Go jumps to a match; Replace changes one; Replace all (N) changes them all and Undo puts them back. The bookmark button on a page marks it unfinished; unfinished pages are listed on the Check tab.',
          'The page name (only you see it) and an optional big heading, then the flag {flag} to make it the first page, {play} to play from here, and ⋯ for more.',
          'Next, on one line when there is room: the page type (page, ending, good ending, bad ending) and two boxes for what happens when the player arrives: Gets and Loses. Their colors are not wins or losses; losing an item is not a losing ending.',
          'Then Text and Choices. The + buttons add a paragraph, an alternative text or a choice. In a choice, Enter starts the next one; Ctrl+Enter (Cmd+Enter on a Mac) jumps to the page it leads to, making it if needed.',
          'Each choice has “if”: show it only when the player has, or lacks, something. With Write’s advanced features on, it also has {items}: picking it gives or takes an object or state on the spot, without a new page.',
          'Anything the checker finds on this page is listed under the page name. The strip at the bottom shows which pages lead here.'
        ]),
        sec('Fewest clicks', [
          'Drag a page from the left list onto a choice to link it, or anywhere in Choices to add a choice that leads there.',
          'Drag a page onto “Reached from” to make that page lead here (a new choice with no words yet; the checker reminds you).',
          'Drag an item from the right list onto a paragraph or choice to show it only when the player has it, or into Gets or Loses.',
          'Right-click a page, in the list or on the map, for quick actions; on a phone or tablet press and hold. “+ New page…” and “New object…” in any menu make one on the spot.'
        ]),
        sec('Objects and states', [
          'An object {gift} is something the player carries or can hand over: a key, a wallet, a lantern. A state {heart} is something the player is: sick, brave, exhausted.',
          'Both can show or hide text and choices (the “if” button), and be gained or lost on a page (Gets, Loses) or, with Write’s advanced features on, on a choice ({items}). (Hands over, which remembered where an object went, is hidden for now; stories that use it still work.)',
          'The Items tab lists each on a line: rename it, switch its kind, and choose whether the player sees it (Show). New ones are shown, on the “Carrying” or “Feeling” line; switch Show off for secret ones, which still work.',
          'A choice can lead back to its own page (“stay on this page”) and give something, such as “Grab the spare keys”; add the key under “Not if” so the choice disappears once taken.'
        ]),
        sec('Numbers, dice checks and locked choices', [
          'A number {meter} is a score the player has: Courage, Money, Trust. Add one on the Items tab with “+ New number”; you choose its lowest and highest value and what it starts at. Players see it as a bar (switch Show off to keep it secret).',
          'Pages and choices can add to or subtract from a number (“± Numbers”). A choice or paragraph can need a number: “Courage 5 or more” appears among the “if” choices, and you can type the 5.',
          'A dice check {dice} makes a choice a gamble: the game rolls 2 dice, adds the chosen number, and compares it with your target. If it falls short, the player goes to the page you pick for failing, so a failed roll still moves the story forward. The line under the choice shows the odds.',
          'A locked choice: on a choice with an “if”, tick “Show greyed out” and the player sees it, dimmed, with your reason (“You need a key”). Without it, the choice stays hidden until it applies.',
          'The checker counts every number, roll and locked choice: it tells you about checks that can never fail or never pass, and about thresholds the player can never reach.'
        ]),
        sec('Givens: who the player is', [
          'A Given {givens} is a question the player answers before page one, such as “Who are you?” with Man, Woman and They. Add one on the Items tab with “+ New Given”.',
          'Each answer is a state that never changes. Use it like any state: drag it onto a paragraph or choice, or pick it in an “Only if” box. Write two paragraphs (“Only if Woman”, then “Otherwise”) for text that differs.',
          'On the Items tab, “Shown as…” gives an item another name for some players: the wallet becomes a purse for players who answered Woman.',
          'On the Play tab you can answer the Givens once for testing, or be asked each time. Every ending’s recap starts with the answers.'
        ]),
        sec('Simple or advanced', [
          'Options → Advanced turns each tab’s advanced features on or off. With all four off, the editor shows only the essentials: pages, choices, objects and states, and a simple map.',
          'Write: choices that give or take an object or state the moment they are picked ({items} on each choice).',
          'Items: Givens {givens}, the questions a player answers before page one, and “Shown as” names.',
          'Items: also Numbers {meter} (health, courage, money) and the dice checks that use them. Game: adds a Game tab, between Check and Play, for reader options in exported games (Back button rules, endings found, a Place code, the Aa button, odds, colors) with a live preview of your own story; the tab shows while the switch is on.',
          'Map: the Choke-point spine, Given lanes, Story shape, River of players and Arc views; coloring by ending odds, playtest heat or one item; drawing the map for one Given answer; and Playtest results. Flow, Top-down tree and Matrix are always there.',
          'Turning a feature off only hides it: a story that already uses it keeps working, and the Check tab says so under Good to know. Until you choose for yourself, opening a story that uses an advanced feature turns it on. Your Advanced choices are always kept in this browser.'
        ]),
        sec('The Map: views', [
          'Flow: left to right, one column per choice from the start. Top-down tree: the same, falling down the page.',
          '(Advanced) Choke-point spine: the pages every route to the goal must pass through sit on one bold line, with branches above and below.',
          '(Advanced) Given lanes: one band per Given answer, so each kind of player’s road shows side by side; pages every player can reach are in the middle band.',
          '(Advanced) Story shape: your story squeezed to its backbone. Circles are pages every player passes through; each capsule between two of them is a stretch of story, its pages shown as dots (green and red for good and bad endings), labeled with how it is built (a straight road, branch and rejoin, endings off it, a loop). Click a capsule to see its pages in Flow, or a dot to edit that page.',
          '(Advanced) River of players: simulated players pour through the story; the wider a band, the more of them take that choice. Click a band to follow just those players to how they ended, or a page to trace everyone who saw it (where they came from, where they went). The panel on the right gives the numbers; Esc clears. Choose how many players there are and how they pick (at random, always the first choice, or exploring new pages), and use “As:” to watch only players with one Given answer.',
          '(Advanced) Arc diagram: every page on one line in reading order; choices are arcs above it. Long jumps and loops stand out.',
          'Matrix: read across a row; a square in a column means that row’s page leads to that column’s page (a number: several choices). Squares right of the diagonal go forward, red ones go back, and blocks near the diagonal are pages that link to each other. Click a square to change its choice.'
        ]),
        sec('The Map: tools', [
          'Pages that simply follow one another (one way in, one way out) fold into one box. Click it to open it; an opened run shows a Fold card to close it again. (Advanced) “As:” draws the map as a player who gave that Given answer sees it, and Playtest results shows what simulated players do.',
          'Merge (on unless you switch it off) draws several choices between the same two pages as one arrow marked ×2, ×3; right-click it to edit each. Arc, Matrix and River always merge. Size draws a page bigger the larger the share of routes through it (a folded run takes its busiest page) and outlines choke points in bold.',
          '(Advanced) Color: ending odds tints each page green where most simulated players go on to end well and red where most end badly; playtest heat deepens with how many see it and grays pages almost nobody reaches; “Track: …” follows one object or state, outlining where it is given (green), needed (blue) and taken (red). With either playtest color, the bar above the map shows the players’ results; “Full results” lists where they end, the most-seen and rarely-seen pages, and where they get stuck.',
          'The toolbar is all small icons: hover or long-press one for its name and what it does. A lit icon is on.',
          'Hover a page (or tap it once) to light up the pages that lead to it and on from it; click (or tap again) to edit it; Esc clears. Search lights matching pages; Good path and Bad path show the shortest route to each good or bad ending.',
          'Arrows: solid is a choice, dashed appears only sometimes (it needs or is blocked by something). A badge {gift} {heart} in the middle of an arrow means picking it gives (or, faded, takes) something. A dotted page is a side page: on no shortest route to a good or bad ending.',
          'The score beside the paths counts crossing arrows and arrows pointing backwards. Click it to compare every view on crossings, neighbors, groups, stability, flow, compactness and speed, weighed for three tasks. The same story always draws the same way, so editing does not reshuffle your map, and Undo puts pages back.',
          'Build from the map: right-click a page to add a choice, change its type, give or take items, rename, duplicate, delete or play from there; an arrow to change its words, where it leads and when it appears. Double-click empty space to add a page.'
        ]),
        sec('The Check tab', [
          'Unfinished pages lists the pages you bookmarked. In the map’s advanced mode, Pages nobody reached lists pages none of the simulated players saw; Why? explains in plain words what blocks each one. The same question is in a page’s ⋯ menu: “Why can’t players reach this page?”',
          'It plays every way a player could move through your story, with every combination of items and Given answers, using the game’s own rules.',
          'Problems stop players: a choice that leads nowhere, a dead end, a page nobody can reach, a place where every choice is hidden, or a loop with no way out.',
          'Things to look at are probably mistakes: missing words, text or choices that can never appear (and why), two identical choices shown together, two pages or items with the same name, a choice that needs and hides on the same item, a leftover TODO, an empty paragraph, items that are unused, change nothing or can never be got.',
          'Good to know (folded) is not a mistake: a story still called “Untitled story”, a page that is very long or has more than seven choices, repeated words, mixed straight and curly quotes, optional choices a player can miss for good, items given or taken where it makes no difference, a story with no good ending yet.',
          '(Map advanced) Story shape names what your story is built like (time cave, branch and bottleneck, parallel tracks, hub and spokes, gauntlet) and gives one tip. Pacing shows the shortest, usual and longest read in minutes, from the words per minute you set. Each ending has an explorer: how many situations lead there, what the player must have, and a button to play from just before it.',
          'Play → “Test from…” starts a test at a page you choose, already holding what a player would have there, so you can try a late scene without replaying the start.'
        ]),
        sec('What players see', [
          'Games have a Back button only if you pick a rule (Game tab, Game switch on): remember the dice, roll again, or never back past a roll. Players keep their place in their browser.',
          'The Aa button lets a player make text bigger, spacing wider, contrast higher, motion calmer and numbers plainer. It is on by default and saved on their device. “Forget found endings” clears the count of endings.',
          'Color presets: Paper (light, dark by the device), Night, Sepia, Ocean, Forest and High contrast. Each is checked for readable contrast. Number keys 1 to 9 pick a choice.'
        ]),
        sec('Saving, exporting, privacy', [
          'File → Save manuscript (.md) writes all the words of the story, page by page with each choice and where it leads, as one text file for proofreading in another program. It has no rules and cannot be loaded back.',
          'Your story is kept in this browser as you work. Nothing is ever sent over the internet; the editor works fully offline.',
          '{save} Save (or Ctrl+S) writes your story to a .story.json file: the first time you choose where, then it saves straight there. An orange dot means unsaved changes. File → Save as… picks a new file. (Firefox and Safari download a copy instead.) To move a story to another device, open that file there.',
          'Export game saves one small HTML file anyone can open, online or offline: about 44 KB for a 25-page story, or about 27 KB if you check “Use system font” (in the export window, or Options → Use system font - Export). That setting is saved with the story. A game carries only what its story uses: no dice, number bars, greyed-out choices, Back button, endings count or Given questions code unless the story has them, and only the color preset you chose.',
          'Every ending offers Play again and, folded underneath, a recap of the path the player took. A player’s place is kept in their browser, so they can come back later.'
        ]),
        sec('Look, keys and phones', [
          'Options (⚙ beside Save) holds the quick guide, keyboard shortcuts and light / dark (the Play tab follows it). It also switches games from this story, or the editor itself, to the system font (Use system font - Export, Use system font - Editor) instead of the built-in Inter Tight, and turns remembering your preferences in this browser on or off. Options → Speed report records how smoothly the editor runs on your device, with an “It stuttered!” button, and gives a report to paste into the chat (adding #report to the address starts it at once).',
          'Options → Keyboard shortcuts lists every shortcut. Arrow keys move between the tabs. Click the logo at the top left to see the opening again.',
          'On a phone, the Pages and Items buttons open the side lists, and the map’s tools scroll sideways in one row. Every drag has a menu equivalent.'
        ])
      )
      .forEach(n => d.appendChild(n));
    d.appendChild(
      h('div', { class: 'row end' }, [
        h('button', {
          class: 'btn',
          type: 'button',
          text: 'Keyboard shortcuts',
          onclick() {
            close();
            showShortcuts();
          }
        }),
        h('button', { class: 'btn primary', type: 'button', text: 'Got it', onclick: close })
      ])
    );
  });
}

/* ----- top bar, tabs, side-panel drawers (phones) ----- */

const TABS = [
  ['write', 'Write', 'Write pages, choices and what players gain or lose'],
  ['map', 'Map', 'See the whole story as a map'],
  ['items', 'Items', 'Rename objects and states'],
  ['check', 'Check', 'Find places where players could get stuck'],
  ['game', 'Game', 'Choose how exported games look and behave, and see the colors on your own story'],
  ['play', 'Play', 'Try the story as a player']
];

/** Opens or closes a side list as a drawer (only used on narrow screens). */
function toggleDrawer(which) {
  const cls = `show-${which}`;
  const on = !document.body.classList.contains(cls);
  closeDrawers();
  if (on) document.body.classList.add(cls);
}
function closeDrawers() {
  document.body.classList.remove('show-side', 'show-items');
}

/** Draws the title, undo/redo state, tabs (with the problem badge) and the phone drawer buttons. */
function renderTop() {
  const ti = $('#title');
  if (ti && document.activeElement !== ti) ti.value = project.title;
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;

  /* totals: pages, items, choices, reader-visible words, and how many good and bad endings */
  const st = storyStats(project);

  const sb = $('#stats');
  function stat(n, one, many, tip, ico) {
    return h('span', { class: 'stat', title: tip }, [ico || null, h('b', { text: n.toLocaleString() }), ico ? null : ` ${n === 1 ? one : many}`]);
  }
  if (sb) {
    sb.textContent = '';
    [
      stat(st.pages, 'page', 'pages', 'Pages in the story'),
      stat(st.items, 'item', 'items', 'Objects and states'),
      st.givens ? stat(st.givens, 'Given', 'Givens', 'Questions answered before the story starts') : null,
      stat(st.choices, 'choice', 'choices', 'Choices across all pages'),
      stat(st.words, 'word', 'words', 'Words a player can read: title, headings, text and choice labels. Page and item names are not counted.'),
      stat(st.good, '', '', 'Good endings', icon('smile', 14)),
      stat(st.bad, '', '', 'Bad endings', icon('frown', 14))
    ].forEach(x => {
      if (x) sb.appendChild(x);
    });
  }
  const sv = $('#savebtn');
  if (sv) {
    const dirty = savedText === null || cur !== savedText;
    sv.classList.toggle('dirty', dirty);
    sv.title = storyFile
      ? dirty
        ? `Save your changes to ${storyFile.name} (Ctrl+S)`
        : `Saved to ${storyFile.name}`
      : 'Save your story to a file (Ctrl+S). The first time you choose where; after that it saves straight there.';
  }
  const nav = $('#tabs');
  nav.textContent = '';
  TABS.filter(t => t[0] !== 'game' || adv('game')).forEach(t => {
    const ti =
      t[0] === 'write'
        ? icon('pen', 18)
        : t[0] === 'map'
          ? icon('mapi', 18)
          : t[0] === 'items'
            ? itemsTabIcon(19)
            : t[0] === 'play'
              ? icon('play', 17)
              : t[0] === 'game'
                ? icon('dice', 17)
                : null;
    const b = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        title: t[2],
        'aria-selected': String(view === t[0]),
        'aria-controls': 'main',
        tabindex: view === t[0] ? '0' : '-1',
        'data-tab': t[0],
        onclick() {
          setView(t[0]);
        }
      },
      [ti, t[1]]
    );
    if (t[0] === 'check' && analysis) {
      const n = analysis.problems.length;
      b.appendChild(h('span', { class: `badge${n ? '' : ' ok'}`, text: n ? String(n) : '✓', 'aria-label': n ? `${n} problems` : 'no problems' }));
    }
    nav.appendChild(b);
  });
  renderStatus();
  /* On narrow screens the two side lists are drawers; their buttons live in their own bar under the tabs. */
  const bar = $('#drawerbar');
  bar.textContent = '';
  bar.hidden = view !== 'write';
  if (view === 'write') {
    bar.appendChild(
      h('button', {
        type: 'button',
        class: 'btn small',
        text: '☰ Pages',
        title: 'Show the list of pages',
        onclick: function () {
          toggleDrawer('side');
        }
      })
    );
    bar.appendChild(
      h('button', {
        type: 'button',
        class: 'btn small',
        text: 'Items ▸',
        title: 'Show the list of objects and states',
        onclick: function () {
          toggleDrawer('items');
        }
      })
    );
    /* one-tap page switching on phones: the same type-to-find box as Ctrl+K */
    bar.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: 'in pagepick',
          'aria-haspopup': 'listbox',
          'aria-label': `Go to page (now ${pname(byId(selId) || project.passages[0])})`,
          title: 'Go to a page: type part of its name',
          onclick: goToPage
        },
        [h('span', { class: 'cd-nm', text: pname(byId(selId) || project.passages[0]) }), h('span', { class: 'cd-car', 'aria-hidden': 'true', text: '▾' })]
      )
    );
  }
  const warn = $('#nosave');
  if (warn) warn.hidden = storageOk;
}
/** Switches tab. */
function setView(v) {
  const t0 = performance.now();
  view = v;
  closeDrawers();
  renderAll();
  const m = $('#main');
  if (m) m.scrollTop = 0;
  speedNote('draw tab', performance.now() - t0, v);
  speedPaint('tab shown', t0, v);
}

/* ----- assemble the screen ----- */

function renderMain() {
  if (view === 'game' && !adv('game')) view = 'play'; // the Game tab exists only while its Advanced switch is on
  const main = $('#main');
  main.textContent = '';
  main.className = `v-${view}${mainWide ? ' wide' : ''}`;
  document.body.dataset.view = view;
  if (view === 'write') renderWrite(main);
  else if (view === 'map') renderMap(main);
  else if (view === 'items') renderItems(main);
  else if (view === 'check') renderCheck(main);
  else if (view === 'game') renderGame(main);
  else if (view === 'play') renderPlay(main);
}
function renderAll() {
  if (view === 'game' && !adv('game')) view = 'play'; // the Game tab exists only while its Advanced switch is on
  renderTop();
  renderSide();
  renderItemSide();
  renderMain();
}

/* ----- splash ----- */

let splashTimer = null;
/**
 * The opening: one brush movement paints the ground, the logo and name fade in from left to right (with the
 * date and time this file was made, as a version), and after about 3 seconds it all fades away
 * while the small logo appears in the top bar. Clicking that small logo plays it again. It never blocks clicks.
 */
function showSplash() {
  const old = $('#splash');
  if (old) old.parentNode.removeChild(old);
  clearTimeout(splashTimer);
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const brush = brushStroke(!still);
  const sp = h('div', { id: 'splash', 'aria-hidden': 'true' }, [
    h('div', { class: 'spl' }, [
      brush,
      h('span', { class: 'spl-logo' }, [logo(128)]),
      h('span', { class: 'spl-name' }, [h('span', { text: 'Story' }), h('span', { text: 'Editor' }), h('span', { class: 'spl-stamp', text: BUILT })])
    ])
  ]);
  document.body.appendChild(sp);
  document.body.classList.add('splashing');
  brush.play();
  splashTimer = setTimeout(() => {
    document.body.classList.remove('splashing');
    sp.classList.add('out');
    splashTimer = setTimeout(() => {
      if (sp.parentNode) sp.parentNode.removeChild(sp);
    }, 700);
  }, 3700);
}

/* ----- the first-time tour: a spotlight on one area at a time ----- */

const TOUR_KEY = `${STORE}-toured`;
/** at: a selector (or a list; the spotlight covers all of them); drawer: the side list to slide open on a phone. */
const TOUR = [
  {
    title: 'Welcome',
    at: null,
    text: 'A one-minute look at where things are, and the usual order of work: write pages, link them with choices, Check, Play, then Export. Your work saves itself in this browser as you type.'
  },
  {
    title: 'Your pages',
    at: '#side',
    drawer: 'side',
    text: 'Every page of the story is listed here. Click one to edit it, press + New page to add one, and use Go to… (Ctrl+K) to jump to any page by typing part of its name.'
  },
  {
    title: 'Write a page',
    at: '#main',
    text: 'Give the page a name and write what the player reads. Below the text are its choices. Each choice leads to another page: pick one from the list, or type a new name to create that page on the spot.'
  },
  {
    title: 'Objects and states',
    at: '#itemside',
    drawer: 'items',
    text: 'Things players can gain or lose, such as a key or “hurt”. Click one to give it on a choice, Shift+click to take it away, or drag it onto a choice. Skip this until your story needs it.'
  },
  {
    title: 'The tabs',
    at: '#tabs',
    text: 'Write is where you spend most of your time. Map draws the whole story as a picture, Items renames and sets up objects, and Game changes how exported games look.'
  },
  {
    title: 'Check',
    at: '#tabs [data-tab="check"]',
    text: 'Press this often. It plays your story out in every possible way and lists places where players could get stuck, pages nothing leads to, and small slips like a missing title.'
  },
  {
    title: 'Play',
    at: '#tabs [data-tab="play"]',
    text: 'Try the story as a player would. If something feels wrong, click the page name to jump back to it in Write.'
  },
  {
    title: 'Save',
    at: '#savebtn',
    text: 'Your work is kept in this browser automatically. Save also writes it to a file you choose (Ctrl+S), which is the copy to back up or send to someone.'
  },
  {
    title: 'Export',
    at: '#export',
    text: 'Turns the story into one HTML file that anyone can play in a browser, with nothing to install. Run Check first so players do not get stuck.'
  },
  {
    title: 'That is the tour',
    at: '#optbtn',
    text: 'Replay it any time from Options → Take the tour. The Quick guide (the ? button) lists every shortcut and idea. Good luck with your story.'
  }
];
let tourOpen = false;
function tourSeen() {
  try {
    return !!localStorage.getItem(TOUR_KEY);
  } catch {
    return true; // no storage: never start by itself, since it could not be remembered as seen
  }
}
function tourMark() {
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {
    /* storage off */
  }
}
/** Starts by itself the first time an author opens the editor (never after the Advanced choices were made, nor in a report session). */
function maybeTour() {
  if (tourSeen() || settings.chosen || /(^|[#&;])report($|[&;])/.test(location.hash)) return;
  let tries = 0;
  const tryStart = () => {
    const a = document.activeElement;
    const typing = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
    if (document.querySelector('dialog[open], .ctx, .picker') || (typing && tries++ < 6)) return setTimeout(tryStart, 5000); // never grab the screen from someone who is already typing
    if (!tourSeen()) startTour();
  };
  setTimeout(tryStart, 4600); // after the opening animation
}
function startTour() {
  if (tourOpen) return;
  tourOpen = true;
  tourMark();
  closeDrawers();
  if (view !== 'write') setView('write');
  const before = document.activeElement;
  const hole = h('div', { class: 'tour-hole none' });
  const count = h('div', { class: 'tour-count' });
  const title = h('h3', { id: 'tour-h' });
  const body = h('p', { class: 'tour-text' });
  const skip = h('button', { type: 'button', class: 'btn small tour-skip', text: 'Skip tour', onclick: () => finish() });
  const back = h('button', { type: 'button', class: 'btn small', text: 'Back', onclick: () => go(-1) });
  const next = h('button', { type: 'button', class: 'btn small primary', onclick: () => go(1) });
  const card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-h' }, [
    count,
    title,
    body,
    h('div', { class: 'tour-btns' }, [skip, h('span', { class: 'tour-gap' }), back, next])
  ]);
  const root = h('div', { id: 'tour' }, [h('div', { class: 'tour-block' }), hole, card]);
  document.body.appendChild(root);
  const phone = () => matchMedia('(max-width: 820px)').matches;
  let i = -1;
  let cur = null; // the step on show
  let token = 0;
  /** The areas of a step that can be seen right now. */
  function areas(st) {
    return [].concat(st.at || []).map(sel => $(sel)).filter(el => el && el.getClientRects().length);
  }
  function place() {
    if (!cur) return;
    const els = areas(cur);
    const vw = innerWidth,
      vh = innerHeight;
    const small = vw <= 600;
    card.classList.toggle('sheet', small);
    let r = null;
    if (els.length) {
      const rs = els.map(el => el.getBoundingClientRect());
      const L = Math.max(0, Math.min(...rs.map(x => x.left)) - 5),
        T = Math.max(0, Math.min(...rs.map(x => x.top)) - 5),
        R = Math.min(vw, Math.max(...rs.map(x => x.right)) + 5),
        B = Math.min(vh, Math.max(...rs.map(x => x.bottom)) + 5);
      r = { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T };
      Object.assign(hole.style, { left: `${L}px`, top: `${T}px`, width: `${r.width}px`, height: `${r.height}px` });
      hole.classList.remove('none');
    } else {
      hole.classList.add('none');
      hole.removeAttribute('style');
    }
    const c = card.getBoundingClientRect();
    const cw = c.width,
      ch = c.height,
      gap = 12;
    let x = (vw - cw) / 2,
      y = (vh - ch) / 2;
    if (small) {
      x = 8;
      y = r && (r.top + r.bottom) / 2 > vh / 2 ? 8 : vh - ch - 8; // keep clear of the highlighted area
    } else if (r) {
      const clampX = v => Math.max(gap, Math.min(vw - cw - gap, v));
      if (r.bottom + gap + ch <= vh && r.height < vh * 0.5) (y = r.bottom + gap), (x = clampX(r.left));
      else if (r.top - gap - ch >= 0 && r.height < vh * 0.5) (y = r.top - gap - ch), (x = clampX(r.left));
      else if (r.right + gap + cw <= vw) (x = r.right + gap), (y = Math.max(gap, Math.min(vh - ch - gap, r.top + 16)));
      else if (r.left - gap - cw >= 0) (x = r.left - gap - cw), (y = Math.max(gap, Math.min(vh - ch - gap, r.top + 16)));
      else (x = clampX(r.left + (r.width - cw) / 2)), (y = Math.max(gap, vh - ch - gap * 2)); // no room beside it: bottom of the screen
    }
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  }
  function show(n, dir) {
    if (n < 0 || n >= TOUR.length) return finish();
    const st = TOUR[n];
    const my = ++token;
    closeDrawers();
    if (st.drawer && phone()) document.body.classList.add(`show-${st.drawer}`);
    const settle = () => {
      if (my !== token) return;
      if (st.at && !areas(st).length) return show(n + dir, dir); // hidden right now (a collapsed list): skip it
      i = n;
      cur = st;
      areas(st).forEach(el => el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }));
      count.textContent = `Step ${n + 1} of ${TOUR.length}`;
      title.textContent = st.title;
      body.textContent = st.text;
      back.disabled = n === 0;
      next.textContent = n === TOUR.length - 1 ? 'Done' : 'Next';
      place();
      setTimeout(() => {
        if (my === token) next.focus({ preventScroll: true });
      }, 30);
    };
    if (st.drawer && phone()) setTimeout(settle, 340); // wait for the drawer to slide in
    else settle();
  }
  function go(d) {
    show(i + d, d);
  }
  function key(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish();
    } else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      go(1);
    } else if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      if (i > 0) go(-1);
    } else if (e.key === 'Tab') {
      const bs = [skip, back, next].filter(b => !b.disabled);
      const k = bs.indexOf(document.activeElement);
      e.preventDefault();
      e.stopPropagation();
      bs[(k + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
    } else if (!(e.key === 'Enter' || e.key === ' ')) {
      if ((e.ctrlKey || e.metaKey) && /^[sp]$/i.test(e.key)) e.preventDefault(); // no browser Save/Print box over the tour
      e.stopPropagation(); // the editor's own shortcuts wait until the tour is over
    }
  }
  function finish() {
    token++;
    removeEventListener('keydown', key, true);
    removeEventListener('resize', onResize);
    root.remove();
    tourOpen = false;
    closeDrawers();
    if (before?.isConnected && before !== document.body) {
      try {
        before.focus({ preventScroll: true });
      } catch {
        /* cannot take focus */
      }
    }
  }
  addEventListener('keydown', key, true);
  let wasPhone = phone();
  function onResize() {
    const now = phone();
    if (now !== wasPhone && i >= 0) {
      wasPhone = now; // the layout changed shape (a rotated phone, a resized window): open or close the drawer again for this step
      show(i, 1);
    } else place();
  }
  addEventListener('resize', onResize);
  show(0, 1);
}

/* ----- start-up ----- */

/* ----- Advanced: which features each tab shows -----
   With all four off the editor shows only the essentials. The choices are always kept in this browser,
   whether or not other preferences are remembered. */
const ADVANCED = [
  ['write', 'Write', 'Choices that give or take an object or state the moment they are picked (the gift-and-heart button on each choice).'],
  [
    'items',
    'Items',
    'Givens (questions the player answers before page one, such as “Who are you?”) and “Shown as” names (the wallet becomes a purse for some players).'
  ],
  [
    'map',
    'Map',
    'Every view (Choke-point spine, Given lanes, Story shape, River of players, Arc diagram), coloring by ending odds, playtest heat or one item, drawing the map for one Given answer, and Playtest results.'
  ],
  [
    'game',
    'Game',
    'A Game tab (between Check and Play) for reader options in exported games, with a live preview: what Back does after a dice roll, the “endings found” count, a Place code (a short code that carries a player’s place to another device), the Aa reading button, odds on dice checks, and color presets.'
  ]
];
/** What turning each switch on or off changes, said in the Advanced box itself so a click is never silent. */
const ADVANCED_EFFECT = {
  write: [
    'Each choice now has the gift-and-heart button on the Write tab.',
    'The gift-and-heart button is hidden on the Write tab (choices that already give or take things keep doing so).'
  ],
  items: ['The Items tab now shows Givens and “Shown as” names.', 'Givens and “Shown as” names are hidden on the Items tab (a story that uses them keeps them).'],
  map: ['The Map tab now has every view, the coloring choices and Playtest results.', 'The Map tab shows only the essential views.'],
  game: [
    'A Game tab is now between Check and Play. While it shows, the Game switch is on.',
    'The Game tab is hidden (this story’s games keep the options already chosen).'
  ]
};
/** Options → Advanced: one switch per tab. */
function showAdvanced() {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Advanced features' }));
    d.appendChild(
      h('div', {
        class: 'hint',
        text: 'Turn on the features you need, tab by tab. With all four off, the editor shows only the essentials. Anything a story already uses keeps working in its games either way, and the Check tab mentions it. These choices are always kept in this browser.'
      })
    );
    const status = h('div', { class: 'hint advstatus', role: 'status', 'aria-live': 'polite' });
    ADVANCED.forEach(([k, label, what]) => {
      const box = h('input', {
        type: 'checkbox',
        role: 'switch',
        checked: adv(k) ? true : null,
        onchange(e) {
          settings.advanced[k] = e.target.checked;
          settings.chosen = true;
          saveSettings();
          analysisFor = null; // the Check tab's notes depend on what is shown
          renderAll();
          runCheck();
          status.textContent = ADVANCED_EFFECT[k][e.target.checked ? 0 : 1];
        }
      });
      d.appendChild(
        h('label', { class: 'check advrow' }, [box, h('span', {}, [h('strong', { text: label }), h('span', { class: 'hint', text: what })])])
      );
    });
    d.appendChild(status);
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Done', onclick: close })]));
  });
}
/**
 * Until the author has set the Advanced choices themselves, a story that already uses an advanced feature turns that
 * tab's features on, so nothing it relies on is hidden. Returns the tabs turned on.
 */
/** Tells the author which tabs' advanced features were just turned on for this story. */
function noteAdvanced(on) {
  if (!on.length) return;
  renderAll();
  toast(`This story uses ${on.map(k => ADVANCED.find(a => a[0] === k)[1]).join(' and ')} features, so they are now shown (Options → Advanced).`);
}
function adviseAdvanced(p) {
  if (settings.chosen) return [];
  const uses = {
    write: p.passages.some(q => q.choices.some(c => c.gives.length || c.takes.length)),
    items: p.givens.length > 0 || p.items.some(i => i.names?.length || i.kind === 'stat'),
    game: JSON.stringify(p.game || {}) !== JSON.stringify(GAME_DEFAULTS)
  };
  // Numbers, dice checks and greyed-out choices live in the Write and Items tabs; dice checks need Numbers (Items).
  const on = Object.keys(uses).filter(k => uses[k] && !settings.advanced[k]);
  on.forEach(k => {
    settings.advanced[k] = true;
  });
  if (on.length) saveSettings();
  return on;
}

/* ----- drop-down menus (File, Options) ----- */

let fileMenu = null;
let optionsMenu = null;
/**
 * Makes a drop-down menu for button `btn` and panel `pop`. `entries()` is called each time it opens, so labels
 * with check marks are always current: [label, fn, tooltip?] or null for a divider. Arrow keys move through it,
 * Esc or Tab closes it, a click elsewhere closes it, and a dialog opened from it gives focus back to `btn`.
 */
function dropMenu(btn, pop, entries) {
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  pop.setAttribute('role', 'menu');
  const fill = () => {
    pop.textContent = '';
    entries().forEach(en => {
      if (!en) return pop.appendChild(h('hr'));
      pop.appendChild(
        h('button', {
          type: 'button',
          role: 'menuitem',
          text: en[0],
          title: en[2] || null,
          onclick() {
            set(false);
            menuOpener = btn;
            en[1]();
          }
        })
      );
    });
  };
  function set(open, focusFirst) {
    if (open) {
      (btn === $('#menubtn') ? optionsMenu : fileMenu)?.set(false);
      fill();
    }
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      // keep the menu on screen: open leftward from the button's right edge; if that runs off the left
      // side, open rightward; if that runs off the right side too (a narrow phone), shift it back in
      pop.style.left = 'auto';
      pop.style.right = '0';
      if (pop.getBoundingClientRect().left < 8) {
        pop.style.right = 'auto';
        pop.style.left = '0';
        const over = pop.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
        if (over > 0) pop.style.left = `${-over}px`;
      }
    }
    if (open && focusFirst) pop.querySelector('button')?.focus();
  }
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      set(true, true);
    }
  });
  pop.addEventListener('keydown', e => {
    const items = [...pop.querySelectorAll('button')],
      i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      set(false);
      btn.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    } else if (e.key === 'Tab') set(false);
  });
  btn.addEventListener('click', e => {
    e.stopPropagation();
    set(pop.hidden, e.detail === 0);
  });
  document.addEventListener('click', () => {
    if (!pop.hidden) set(false);
  });
  return { set, isOpen: () => !pop.hidden };
}

/* ----- one window at a time -----
   The autosave is one slot in this browser's storage, and every copy of the editor on this computer shares it (a page opened from a file
   shares storage with other files, measured in Firefox and Chromium). Two windows saving would silently overwrite each other, so only one
   holds the "writer" lock (Web Locks); another window shows a box with a Use-this-window button. Taking over steals the lock, the other
   window flushes its last edit and pauses, and this one reloads so it starts from what was saved. Where Web Locks are missing, the
   `storage` event stands in: a save by another window pauses this one and asks which version to keep. */
const WRITER_LOCK = 'story-editor-writer';
let guardState = ''; // '', 'other' (another window had it first), 'taken' (another window took over), 'changed' (no Web Locks: another window saved)
function guardBox(state) {
  guardState = state;
  writerLost = true;
  const text = {
    other: 'Another window or tab (or another copy of the editor on this computer) already has this story open. If both saved, they would overwrite each other, so this window is paused: nothing here is saved.',
    taken: 'Another window took over this story, so this one is paused. What you did here was saved first. Nothing new here is saved.',
    changed: 'Another window saved this story just now. If you keep going here, your version replaces theirs (theirs is kept as the spare copy).'
  }[state];
  const again = () => setTimeout(() => guardState === state && guardBox(state), 0); // Esc or a click outside cannot dismiss it
  dialog((d, close) => {
    d.appendChild(h('h3', { text: state === 'changed' ? 'Changed in another window' : 'This story is open in another window' }));
    d.appendChild(h('div', { text }));
    d.appendChild(
      h('div', { class: 'row end' }, [
        state === 'changed' &&
          h('button', { class: 'btn', type: 'button', text: 'Load their version', onclick: () => location.reload() }),
        h('button', {
          class: 'btn primary',
          type: 'button',
          text: state === 'changed' ? 'Keep mine' : 'Use this window instead',
          onclick: () => {
            if (state === 'changed') {
              guardState = '';
              writerLost = false;
              close();
              persistNow(true);
            } else {
              guardTakeOver();
            }
          }
        })
      ])
    );
  }, again);
}
/** Steals the writer lock, gives the other window a moment to save its last edit, then reloads to start from what was saved. */
function guardTakeOver() {
  try {
    navigator.locks.request(WRITER_LOCK, { steal: true }, () => {
      setTimeout(() => location.reload(), 500);
      return new Promise(() => {});
    });
  } catch (e) {
    logError('take over', e);
    location.reload();
  }
}
function guardStart() {
  let locks = null;
  try {
    locks = navigator.locks;
  } catch {
    /* a sandboxed page has no locks */
  }
  if (locks?.request) {
    try {
      locks
        .request(WRITER_LOCK, { ifAvailable: true }, lock => {
          if (!lock) {
            guardBox('other');
            return undefined;
          }
          return new Promise(() => {}); // held for as long as this page lives
        })
        .catch(() => {
          /* the lock was stolen by another window: save what is pending, then pause */
          if (saveTimer) persistNow();
          guardBox('taken');
        });
      return;
    } catch (e) {
      logError('writer lock', e);
    }
  }
  window.addEventListener('storage', e => {
    if (e.key !== STORE || e.storageArea !== localStorage || writerLost || e.newValue === cur) return;
    guardBox('changed');
  });
}

function init() {
  const gs = document.createElement('style');
  gs.textContent = gameCss(GAME_PARTS.css, KL_FEATURE_ORDER, null); // every feature, every palette: the Play tab can show anything
  document.head.appendChild(gs); // so Play looks like the export
  if (/(^|[#&;])report($|[&;])/.test(location.hash)) speedStart(); // opened with #report: record from the start (see ui4-speed.js)
  let saved = null;
  try {
    saved = localStorage.getItem(STORE);
    localStorage.setItem(`${STORE}-t`, '1');
    localStorage.removeItem(`${STORE}-t`);
  } catch (e) {
    storageOk = false;
    logError('storage', e);
  }
  let restored = false;
  try {
    project = saved ? normalizeProject(JSON.parse(saved)) : freshExample();
  } catch (e) {
    /* a damaged save never blocks start-up: keep its text aside, then use the spare copy if there is one */
    logError('start-up save', e);
    let spare = null;
    try {
      localStorage.setItem(DAMAGED_KEY, saved);
      spare = localStorage.getItem(BACKUP_KEY);
    } catch (e2) {
      logError('start-up spare', e2);
    }
    try {
      project = spare ? normalizeProject(JSON.parse(spare)) : freshExample();
      restored = !!spare;
      if (!spare) setTimeout(() => toast('Your last autosave could not be read, and there was no earlier copy, so the example story is shown. The unreadable copy is kept aside in this browser.'), 600);
    } catch (e2) {
      logError('start-up spare', e2);
      project = freshExample();
    }
  }
  if (project.id === STARTER.id) project.id = uid('s_'); // older copies of the example all shared one id
  cur = JSON.stringify(project);
  selId = project.start;
  /* remembered look: light unless dark was chosen */
  loadSettings();
  applySides();
  applyTextSize();
  watchWidth();
  applyTheme(readPref(`${STORE}-theme`) || 'light');
  applyEditorFont();
  adviseAdvanced(project);
  if (startFixNote) setTimeout(() => toast(startFixNote), 700);
  setTimeout(maybeNudge, 2600);
  if (restored) setTimeout(() => toast('Your last autosave could not be read, so the earlier copy was restored. The unreadable one is kept aside in this browser.'), 600);

  /* The File and Options menus */
  // Menu labels stay short; the tooltip (third item) says more.
  fileMenu = dropMenu($('#menubtn'), $('#menupop'), () => [
    ['Save', saveStory, 'Save this story to its file (Ctrl+S).'],
    ['Save as…', saveStoryAs, 'Save this story to a new file.'],
    ['Open…', () => openFile('json'), 'Open a story file (.story.json).'],
    ['Import old format…', () => openFile('old'), 'Bring in a story saved in the old text format.'],
    ['Import Twine…', importTwineFile, 'Bring in a story from Twine (a Twine 2 HTML file, a Twee text file, or a Twine 1 file) to edit here. Its links become choices; its code is kept as text or turned into rules.'],
    ['Paste an outline…', outlineDialog, 'Write pages as an indented list (one page per line, its choices indented under it with an arrow) and add them all to this story at once.'],
    ['Translations…', translationsDialog, 'Save the story’s words as a sheet for translators, bring the translated sheet back, and give the game a language menu.'],
    null,
    ['New story', newStory, 'Start an empty story.'],
    ['Example story', loadExample, 'Load the example story to look around.'],
    null,
    ['Save manuscript (.md)…', exportManuscript, 'Save all the words of the story as one Markdown text file: every page with its choices and where they lead. For proofreading; it has no rules in it.'],
    ['Save test script (.md)…', exportTestScript, 'Save a checklist of routes through the story that together take every choice at least once, with a box to tick for each step. For testers and proofreaders.'],
    ['Copy game code…', exportGame, 'Copy the finished game’s HTML, to paste somewhere else.']
  ]);
  optionsMenu = dropMenu($('#optbtn'), $('#optpop'), () =>
    [
      ['Quick guide', showGuide],
      ['Keyboard shortcuts', showShortcuts],
      ['Take the tour', startTour, 'A short spotlight tour of the main areas and the usual order of work.'],
      ['Light / dark', toggleTheme, 'Switch between the light and dark look.'],
      null,
      [
        `${project.gameFont === 'system' ? '✓ ' : ''}Use system font - Export`,
        toggleGameFont,
        'For this story: exported games use the font already on the player’s device instead of carrying Inter Tight (about 17 KB smaller).'
      ],
      [
        `${prefs.editorFont === 'system' ? '✓ ' : ''}Use system font - Editor`,
        toggleEditorFont,
        'Show this editor in your device’s system font instead of Inter Tight.'
      ],
      [
        `${prefs.quotes ? '✓ ' : ''}Smart quotes and dashes`,
        toggleQuotes,
        'While you type in the Write tab, " and \' become curly quotes and two hyphens become a dash (—).'
      ],
      [`Writing text size: ${WSIZE_NAMES[prefs.wsize]}`, cycleTextSize, 'Make the words in the Write tab’s boxes smaller or larger. Each click goes to the next size.'],
      [
        `${settings.remember ? '✓ ' : ''}Remember preferences`,
        toggleRemember,
        'Keep light or dark, the editor font and map settings in this browser between visits. The Advanced choices are always kept.'
      ],
      null,
      ['Safety…', showSafety, 'Where your story is kept, when it was last saved to a file, and whether the browser promises to keep the autosave.'],
      ['Advanced…', showAdvanced, 'Choose which advanced features each tab shows.'],
      ['Speed report…', showSpeedReport, 'For troubleshooting: record how smoothly the editor runs on this device and copy a report to paste into the chat.']
    ].filter(x => x !== undefined)
  );

  /* Top bar buttons */
  $('#title').addEventListener('input', e => {
    project.title = e.target.value;
    commit('title');
  });
  $('#undo').addEventListener('click', undo);
  $('#redo').addEventListener('click', redo);
  wireHistory();
  $('#help').addEventListener('click', showGuide);
  $('#export').addEventListener('click', quickExport);
  $('#savebtn').insertBefore(icon('save', 16), $('#savebtn').firstChild);
  $('#savebtn').addEventListener('click', saveStory);
  /* reconnect to the story file used last time, if it is still this story */
  kvGet('file').then(rec => {
    if (rec?.handle && rec.story === project.id) {
      storyFile = rec.handle;
      storyFileFor = project.id;
      storyFileEpoch = epoch;
      savedText = rec.sig && rec.sig === sigOf(cur) ? cur : null; // only "saved" when the file still holds what is here
      renderTop();
    }
  });
  $('#scrim').addEventListener('click', closeDrawers);

  /* Keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Shift+Z redo (when not typing), Esc closes dialogs */
  document.addEventListener('keydown', e => {
    const t = e.target && e.target.tagName;
    if ((e.ctrlKey || e.metaKey) && (e.key || '').toLowerCase() === 's') {
      e.preventDefault();
      saveStory();
      return;
    }
    if (e.key === 'Escape') {
      // an open dialog closes itself on Esc
      if (document.querySelector('dialog[open]')) return;
      if (fileMenu.isOpen() || optionsMenu.isOpen()) {
        fileMenu.set(false); // a menu, however it was opened
        optionsMenu.set(false);
        return;
      }
      closeDrawers();
      if (document.activeElement?.closest?.('.mapbox')) document.activeElement.blur(); // a page lit by keyboard focus goes dark
      if (view === 'map' && (mapPin || mapPick || mapRiverSel)) {
        mapRiverSel = null;
        mapPin = null;
        mapPick = null;
        mapRedraw();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key || '').toLowerCase() === 'k') {
      e.preventDefault(); // Ctrl+K: go to a page (the browser's own search-bar shortcut is not wanted here)
      if (!document.querySelector('dialog[open]')) goToPage();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key || '').toLowerCase() === 'f') {
      e.preventDefault();
      if (!document.querySelector('dialog[open]')) findDialog();
      return;
    }
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    /* Undo rebuilds the story, so a dialog, a menu or the picker still open would act on pages that no longer exist: leave Ctrl+Z / Ctrl+Y for after they close */
    if (document.querySelector('dialog[open], .ctx, .picker') || fileMenu?.isOpen() || optionsMenu?.isOpen()) return;
    const k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'z') {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (e.shiftKey && k === 'z'))) {
      e.preventDefault();
      redo();
    }
  });

  /* the tabs: arrow keys move between them, as in any tab list */
  $('#tabs').addEventListener('keydown', e => {
    const tabs = [...$('#tabs').querySelectorAll('[role=tab]')],
      i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const j =
      e.key === 'ArrowRight'
        ? (i + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : -1;
    if (j < 0) return;
    e.preventDefault();
    setView(tabs[j].dataset.tab);
    $(`#tabs [data-tab="${tabs[j].dataset.tab}"]`)?.focus();
  });

  runCheck();
  renderAll();
  /* Read-only handles used by the automated tests. They expose nothing that is not already on screen. */
  $('#brandlogo').appendChild(logo(26));
  $('#brandlogo').addEventListener('click', showSplash);
  $('#brandlogo').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showSplash();
    }
  });
  showSplash();
  maybeTour();
  guardStart();
  window.__editor = {
    get guard() {
      return guardState;
    },
    persistNow, // so a test can ask for the autosave a paused window would attempt
    get project() {
      return project;
    },
    get analysis() {
      return analysis;
    },
    setView,
    openPage: id => openPage(typeof id === 'string' ? byId(id) : id), // for the test suites
    xl: { sheet: () => translationSheet(project), csvParse, csvWrite }, // for the test suites
    refresh, // the test suites change the story directly, then ask for the same redraw an edit would
    startTour
  };
}
init();
requestAnimationFrame(() => setTimeout(() => (READY_AT = performance.now()), 0)); // the first screen has been drawn
