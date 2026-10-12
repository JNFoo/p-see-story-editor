/* ---------------------------------------------------------------------------
   3b. Widgets: toasts, dialogs, file helpers, drag and drop, right-click menus
   --------------------------------------------------------------------------- */

/* ----- toast: a short message at the bottom of the screen -----
   The box always stays in the page (shown or hidden by a class), so screen readers announce each message. */
let toastTimer = 0;
function toast(msg, action, fn) {
  const t = $('#toast');
  t.textContent = msg;
  if (action)
    t.appendChild(
      h('button', {
        type: 'button',
        class: 'toastbtn',
        text: action,
        onclick() {
          hideToast();
          fn();
        }
      })
    );
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 3500);
}
function hideToast() {
  const t = $('#toast');
  t.classList.remove('show');
  setTimeout(() => {
    if (!t.classList.contains('show')) t.textContent = '';
  }, 250);
}

/* ----- tooltips -----
   Every hint in the editor (a "title" on a button, or a <title> inside a map drawing) is shown in one consistent
   bubble, after a short pause on hover or when reached with the keyboard, and hidden on any click, key or scroll.
   The browser's own tooltip is suppressed by moving the text to data-tip the first time; an element with no
   other name keeps the hint as its accessible label, so screen readers lose nothing. */
const tipBox = () => $('#tip');
let tipTimer = 0,
  tipFor = null;
function tipText(el) {
  if (el.dataset?.tip !== undefined) return el.dataset.tip;
  let t = '';
  if (el.hasAttribute?.('title')) {
    t = el.getAttribute('title');
    el.removeAttribute('title');
    if (!el.getAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', t);
  } else {
    const st = [...el.children].find(c => c.tagName === 'title');
    if (st) {
      t = st.textContent;
      st.remove();
    }
  }
  if (el.dataset) el.dataset.tip = t;
  return t;
}
function tipTarget(node) {
  for (let el = node; el && el !== document.body; el = el.parentElement || el.parentNode) {
    if (!(el instanceof Element)) return null;
    if (el.dataset?.tip !== undefined || el.hasAttribute('title') || [...el.children].some(c => c.tagName === 'title')) return el;
    if (el.matches('dialog, .pop, .ctx')) return null;
  }
  return null;
}
function showTip(el, now) {
  clearTimeout(tipTimer);
  const text = el && tipText(el);
  if (!text) {
    hideTip();
    return;
  }
  tipFor = el;
  tipTimer = setTimeout(
    () => {
      if (tipFor !== el || !el.isConnected) return;
      const b = tipBox();
      b.textContent = text;
      b.classList.add('show');
      const r = el.getBoundingClientRect(),
        w = b.offsetWidth,
        hgt = b.offsetHeight;
      let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
      let y = r.bottom + 8;
      if (y + hgt > innerHeight - 8) y = Math.max(8, r.top - hgt - 8);
      b.style.left = `${x}px`;
      b.style.top = `${y}px`;
    },
    now ? 0 : 450
  );
}
function hideTip() {
  clearTimeout(tipTimer);
  tipFor = null;
  tipBox()?.classList.remove('show');
}
let tipArmed = true; // false after a press, until the pointer really moves: a redraw under a still pointer must not pop a tip up again
/** Shows (after a pause) the hint for whatever the pointer is over now. */
function tipAt(target) {
  const el = tipTarget(target);
  if (el !== tipFor) {
    if (el) showTip(el);
    else hideTip();
  }
}
document.addEventListener(
  'pointermove',
  e => {
    if (e.pointerType === 'touch') return;
    if (!tipArmed) {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) < 2) return;
      tipArmed = true;
    }
    tipAt(e.target);
  },
  { passive: true }
);
document.addEventListener(
  'pointerdown',
  () => {
    tipArmed = false;
    hideTip();
  },
  true
);
document.addEventListener(
  'keydown',
  e => {
    if (e.key !== 'Tab' && e.key !== 'Shift') hideTip();
  },
  true
);
document.addEventListener('scroll', hideTip, true);
document.addEventListener('focusin', () => {
  const el = document.activeElement;
  if (viaKeys && el) {
    const t = tipTarget(el);
    if (t === el) showTip(el);
  }
});

/* ----- dialogs: a centered box over a dimmed page ----- */

/**
 * Opens a dialog (the browser's own <dialog>, so focus stays inside it, the page behind is inert and
 * Esc closes it). `build(box, close)` fills the box and may call close(). `onDismiss` runs if the person
 * closes it without choosing (Esc or a click outside), so a waiting question always gets an answer.
 * Focus returns to where it was when the dialog closes.
 */
function dialog(build, onDismiss) {
  const before = document.activeElement;
  const d = h('dialog', { class: 'dlg', 'aria-modal': 'true' });
  let done = false;
  function close() {
    if (done) return;
    done = true;
    if (d.open) d.close();
    d.remove();
    const usable = el => el?.isConnected && el.checkVisibility?.() !== false; // a hidden menu entry cannot take focus
    const back = usable(before) ? before : usable(menuOpener) ? menuOpener : null;
    menuOpener = null;
    if (back) {
      try {
        back.focus({ preventScroll: true });
      } catch {
        /* element cannot take focus */
      }
    }
  }
  build(d, close);
  const head = d.querySelector('h3');
  if (head) {
    head.id ||= uid('dh_');
    d.setAttribute('aria-labelledby', head.id);
  }
  d.addEventListener('cancel', e => {
    e.preventDefault();
    close();
    onDismiss?.();
  }); // Esc
  d.addEventListener('click', e => {
    // a click on the dimmed area outside the box
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      close();
      onDismiss?.();
    }
  });
  document.body.appendChild(d);
  d.showModal();
  const f = d.querySelector('input, button.primary, button');
  f?.focus({ preventScroll: true }); // preventScroll: a long dialog (the guide) must open at its top, not at the focused button
  d.scrollTop = 0;
  return close;
}
/** A yes/no question. Returns a Promise of true / false. */
function ask(title, body, okLabel, danger) {
  return new Promise(resolve => {
    dialog(
      (d, close) => {
        d.appendChild(h('h3', { text: title }));
        d.appendChild(h('div', { text: body }));
        d.appendChild(
          h('div', { class: 'row end' }, [
            h('button', {
              class: 'btn',
              type: 'button',
              text: 'Cancel',
              onclick: function () {
                close();
                resolve(false);
              }
            }),
            h('button', {
              class: `btn ${danger ? 'danger' : 'primary'}`,
              type: 'button',
              text: okLabel || 'OK',
              onclick: function () {
                close();
                resolve(true);
              }
            })
          ])
        );
      },
      () => resolve(false)
    );
  });
}
/** A message box with a list of lines. `extra(box)` may add more content. */
function info(title, lines, extra) {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: title }));
    if (lines && lines.length)
      d.appendChild(
        h(
          'ul',
          {},
          lines.map(l => h('li', { text: l }))
        )
      );
    if (extra) extra(d);
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Close', onclick: close })]));
  });
}
/**
 * Asks for one or more short texts. fields = [{ label, value, placeholder }].
 * Returns a Promise of an array of trimmed strings, or null if canceled. Enter submits.
 */
function promptDialog(title, fields, okLabel) {
  return new Promise(resolve => {
    dialog(
      (d, close) => {
        d.appendChild(h('h3', { text: title }));
        const inputs = fields.map(f => {
          const inp = h('input', {
            class: 'in',
            value: f.value || '',
            placeholder: f.placeholder || '',
            'aria-label': f.label,
            maxlength: 200,
            onkeydown: function (e) {
              if (e.key === 'Enter') {
                e.preventDefault();
                go();
              }
            }
          });
          d.appendChild(h('label', { class: 'f' }, [f.label, inp]));
          return inp;
        });
        function go() {
          close();
          resolve(inputs.map(i => i.value.trim()));
        }
        d.appendChild(
          h('div', { class: 'row end' }, [
            h('button', {
              class: 'btn',
              type: 'button',
              text: 'Cancel',
              onclick: function () {
                close();
                resolve(null);
              }
            }),
            h('button', { class: 'btn primary', type: 'button', text: okLabel || 'OK', onclick: go })
          ])
        );
        setTimeout(() => {
          if (inputs[0]) {
            inputs[0].focus();
            inputs[0].select();
          }
        }, 0);
      },
      () => resolve(null)
    );
  });
}

/* ----- files and clipboard ----- */

/** "My Story!" -> "my-story" (safe file names). */
function slug(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'story'
  );
}
/** Offers `text` to the browser as a downloaded file. Works offline: the data never leaves the device. */
/**
 * Saves a file. Resolves to the file's handle (where the browser has a real Save window: Chrome and Edge on a
 * computer), to true (after an ordinary download elsewhere), or to false if the person canceled.
 * `place` names a kind of file ('stories', 'games'): the Save window reopens in the folder last used for that kind.
 */
async function saveFile(name, text, mime, what, place) {
  if (window.showSaveFilePicker && window.self === window.top) {
    const ext = name.slice(name.indexOf('.'));
    const o = { suggestedName: name, types: [{ description: what || 'File', accept: { [mime]: [ext] } }] };
    if (place) o.id = place;
    let handle;
    try {
      handle = await window.showSaveFilePicker(o);
    } catch (e) {
      if (e?.name === 'AbortError') return false; // the person pressed Cancel
      logError('save picker', e);
      download(name, text, mime);
      return true; // the picker is blocked here: fall back to a download
    }
    await writeTo(handle, text, mime); // if writing fails (disk full, no permission), the caller says so
    return handle;
  }
  download(name, text, mime);
  return true;
}
/** Writes text over a file the person already chose (needs their permission once per visit). */
function writeTo(handle, text, mime) {
  return handle.createWritable().then(w => w.write(new Blob([text], { type: mime })).then(() => w.close()));
}
/** Asks for permission to write to `handle` again if the browser has forgotten it. Resolves to true or false. */
function canWrite(handle) {
  if (!handle.queryPermission) return Promise.resolve(true);
  return handle
    .queryPermission({ mode: 'readwrite' })
    .then(s => (s === 'granted' ? true : handle.requestPermission({ mode: 'readwrite' }).then(r => r === 'granted')));
}

/* A tiny key-value store in IndexedDB, used only to remember which story file you were working on
   (a file handle cannot be kept in localStorage). Every call is wrapped so a blocked database is harmless. */
function kvOpen() {
  return new Promise((ok, no) => {
    try {
      const r = indexedDB.open('story-editor', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('kv');
      };
      r.onsuccess = () => {
        ok(r.result);
      };
      r.onerror = () => {
        no(r.error);
      };
    } catch (e) {
      logError('file memory', e);
      no(e);
    }
  });
}
function kvGet(key) {
  return kvOpen()
    .then(
      db =>
        new Promise(ok => {
          const q = db.transaction('kv').objectStore('kv').get(key);
          q.onsuccess = () => {
            ok(q.result);
          };
          q.onerror = () => {
            ok(null);
          };
        })
    )
    .catch(() => null);
}
function kvSet(key, val) {
  return kvOpen()
    .then(
      db =>
        new Promise(ok => {
          const t = db.transaction('kv', 'readwrite');
          t.objectStore('kv').put(val, key);
          t.oncomplete = () => {
            ok(true);
          };
          t.onerror = () => {
            ok(false);
          };
        })
    )
    .catch(() => false);
}
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000); // generous: some browsers read it only after their Save window closes
}
/** Copies text; if the browser refuses, selects it so the person can press Ctrl/Cmd+C. */
function copyText(text, ta) {
  function fallback() {
    if (!ta) {
      // nothing on screen to select: show the text in a box, selected
      dialog((d, close) => {
        ta = h('textarea', { class: 'in mono', readonly: true, rows: 6, 'aria-label': 'Text to copy', value: text });
        d.appendChild(h('h3', { text: 'Copy this text' }));
        d.appendChild(ta);
        d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Close', onclick: close })]));
      });
    }
    ta.focus();
    ta.select();
    toast('Press Ctrl+C (or Cmd+C) to copy the selected text.');
  }
  try {
    navigator.clipboard.writeText(text).then(() => {
      toast('Copied.');
    }, fallback);
  } catch (e) {
    fallback();
  }
}

/* ----- small form helpers ----- */

/** Grows a textarea to fit its text (never smaller than two lines). */
function autosize(t) {
  t.style.height = 'auto';
  t.style.height = `${Math.max(t.scrollHeight + 2, 54)}px`;
}
/**
 * The same for many at once. Reading a height forces the browser to lay the page out, so doing "reset, read, set" one box at
 * a time makes it lay out once per box; here all are reset, then all are read (one layout), then all are set.
 */
function autosizeAll(list) {
  const boxes = Array.from(list);
  boxes.forEach(t => {
    t.style.height = 'auto';
  });
  const heights = boxes.map(t => t.scrollHeight);
  boxes.forEach((t, i) => {
    t.style.height = `${Math.max(heights[i] + 2, 54)}px`;
  });
}
/** Moves arr[i] up (d = -1) or down (d = 1), then redraws. */
function move(arr, i, d) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  const x = arr[i];
  arr[i] = arr[j];
  arr[j] = x;
  refresh();
}
/** After a redraw, puts the cursor in the n-th element matching `sel`. */
function focusSoon(sel, n) {
  setTimeout(() => {
    const l = document.querySelectorAll(sel);
    const e = l[n < 0 ? l.length + n : n];
    if (e) e.focus();
  }, 0);
}

/* ----- drag and drop (mouse; on touch screens the same actions are in menus) ----- */

const DRAG = 'application/x-story-page'; // a page being dragged
const DRAGI = 'application/x-story-item'; // an item being dragged

/** True if the drag carries our type. */
function carries(e, type) {
  return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], type) >= 0;
}

/**
 * Makes `el` accept dropped pages (type DRAG) or items (type DRAGI).
 * `onDrop(id)` runs with the dropped id. The element shows an outline while hovered.
 */
function dropZone(el, onDrop, type = DRAG) {
  el.addEventListener('dragenter', e => {
    if (carries(e, type)) {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('dropping');
    }
  });
  el.addEventListener('dragover', e => {
    if (carries(e, type)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'link';
      el.classList.add('dropping');
    }
  });
  el.addEventListener('dragleave', e => {
    if (!e.relatedTarget || !el.contains(e.relatedTarget)) el.classList.remove('dropping');
  });
  el.addEventListener('drop', e => {
    if (!carries(e, type)) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('dropping');
    const id = e.dataTransfer.getData(type);
    if (id && (type === DRAGI ? refExists(id) : byId(id))) onDrop(id);
  });
}

/**
 * Lets list entries be dragged into a new order. `list()` returns the array
 * (project.passages or project.items) and `id` is this entry's id. A bar shows
 * whether the dragged entry will land before or after this one.
 */
function reorderTarget(el, type, list, id) {
  function half(e) {
    const r = el.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2 ? 'before' : 'after';
  }
  function clear() {
    el.classList.remove('ins-before', 'ins-after');
  }
  el.addEventListener('dragover', e => {
    if (!carries(e, type)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clear();
    el.classList.add(`ins-${half(e)}`);
  });
  el.addEventListener('dragleave', clear);
  el.addEventListener('drop', e => {
    if (!carries(e, type)) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = half(e);
    const from = e.dataTransfer.getData(type);
    clear();
    if (!from || from === id) return;
    const arr = list();
    let fi = -1;
    let i;
    for (i = 0; i < arr.length; i++) if (arr[i].id === from) fi = i;
    if (fi < 0) return;
    const moved = arr.splice(fi, 1)[0];
    let ti = -1;
    for (i = 0; i < arr.length; i++) if (arr[i].id === id) ti = i;
    arr.splice(pos === 'before' ? ti : ti + 1, 0, moved);
    refresh();
  });
}

/**
 * A grip for dragging a row (a choice or a paragraph) to another place in its list, with a mouse, a pen or a finger (pointer
 * events, so touch works too). `row` is the whole row; rows of one list carry the same data-grip, `list()` gives the array and
 * `i` is the row's place in it. Alt+↑ / Alt+↓ in the row's text box does the same from the keyboard (see rowKeys).
 */
function rowGrip(row, kind, list, i) {
  row.dataset.grip = kind;
  const grip = h('span', {
    class: 'grip',
    title: 'Drag to move this up or down',
    'aria-hidden': 'true',
    text: '⋮⋮',
    onpointerdown: function (e) {
      if (e.button > 0) return;
      e.preventDefault();
      const rows = [].slice.call(row.parentNode.children).filter(r => r.dataset.grip === kind);
      let to = i;
      let pos = 'before';
      grip.setPointerCapture(e.pointerId);
      row.classList.add('dragging');
      const scroller = document.getElementById('main');
      function mark(y) {
        rows.forEach(r => r.classList.remove('ins-before', 'ins-after'));
        let best = rows[0];
        let bi = 0;
        rows.forEach((r, k) => {
          const b = r.getBoundingClientRect();
          if (y >= b.top) {
            best = r;
            bi = k;
          }
        });
        const b = best.getBoundingClientRect();
        pos = y > b.top + b.height / 2 ? 'after' : 'before';
        to = bi;
        if (bi !== i) best.classList.add(`ins-${pos}`);
      }
      /* near the top or bottom edge the list keeps scrolling even while a finger or mouse is held still, and the
         place it would land is worked out again each time, so a long list can be crossed in one drag */
      let lastY = e.clientY;
      const edge = () => {
        if (!grip.isConnected) return end({ type: 'pointercancel' }); // the row was redrawn away mid-drag (a keyboard undo): stop scrolling
        const sb = scroller.getBoundingClientRect();
        const before = scroller.scrollTop;
        if (lastY < sb.top + 40) scroller.scrollTop -= 12;
        else if (lastY > sb.bottom - 40) scroller.scrollTop += 12;
        if (scroller.scrollTop !== before) mark(lastY);
      };
      const timer = setInterval(edge, 16);
      const mv = ev => {
        lastY = ev.clientY;
        mark(lastY);
      };
      const end = ev => {
        clearInterval(timer);
        grip.removeEventListener('pointermove', mv);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        grip.removeEventListener('lostpointercapture', end);
        document.removeEventListener('keydown', esc, true);
        rows.forEach(r => r.classList.remove('ins-before', 'ins-after', 'dragging'));
        if (ev.type === 'pointerup' && ev.target === grip) {
          let dest = pos === 'before' ? to : to + 1;
          if (i < dest) dest--;
          if (dest !== i) {
            const arr = list();
            arr.splice(dest, 0, arr.splice(i, 1)[0]);
            refresh();
          }
        }
      };
      const esc = ev => {
        if (ev.key === 'Escape') {
          ev.stopPropagation();
          end({ type: 'pointercancel' });
        }
      };
      grip.addEventListener('pointermove', mv);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
      grip.addEventListener('lostpointercapture', end);
      document.addEventListener('keydown', esc, true);
    }
  });
  return grip;
}
/** Alt+↑ / Alt+↓ in a text box inside a reorderable row moves the row (the keyboard way to do what the grip does). */
function rowKeys(list, i, again) {
  return function (e) {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    const arr = list();
    if (j < 0 || j >= arr.length) return;
    e.preventDefault();
    arr.splice(j, 0, arr.splice(i, 1)[0]);
    refresh();
    again(j);
  };
}

/** Moves one entry of a list (pages or items) up or down by one place. */
function nudge(arr, entry, d) {
  const i = arr.indexOf(entry);
  const j = i + d;
  if (i < 0 || j < 0 || j >= arr.length) return;
  arr.splice(i, 1);
  arr.splice(j, 0, entry);
  refresh();
}

/* ----- right-click / long-press menus ----- */
/*
   ctxMenu(x, y, entries) opens a menu at a screen position. An entry is one of:
     { label, fn }                         a command
     { label, check: true }                a command shown with a check mark
     { label, sub: [entries] }             opens a sub-menu
     { label, disabled, title, danger, hint }
     { header: 'Text' }                    a small heading
     { sep: true }                         a divider
   Keyboard: arrows move, Right/Left open/close sub-menus, Enter chooses, Esc closes.
*/
let ctxOpenedAt = 0; // when the menu opened (the touch that opened it must not close it)
let viaKeys = false; // was the last input from the keyboard? (then focus the first entry)
document.addEventListener(
  'keydown',
  () => {
    viaKeys = true;
  },
  true
);
document.addEventListener(
  'mousedown',
  () => {
    viaKeys = false;
  },
  true
);

/** Closes every open menu. */
function closeCtx() {
  document.querySelectorAll('.ctx').forEach(n => {
    n.remove();
  });
}

/** Positions a menu so it stays on screen; sub-menus open beside their parent entry. */
function placeCtx(el, x, y, anchor) {
  el.style.left = '0px';
  el.style.top = '0px';
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let px = x;
  let py = y;
  if (anchor) {
    px = anchor.right - 2;
    if (px + w > vw - 4) px = anchor.left - w + 2;
    py = anchor.top - 4;
  }
  if (px + w > vw - 4) px = Math.max(4, vw - w - 4);
  if (py + hgt > vh - 4) py = Math.max(4, vh - hgt - 4);
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
}

/** Builds one menu panel (and, lazily, its sub-menus). */
function ctxPanel(entries, level) {
  entries = entries.filter(Boolean); // an entry switched off with `cond && {…}` is simply left out
  const panel = h('div', { class: 'ctx', role: 'menu' });
  function closeChild() {
    if (panel._child) {
      (function kill(n) {
        if (n._child) kill(n._child);
        n.remove();
      })(panel._child);
      panel._child = null;
    }
    panel.querySelectorAll('.open').forEach(b => {
      b.classList.remove('open');
    });
  }
  entries.forEach(en => {
    if (en.sep) {
      panel.appendChild(h('hr'));
      return;
    }
    if (en.header) {
      panel.appendChild(h('div', { class: 'ctxhd', text: en.header }));
      return;
    }
    const right = en.sub ? '▸' : en.check ? '✓' : en.hint || '';
    const b = h(
      'button',
      {
        type: 'button',
        role: 'menuitem',
        class: (en.danger ? 'danger' : '') + (en.check ? ' on' : ''),
        disabled: en.disabled ? true : null,
        title: en.title || null
      },
      [h('span', { class: 'cl', text: en.label }), right ? h('span', { class: 'cr', text: right }) : null]
    );
    function openSub() {
      closeChild();
      const child = ctxPanel(en.sub, level + 1);
      document.body.appendChild(child);
      placeCtx(child, 0, 0, b.getBoundingClientRect());
      b.classList.add('open');
      panel._child = child;
      child._parentBtn = b;
      return child;
    }
    b.addEventListener('mouseenter', () => {
      if (en.sub && !en.disabled) openSub();
      else closeChild();
    });
    b.addEventListener('click', e => {
      e.stopPropagation();
      if (en.disabled) return;
      if (en.sub) {
        openSub();
        return;
      }
      closeCtx();
      en.fn();
    });
    b.addEventListener('keydown', e => {
      const btns = [].slice.call(panel.querySelectorAll('button:not([disabled])'));
      const i = btns.indexOf(b);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        btns[(i + 1) % btns.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        btns[(i - 1 + btns.length) % btns.length].focus();
      } else if (e.key === 'ArrowRight' && en.sub) {
        e.preventDefault();
        const c = openSub();
        const f = c.querySelector('button:not([disabled])');
        if (f) f.focus();
      } else if (e.key === 'ArrowLeft' && level > 0) {
        e.preventDefault();
        const par = panel._parentBtn;
        panel.remove();
        if (par) {
          par.classList.remove('open');
          par.focus();
        }
      }
    });
    panel.appendChild(b);
  });
  return panel;
}

/** Opens a menu at (x, y). Pass focusFirst = true for keyboard users. */
/** The control that opened the last menu, so a dialog started from that menu can hand focus back to it. */
let menuOpener = null;
function ctxMenu(x, y, entries, focusFirst) {
  menuOpener = document.activeElement !== document.body ? document.activeElement : menuOpener;
  closeCtx();
  const root = ctxPanel(entries, 0);
  document.body.appendChild(root);
  placeCtx(root, x, y);
  ctxOpenedAt = Date.now();
  const f = root.querySelector('button:not([disabled])');
  if (f && focusFirst) f.focus();
  return root;
}
document.addEventListener(
  'mousedown',
  e => {
    if (Date.now() - ctxOpenedAt < 700) return; // ignore the touch that just opened the menu
    if (!e.target.closest || !e.target.closest('.ctx')) closeCtx();
  },
  true
);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCtx();
});
window.addEventListener('blur', closeCtx);
let ctxW = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth !== ctxW) closeCtx(); // only a change of width: a phone's on-screen keyboard changes the height and must not close a menu
  ctxW = window.innerWidth;
});
document.addEventListener(
  'wheel',
  e => {
    if (!e.target.closest || !e.target.closest('.ctx')) closeCtx();
  },
  { passive: true, capture: true }
);

/* ----- the page picker -----
   One search-and-choose box for "which page?": a choice's destination, the failed-roll page, and Ctrl+K (go to a page).
   Type a few letters (name, heading or text), arrow keys move, Enter picks, Esc closes. It follows the ARIA combobox
   pattern: the box keeps the focus and names the highlighted row with aria-activedescendant. */
let pickerEl = null;
let pickerOpener = null;
function closePicker(refocus) {
  if (!pickerEl) return;
  pickerEl.remove();
  pickerEl = null;
  document.removeEventListener('mousedown', pickerOutside, true);
  window.removeEventListener('resize', pickerResize);
  if (refocus && pickerOpener && pickerOpener.isConnected) pickerOpener.focus({ preventScroll: true });
  pickerOpener = null;
}
const closePickerNow = () => closePicker(false);
let pickerW = 0;
/** The picker closes when the window gets narrower or wider, not when only its height changes (the on-screen keyboard of a phone). */
function pickerResize() {
  if (window.innerWidth !== pickerW) closePickerNow();
}
function pickerOutside(e) {
  if (pickerEl && !pickerEl.contains(e.target)) closePicker(false);
}
/** The first words a page says, for telling pages apart in a list. */
function pageSnippet(p, n) {
  const b = p.blocks.find(x => x.text && x.text.trim());
  const t = b ? b.text.replace(/\s+/g, ' ').trim() : '';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
/** True if the page has no words yet. */
const pageEmpty = p => !p.blocks.some(b => b.text && b.text.trim());
/** Pages matching what was typed, best first: names that start with it, then words in a name, then names, headings, text. */
function pickerMatches(q) {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const out = [];
  project.passages.forEach((p, idx) => {
    const name = pname(p).toLowerCase();
    const head = (p.heading || '').toLowerCase();
    const text = p.blocks.map(b => b.text).join(' ').toLowerCase();
    let worst = 0;
    for (const t of tokens) {
      let sc;
      if (name.startsWith(t)) sc = 0;
      else if (name.includes(` ${t}`)) sc = 1;
      else if (name.includes(t)) sc = 2;
      else if (head.includes(t)) sc = 3;
      else if (text.includes(t)) sc = 4;
      else return;
      worst = Math.max(worst, sc);
    }
    out.push({ p, sc: worst, idx });
  });
  out.sort((a, b) => a.sc - b.sc || a.idx - b.idx);
  return out.map(x => x.p);
}
/**
 * Opens the picker. o = { anchor (element to sit under, or none to centre), title, current (page id shown first),
 * newLabel (name for a new page), newFirst (put "new page" first when nothing is typed), allowNew,
 * onPick(page), onNew(name) }.
 */
function pagePicker(o) {
  closeCtx();
  closePicker(false);
  pickerOpener = document.activeElement !== document.body ? document.activeElement : null;
  const listId = `pk${Date.now()}`;
  const input = h('input', {
    type: 'text',
    class: 'in pk-in',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': listId,
    'aria-autocomplete': 'list',
    'aria-label': o.title || 'Go to a page',
    placeholder: o.title || 'Type to find a page…',
    autocomplete: 'off',
    spellcheck: 'false'
  });
  const list = h('ul', { class: 'pk-list', id: listId, role: 'listbox', 'aria-label': 'Pages' });
  const prev = h('div', { class: 'pk-prev' });
  const foot = h('div', { class: 'pk-foot hint', text: '↑ ↓ choose · Enter picks · Esc closes' });
  let rows = []; // { el, page | null (new page) }
  let at = 0;
  function newName() {
    return input.value.trim() || o.newLabel || '';
  }
  function icons(p) {
    return [
      p.id === project.start ? h('span', { class: 'pico', title: 'First page' }, [icon('flag', 13)]) : null,
      p.ending && p.valence === 'good' ? h('span', { class: 'pico' }, [icon('smile', 13)]) : null,
      p.ending && p.valence === 'bad' ? h('span', { class: 'pico' }, [icon('frown', 13)]) : null,
      p.ending && !p.valence ? h('span', { class: 'tag end neutral', text: 'end' }) : null,
      p.todo ? h('span', { class: 'pico todo' }, [icon('todo', 13)]) : null,
      pageEmpty(p) ? h('span', { class: 'tag', text: 'no text yet' }) : null
    ];
  }
  function build() {
    const m = pickerMatches(input.value);
    let pages;
    if (m) pages = m.slice(0, 60);
    else {
      const seen = new Set();
      const recent = [];
      if (o.current && byId(o.current)) recent.push(byId(o.current));
      for (let j = hist.list.length - 1; j >= 0 && recent.length < 6; j--) {
        const p = byId(hist.list[j]);
        if (p && !recent.includes(p) && p.id !== selId) recent.push(p);
      }
      recent.forEach(p => seen.add(p.id));
      pages = recent.concat(project.passages.filter(p => !seen.has(p.id))).slice(0, 60);
    }
    rows = pages.map(p => ({ p }));
    const typed = input.value.trim();
    if (o.allowNew) {
      const nr = { p: null };
      if (!rows.length || (!typed && o.newFirst)) rows.unshift(nr);
      else rows.push(nr);
    }
    list.textContent = '';
    rows.forEach((r, i) => {
      const id = `${listId}-${i}`;
      r.el = h(
        'li',
        {
          id,
          role: 'option',
          class: r.p ? 'pk-row' : 'pk-row pk-new',
          'aria-selected': 'false',
          onmousedown: e => e.preventDefault(),
          onmousemove: () => {
            if (at !== i) mark(i);
          },
          onclick: () => choose(i)
        },
        r.p
          ? [
              h('span', { class: 'pk-nm', text: pname(r.p) + (r.p.id === o.current ? '  (current)' : '') }),
              h('span', { class: 'pk-ic' }, icons(r.p)),
              h('span', { class: 'pk-sn', text: r.p.heading ? `${r.p.heading} · ${pageSnippet(r.p, 70)}` : pageSnippet(r.p, 80) })
            ]
          : [h('span', { class: 'pk-nm', text: newName() ? `＋ New page “${newName()}”` : '＋ New page' })]
      );
      list.appendChild(r.el);
    });
    at = Math.min(at, Math.max(0, rows.length - 1));
    mark(at, true);
    foot.textContent = `↑ ↓ choose · Enter picks${o.allowNew && typed ? ` · Ctrl+Enter makes a new page “${typed.length > 24 ? `${typed.slice(0, 23)}…` : typed}”` : ''} · Esc closes`;
  }
  function mark(i, quiet) {
    at = i;
    rows.forEach((r, j) => {
      const on = j === i;
      r.el.classList.toggle('on', on);
      r.el.setAttribute('aria-selected', String(on));
    });
    if (rows[i]) {
      input.setAttribute('aria-activedescendant', rows[i].el.id);
      if (!quiet) rows[i].el.scrollIntoView({ block: 'nearest' });
      const p = rows[i].p;
      prev.textContent = '';
      if (p) {
        const t = pageSnippet(p, 200);
        prev.appendChild(h('div', { class: 'pk-ptitle', text: p.heading || pname(p) }));
        prev.appendChild(h('div', { class: 'pk-ptext', text: t || 'No text on this page yet.' }));
        prev.appendChild(
          h('div', { class: 'hint', text: p.ending ? 'An ending.' : `${p.choices.length} ${p.choices.length === 1 ? 'choice' : 'choices'}.` })
        );
      } else prev.appendChild(h('div', { class: 'pk-ptext', text: 'Makes a new, empty page and opens it.' }));
    } else input.removeAttribute('aria-activedescendant');
  }
  function choose(i, forceNew) {
    const r = rows[i];
    const nm = newName();
    closePicker(false);
    if (forceNew || (r && !r.p)) {
      if (o.onNew) o.onNew(nm);
    } else if (r && o.onPick) o.onPick(r.p);
  }
  input.addEventListener('input', () => {
    at = 0;
    build();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rows.length) mark((at + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) mark((at - 1 + rows.length) % rows.length);
    } else if (e.key === 'Home' && !input.value) {
      e.preventDefault();
      mark(0);
    } else if (e.key === 'End' && !input.value) {
      e.preventDefault();
      mark(rows.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && o.allowNew && input.value.trim()) choose(at, true);
      else if (rows.length) choose(at);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePicker(true);
    }
  });
  pickerEl = h('div', { class: `picker${o.anchor ? '' : ' centre'}`, role: 'dialog', 'aria-label': o.title || 'Go to a page' }, [
    h('div', { class: 'pk-top' }, [input]),
    list,
    prev,
    foot
  ]);
  document.body.appendChild(pickerEl);
  if (o.anchor && window.innerWidth > 600) {
    const r = o.anchor.getBoundingClientRect();
    const w = Math.min(440, window.innerWidth - 16);
    pickerEl.style.width = `${Math.max(w, Math.min(r.width, window.innerWidth - 16))}px`;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - parseFloat(pickerEl.style.width) - 8));
    pickerEl.style.left = `${left}px`;
    const room = window.innerHeight - r.bottom;
    if (room < 340 && r.top > room) pickerEl.style.bottom = `${window.innerHeight - r.top + 4}px`;
    else pickerEl.style.top = `${r.bottom + 4}px`;
  }
  build();
  document.addEventListener('mousedown', pickerOutside, true);
  pickerW = window.innerWidth;
  window.addEventListener('resize', pickerResize);
  input.focus();
}

/**
 * Touch screens have no right button, so holding a finger on `el` for half a
 * second calls fn(x, y). Moving the finger (scrolling) cancels it.
 */
function longPress(el, fn) {
  let t = 0;
  let sx = 0;
  let sy = 0;
  let fired = false;
  let upAt = 0;
  function cancel() {
    clearTimeout(t);
    t = 0;
  }
  el.addEventListener(
    'touchstart',
    e => {
      if (e.touches.length !== 1) return;
      const c = e.touches[0];
      sx = c.clientX;
      sy = c.clientY;
      fired = false;
      cancel();
      t = setTimeout(() => {
        t = 0;
        if (!document.querySelector('.ctx')) {
          fired = true;
          fn(sx, sy);
        }
      }, 550);
    },
    { passive: true }
  );
  el.addEventListener(
    'touchmove',
    e => {
      const c = e.touches[0];
      if (Math.abs(c.clientX - sx) + Math.abs(c.clientY - sy) > 10) cancel();
    },
    { passive: true }
  );
  el.addEventListener('touchend', () => {
    cancel();
    if (fired) upAt = Date.now();
  });
  el.addEventListener('touchcancel', cancel);
  /* The finger lifting after a long press must not also "click" the thing underneath. */
  el.addEventListener(
    'click',
    e => {
      if (Date.now() - upAt < 500) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
}

/* ----- tiny icons -----
   One small drawing each, made with DOM calls (never innerHTML) and colored by CSS, so they follow light/dark mode.
   gift = an object, heart = a state, smile / frown = good / bad ending, flag = the first page. */
const SVGNS = 'http://www.w3.org/2000/svg';
const ICON_PARTS = {
  gift: [
    ['rect', { x: 2.5, y: 7, width: 11, height: 7, rx: 1 }],
    ['rect', { x: 2, y: 4.5, width: 12, height: 2.5, rx: 0.8 }],
    ['path', { d: 'M8 4.5V14M8 4.5C6 1.5 3.5 2.5 5 4.5M8 4.5C10 1.5 12.5 2.5 11 4.5' }]
  ],
  heart: [['path', { d: 'M8 13.8C3 10.4 2 8 2 6.2A3 3 0 0 1 8 5A3 3 0 0 1 14 6.2C14 8 13 10.4 8 13.8Z', fill: 'currentColor' }]],
  smile: [
    ['circle', { cx: 8, cy: 8, r: 6 }],
    ['circle', { cx: 5.8, cy: 6.6, r: 0.9, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 10.2, cy: 6.6, r: 0.9, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'M5.2 9.6Q8 12.4 10.8 9.6' }]
  ],
  frown: [
    ['circle', { cx: 8, cy: 8, r: 6 }],
    ['circle', { cx: 5.8, cy: 6.6, r: 0.9, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 10.2, cy: 6.6, r: 0.9, fill: 'currentColor', stroke: 'none' }],
    ['path', { d: 'M5.2 11.4Q8 8.6 10.8 11.4' }]
  ],
  flag: [], // drawn below: a pole and a checkered cloth
  /* a number (stat): a bar partly filled; a dice roll (skill check): a die showing five */
  meter: [
    ['rect', { x: 1.5, y: 5.5, width: 13, height: 5, rx: 1.2 }],
    ['rect', { x: 2.6, y: 6.6, width: 6, height: 2.8, rx: 0.5, fill: 'currentColor', stroke: 'none' }]
  ],
  dice: [
    ['rect', { x: 2, y: 2, width: 12, height: 12, rx: 2.2 }],
    ['circle', { cx: 5.2, cy: 5.2, r: 1, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 10.8, cy: 5.2, r: 1, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 8, cy: 8, r: 1, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 5.2, cy: 10.8, r: 1, fill: 'currentColor', stroke: 'none' }],
    ['circle', { cx: 10.8, cy: 10.8, r: 1, fill: 'currentColor', stroke: 'none' }]
  ],
  /* tab icons */
  pen: [
    ['path', { d: 'M8.6 1.4L13.6 6.4L7.4 13L2.6 13.4L3 8.6Z' }],
    ['path', { d: 'M2.6 13.4L6.6 9.4' }],
    ['circle', { cx: 7.6, cy: 8.4, r: 1 }]
  ],
  mapi: [
    ['rect', { x: 1.5, y: 2, width: 5.5, height: 4, rx: 0.8 }],
    ['rect', { x: 9, y: 10, width: 5.5, height: 4, rx: 0.8 }],
    ['path', { d: 'M7 6L9 10', 'stroke-dasharray': '0.9 1.4' }]
  ],
  /* Givens: a hand-drawn 0, 1, X and Y, two by two */
  givens: [
    ['path', { d: 'M4.3 1.7C2.7 1.5 2.1 3.5 2.2 4.6C2.3 6.2 3.2 7.2 4.4 7.1C5.9 7 6.5 5.3 6.4 4.1C6.3 2.6 5.5 1.7 4.2 1.9' }],
    ['path', { d: 'M10.3 2.8C10.9 2.4 11.5 1.9 11.9 1.4C11.9 3.3 11.8 5.2 11.9 7.1M10.5 7.2C11.4 7.1 12.3 7.1 13.2 7.2' }],
    ['path', { d: 'M2.3 9.3C3.6 10.9 5 12.6 6.4 14.4M6.2 9.1C4.9 10.8 3.6 12.5 2.4 14.4' }],
    ['path', { d: 'M9.8 9.2C10.5 10.2 11.1 11 11.8 11.8M13.9 9C13.1 10.3 12.5 11.1 11.8 11.8C11.7 12.8 11.8 13.7 11.9 14.6' }]
  ],
  /* a bookmark: the author's "unfinished" flag on a page (filled when on, by the .on rule in ui.css) */
  todo: [['path', { d: 'M4 2.2H12V14L8 10.9L4 14Z' }]],
  /* the Map's controls */
  'mv-flow': [
    ['rect', { x: 1, y: 6.2, width: 3.2, height: 3.6, rx: 0.6 }],
    ['rect', { x: 6.4, y: 2, width: 3.2, height: 3.6, rx: 0.6 }],
    ['rect', { x: 6.4, y: 10.4, width: 3.2, height: 3.6, rx: 0.6 }],
    ['rect', { x: 11.8, y: 6.2, width: 3.2, height: 3.6, rx: 0.6 }],
    ['path', { d: 'M4.2 8L6.4 3.8M4.2 8L6.4 12.2M9.6 3.8L11.8 8M9.6 12.2L11.8 8' }]
  ],
  'mv-down': [
    ['rect', { x: 6.4, y: 1, width: 3.2, height: 3.2, rx: 0.6 }],
    ['rect', { x: 1.2, y: 7, width: 3.2, height: 3.2, rx: 0.6 }],
    ['rect', { x: 11.6, y: 7, width: 3.2, height: 3.2, rx: 0.6 }],
    ['rect', { x: 1.2, y: 12.4, width: 3.2, height: 2.6, rx: 0.6 }],
    ['path', { d: 'M8 4.2V5.6M2.8 5.6H13.2M2.8 5.6V7M13.2 5.6V7M2.8 10.2V12.4' }]
  ],
  'mv-spine': [
    ['path', { d: 'M1 8H15', 'stroke-width': 2.6 }],
    ['path', { d: 'M4 8L5.4 3.4M12 8L10.6 12.6' }],
    ['circle', { cx: 5.6, cy: 2.8, r: 1.4 }],
    ['circle', { cx: 10.4, cy: 13.2, r: 1.4 }]
  ],
  'mv-lanes': [
    ['rect', { x: 1.5, y: 2, width: 13, height: 3, rx: 0.8 }],
    ['rect', { x: 1.5, y: 6.5, width: 13, height: 3, rx: 0.8 }],
    ['rect', { x: 1.5, y: 11, width: 13, height: 3, rx: 0.8 }]
  ],
  'mv-shape': [
    ['circle', { cx: 2.8, cy: 8, r: 1.7 }],
    ['circle', { cx: 8, cy: 3.6, r: 1.7 }],
    ['circle', { cx: 8, cy: 12.4, r: 1.7 }],
    ['circle', { cx: 13.2, cy: 8, r: 1.7 }],
    ['path', { d: 'M4.3 7L6.6 4.6M4.3 9L6.6 11.4M9.4 4.6L11.7 7M9.4 11.4L11.7 9' }]
  ],
  'mv-river': [
    ['path', { d: 'M1 4.5C5.5 4.5 6 8 10 8S13 6 15 6', 'stroke-width': 2.4 }],
    ['path', { d: 'M1 12C5.5 12 6.5 8.8 9 8.4', 'stroke-width': 2.4 }]
  ],
  'mv-arc': [
    ['path', { d: 'M1.5 12.5H14.5' }],
    ['path', { d: 'M3 12.5C3 4.5 8 4.5 8 12.5M8 12.5C8 7.5 13 7.5 13 12.5' }]
  ],
  'mv-matrix': [
    ['rect', { x: 2, y: 2, width: 12, height: 12, rx: 1 }],
    ['path', { d: 'M6 2V14M10 2V14M2 6H14M2 10H14' }],
    ['rect', { x: 6.4, y: 2.4, width: 3.2, height: 3.2, fill: 'currentColor', stroke: 'none' }],
    ['rect', { x: 10.4, y: 6.4, width: 3.2, height: 3.2, fill: 'currentColor', stroke: 'none' }]
  ],
  'mc-type': [
    ['rect', { x: 1.8, y: 3.5, width: 5, height: 4, rx: 0.8 }],
    ['rect', { x: 9.2, y: 3.5, width: 5, height: 4, rx: 0.8, fill: 'currentColor' }],
    ['rect', { x: 5.4, y: 9.5, width: 5, height: 4, rx: 0.8 }]
  ],
  'mc-odds': [
    ['circle', { cx: 8, cy: 8, r: 5.8 }],
    ['path', { d: 'M8 2.2A5.8 5.8 0 0 0 8 13.8Z', fill: 'currentColor' }]
  ],
  'mc-heat': [['path', { d: 'M8 1.6C8.8 4.2 12.2 5.6 12.2 9.6A4.2 4.2 0 0 1 3.8 9.6C3.8 7.6 5 6.6 5.8 5.4C6.4 6.2 6.8 6.4 7.2 6.4C7.2 4.6 7.5 3.2 8 1.6Z' }]],
  'mc-track': [
    ['path', { d: 'M3 13C6.4 13 5.6 9 8 9S9.6 5 13 3' }],
    ['circle', { cx: 3, cy: 13, r: 1.3, fill: 'currentColor' }],
    ['circle', { cx: 13, cy: 3, r: 1.3, fill: 'currentColor' }]
  ],
  'mc-as': [
    ['circle', { cx: 8, cy: 5, r: 2.6 }],
    ['path', { d: 'M2.8 14C2.8 10.6 5 9.4 8 9.4S13.2 10.6 13.2 14' }]
  ],
  'mc-merge': [['path', { d: 'M1.5 4H5C8 4 8 8 11 8H14.5M1.5 12H5C8 12 8 8 11 8' }]],
  'mc-size': [
    ['rect', { x: 1.5, y: 7.5, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 10.5, y: 2, width: 4, height: 4, rx: 0.8 }]
  ],
  /* the two side lists: a window with its left or right panel marked */
  sidel: [
    ['rect', { x: 2, y: 3, width: 12, height: 10, rx: 1.6 }],
    ['path', { d: 'M6.2 3V13' }]
  ],
  sider: [
    ['rect', { x: 2, y: 3, width: 12, height: 10, rx: 1.6 }],
    ['path', { d: 'M9.8 3V13' }]
  ],
  save: [['path', { d: 'M8 2.2V10M4.6 6.8L8 10.2L11.4 6.8M2.6 10.6V13.6H13.4V10.6' }]],
  play: [
    ['circle', { cx: 8, cy: 8, r: 6.6 }],
    ['path', { d: 'M6.6 5.1L11 8L6.6 10.9Z', fill: 'currentColor', stroke: 'none' }]
  ]
};
/* The checkered flag: a pole and a cloth of three by two squares, alternately filled (readable even when tiny). */
(() => {
  const parts = [
    ['path', { d: 'M3.5 1.5V14.5' }],
    ['rect', { x: 3.5, y: 2.5, width: 10, height: 7, class: 'cloth', stroke: 'none' }]
  ];
  let c;
  let r;
  const cw = 10 / 3;
  const rh = 3.5;
  for (r = 0; r < 2; r++)
    for (c = 0; c < 3; c++)
      if ((r + c) % 2 === 0) parts.push(['rect', { x: 3.5 + c * cw, y: 2.5 + r * rh, width: cw, height: rh, fill: 'currentColor', stroke: 'none' }]);
  parts.push(['rect', { x: 3.5, y: 2.5, width: 10, height: 7, fill: 'none' }]);
  ICON_PARTS.flag = parts;
})();
/** Returns a small <svg> icon: kind is gift, heart, smile, frown or flag. */
function icon(kind, size) {
  const svg = document.createElementNS(SVGNS, 'svg');
  let k;
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', size || 14);
  svg.setAttribute('height', size || 14);
  svg.setAttribute('class', `ico ico-${kind}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  (ICON_PARTS[kind] || []).forEach(part => {
    const e = document.createElementNS(SVGNS, part[0]);
    for (k in part[1]) e.setAttribute(k, part[1][k]);
    svg.appendChild(e);
  });
  return svg;
}
/** The icon for an item: a gift for an object, a heart for a state. */
/** The Items tab icon: a gift with a heart overlapping its corner. */
function itemsTabIcon(size) {
  const svg = document.createElementNS(SVGNS, 'svg');
  const g = icon('gift', 12);
  const hrt = icon('heart', 10);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', size || 16);
  svg.setAttribute('height', size || 16);
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  g.setAttribute('x', 0);
  g.setAttribute('y', 3);
  hrt.setAttribute('x', 6);
  hrt.setAttribute('y', 0);
  svg.appendChild(g);
  svg.appendChild(hrt);
  return svg;
}
function itemIcon(it, size) {
  return icon(it && it.kind === 'state' ? 'heart' : it && it.kind === 'stat' ? 'meter' : 'gift', size);
}

/**
 * The app logo: a heart holding four smaller icons in two rows of two (checkered flag, smiling face, frowning face, gift).
 * `height` is in pixels. Colors come from CSS (.logo), so it follows light and dark mode.
 */
function logo(height) {
  const svg = document.createElementNS(SVGNS, 'svg');
  const heart = document.createElementNS(SVGNS, 'path');
  svg.setAttribute('viewBox', '6 8 52 49');
  svg.setAttribute('height', height);
  svg.setAttribute('width', Math.round((height * 52) / 49));
  svg.setAttribute('class', 'logo');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  heart.setAttribute('class', 'logo-heart');
  heart.setAttribute('transform', 'scale(4)');
  heart.setAttribute('d', 'M8 13.8C3 10.4 2 8 2 6.2A3 3 0 0 1 8 5A3 3 0 0 1 14 6.2C14 8 13 10.4 8 13.8Z');
  svg.appendChild(heart);
  [
    ['flag', 19.5, 21],
    ['smile', 33.5, 21],
    ['frown', 19.5, 34],
    ['gift', 33.5, 34]
  ].forEach(a => {
    const ic = icon(a[0], 11);
    ic.setAttribute('x', a[1]);
    ic.setAttribute('y', a[2]);
    svg.appendChild(ic);
  });
  return svg;
}

/**
 * The white paint behind the splash: ONE unbroken movement of a loaded brush, scrubbed back and forth from top
 * to bottom without lifting, the way a painter blocks in a background. It has
 *   - a body that follows the whole zigzag, with rounded turns at each end and edges roughened by a filter,
 *   - loose bristles along the edges and dry streaks along each pass (the streaks in a dark tone),
 *   - a frayed tail of separate bristle tips where the paint finally runs out.
 * With `animate`, everything is drawn on in the order the brush reaches it: the body by growing its own path
 * point by point, and each bristle and streak as the brush passes its start. No masks and no long dashes are
 * used (browsers draw those unreliably on a stretched drawing), so no paint can appear before the brush gets there.
 * A fixed seed keeps it identical every time.
 */
function brushStroke(animate) {
  const svg = document.createElementNS(SVGNS, 'svg');
  let seed = 7;
  let i;
  let j;
  let k;
  function rnd() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  function el(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function f(n) {
    return n.toFixed(1);
  }
  svg.setAttribute('viewBox', '0 0 600 340');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'brush');
  svg.setAttribute('aria-hidden', 'true');
  const ROWS = 6;
  const hw = 27;
  const rows = [];
  for (i = 0; i < ROWS; i++) {
    const y = 58 + i * 45;
    const tilt = -0.11 + (rnd() - 0.5) * 0.04;
    const l = 40 + rnd() * 30 + (i % 2) * 10;
    const r = 545 - rnd() * 35 - ((i + 1) % 2) * 15;
    rows.push({ y, tilt, l, r, ltr: i % 2 === 0 });
  }
  function yAt(row, x) {
    return row.y + (x - 300) * row.tilt;
  }

  /* the center line of the whole movement: right along row 0, round the end, back along row 1, and so on.
     Its length is worked out here, from the same numbers that make the path, instead of asking the browser to measure it
     (getTotalLength / getPointAtLength cost about 100 ms at start-up, measured, and the splash is the first thing on screen):
     `poly` is the line cut into short straight pieces, `cum` the distance along it at each piece, and rowA[n] / rowB[n]
     the distance at the start / end of pass n, so the brush's position along the movement is known. */
  let d = '';
  const poly = [];
  const cum = [];
  const rowA = [];
  const rowB = [];
  const F = v => +f(v); // the path text rounds to a tenth; so does the measuring
  function addPoint(x, y) {
    const q = poly[poly.length - 1];
    cum.push(q ? cum[cum.length - 1] + Math.hypot(x - q[0], y - q[1]) : 0);
    poly.push([x, y]);
  }
  /** Adds a curve (1 control point = quadratic, 2 = cubic) from the line's last point, in `steps` straight pieces. */
  function addCurve(ctrl, x3, y3, steps) {
    const [x0, y0] = poly[poly.length - 1];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      if (ctrl.length === 1) addPoint(u * u * x0 + 2 * u * t * ctrl[0][0] + t * t * x3, u * u * y0 + 2 * u * t * ctrl[0][1] + t * t * y3);
      else
        addPoint(
          u * u * u * x0 + 3 * u * u * t * ctrl[0][0] + 3 * u * t * t * ctrl[1][0] + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * ctrl[0][1] + 3 * u * t * t * ctrl[1][1] + t * t * t * y3
        );
    }
  }

  const ends = [];
  rows.forEach((row, n) => {
    const x0 = row.ltr ? row.l : row.r;
    const x1 = row.ltr ? row.r : row.l;
    const mx = (x0 + x1) / 2;
    if (n === 0) {
      d += `M${f(x0)} ${f(yAt(row, x0))}`;
      addPoint(F(x0), F(yAt(row, x0)));
    } else {
      // the turn: sweep out past the end and come back down into the next pass
      const prev = rows[n - 1];

      const px = prev.ltr ? prev.r : prev.l;
      const out = prev.ltr ? 34 : -34;
      d += ` C${f(px + out)} ${f(yAt(prev, px))} ${f(x0 + out)} ${f(yAt(row, x0))} ${f(x0)} ${f(yAt(row, x0))}`;
      addCurve(
        [
          [F(px + out), F(yAt(prev, px))],
          [F(x0 + out), F(yAt(row, x0))]
        ],
        F(x0),
        F(yAt(row, x0)),
        24
      );
    }
    rowA.push(cum[cum.length - 1]);
    const qy = yAt(row, mx) + (rnd() - 0.5) * 10;
    d += ` Q${f(mx)} ${f(qy)} ${f(x1)} ${f(yAt(row, x1))}`;
    addCurve([[F(mx), F(qy)]], F(x1), F(yAt(row, x1)), 32);
    rowB.push(cum[cum.length - 1]);
    ends.push([x1, yAt(row, x1)]);
  });
  const total = cum[cum.length - 1];
  const last = rows[ROWS - 1];
  const tailDir = last.ltr ? 1 : -1;
  const tail = ends[ROWS - 1];
  const paint = el('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  /* the body edges are roughened once by a small displacement filter, stretched along the stroke like bristle marks */
  const rough = el('filter', { id: 'se-rough', x: '-5%', y: '-10%', width: '110%', height: '120%' });
  rough.appendChild(el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.02 0.16', numOctaves: '2', seed: '4', result: 'n' }));
  rough.appendChild(el('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '16', xChannelSelector: 'R', yChannelSelector: 'G' }));
  const fdefs = el('defs', {});
  fdefs.appendChild(rough);
  svg.appendChild(fdefs);
  const body = el('g', { filter: 'url(#se-rough)' });
  const bodies = [];
  bodies.push(el('path', { d, stroke: '#fff', 'stroke-width': hw * 1.75 }));
  bodies.push(el('path', { d, stroke: '#fff', 'stroke-width': hw * 1.5, transform: 'translate(4 -5)', opacity: '0.9' }));
  bodies.forEach(b => {
    body.appendChild(b);
  });
  paint.appendChild(body);
  /* every bristle and streak is a straight line drawn in the brush's direction; `marks` remembers where each starts */
  const marks = [];
  function mark(row, xa, xb, off, attrs, tailMark) {
    const a = row.ltr ? xa : xb; // draw from where the brush arrives first
    const b = row.ltr ? xb : xa;
    attrs.d = `M${f(a)} ${f(yAt(row, a) + off)} L${f(b)} ${f(yAt(row, b) + off + (rnd() - 0.5) * 3)}`;
    const e = el('path', attrs);
    paint.appendChild(e);
    marks.push({ el: e, row: rows.indexOf(row), x: a, len: Math.abs(b - a) * 1.01, tail: !!tailMark });
  }
  /* frayed tail: bristle tips running on past the last pass */
  for (j = 0; j < 26; j++) {
    const off = (rnd() * 2 - 1) * hw * 0.9;
    const len = 30 + rnd() * 110 * (1 - (Math.abs(off) / hw) * 0.5);
    const sx = tail[0] - tailDir * 18;
    const ex = tail[0] + tailDir * len;
    mark(
      last,
      Math.min(sx, ex),
      Math.max(sx, ex),
      off,
      { stroke: '#fff', 'stroke-width': (1 + rnd() * 3.4).toFixed(1), 'stroke-linecap': 'butt', opacity: (0.6 + rnd() * 0.4).toFixed(2) },
      true
    );
  }
  /* ragged edges: loose bristles along the top and bottom of every pass, some running a little outside the body */
  rows.forEach(row => {
    for (j = 0; j < 22; j++) {
      const side = j % 2 ? 1 : -1;
      const eo = side * hw * (0.78 + rnd() * 0.36);
      const b0 = row.l + rnd() * (row.r - row.l) * 0.7;
      const b1 = Math.min(row.r + 8, b0 + 40 + rnd() * 220);
      mark(row, b0, b1, eo, {
        stroke: '#fff',
        'stroke-width': (1 + rnd() * 2.6).toFixed(1),
        'stroke-linecap': 'butt',
        opacity: (0.45 + rnd() * 0.5).toFixed(2)
      });
    }
  });
  /* dry streaks along each pass */
  rows.forEach(row => {
    for (j = 0; j < 9; j++) {
      const so = (rnd() * 2 - 1) * hw * 0.85;
      const a0 = row.l + rnd() * (row.r - row.l) * 0.6;
      const a1 = Math.min(row.r - 10, a0 + 60 + rnd() * 200);
      mark(row, a0, a1, so, {
        stroke: 'currentColor',
        'stroke-width': (0.5 + rnd() * 1.4).toFixed(2),
        opacity: (0.2 + rnd() * 0.3 * (Math.abs(so) / hw + 0.4)).toFixed(2)
      });
    }
  });
  svg.appendChild(paint);
  if (animate) {
    /* nothing shows until the first animation frame has set every dash (some browsers draw a dot for an empty dash) */
    paint.setAttribute('visibility', 'hidden');
    marks.forEach(m => {
      m.el.setAttribute('stroke-dasharray', `${m.len} ${m.len}`);
      m.el.setAttribute('stroke-dashoffset', m.len);
    });
  }
  /* How far apart (in pixels along the path) the brush body is sampled for the growing line: finer than the brush moves in a frame
     (about 30 px at its fastest), and a chord this long on the tightest turn is well under a pixel off the curve. */
  const SAMPLE_PX = 12;
  /** Starts the brush moving. Call once the brush is in the page (lengths can only be measured then). */
  svg.play = () => {
    if (!animate) return;
    const pts = []; // the body sampled every SAMPLE_PX along its length, as "x y" text
    for (let q = 0, N = Math.ceil(total / SAMPLE_PX), at = 1; q <= N; q++) {
      const want = (total * q) / N;
      while (at < cum.length - 1 && cum[at] < want) at++;
      const span = cum[at] - cum[at - 1] || 1;
      const w = Math.max(0, Math.min(1, (want - cum[at - 1]) / span));
      pts.push(`${f(poly[at - 1][0] + (poly[at][0] - poly[at - 1][0]) * w)} ${f(poly[at - 1][1] + (poly[at][1] - poly[at - 1][1]) * w)}`);
    }
    /** The body as far as the brush has got: the first `upTo` of the sampled points. */
    function bodyTo(s) {
      const n = Math.max(1, Math.round(pts.length * Math.min(1, s / total)));
      return `M${pts.slice(0, n + 1).join(' L')}`;
    }
    /* where along the whole movement each mark begins */
    marks.forEach(m => {
      const row = rows[m.row];
      const frac = row.ltr ? (m.x - row.l) / (row.r - row.l) : (row.r - m.x) / (row.r - row.l);
      m.at = m.tail ? rowB[m.row] - 18 : rowA[m.row] + Math.max(0, Math.min(1, frac)) * (rowB[m.row] - rowA[m.row]);
    });
    bodies.forEach(b => {
      b.setAttribute('d', bodyTo(0));
    });
    const reach = total + 160;
    const DUR = 1650;
    let t0 = null;
    let frames = 0;
    const raf =
      window.requestAnimationFrame ||
      (fn =>
        setTimeout(() => {
          fn(Date.now());
        }, 16));
    function frame(now) {
      if (t0 === null) t0 = now;
      const x = Math.min(1, (now - t0) / DUR); // ease in and out, like an arm
      const e = x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
      const s = reach * e; // how far the brush has traveled
      if (s <= total + 5) {
        const bd = bodyTo(s);
        bodies.forEach(b => {
          b.setAttribute('d', bd);
        });
      }
      marks.forEach(m => {
        const p = Math.max(0, Math.min(1, (s - m.at) / m.len));
        m.el.setAttribute('stroke-dashoffset', (m.len * (1 - p)).toFixed(1));
      });
      if (++frames === 1) paint.removeAttribute('visibility');
      if (x < 1 && svg.isConnected !== false) raf(frame);
    }
    raf(frame);
  };
  return svg;
}
