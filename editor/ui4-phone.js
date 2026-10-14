/* ============================================================================
   PHONE: what makes the editor usable with thumbs: typing mode (while a text box has the on-screen keyboard, everything folds away
   except one slim row of keys above it) and swiping the page-name bar to the next or previous page.
   The layout itself (one-row top bar, tabs at the bottom, pinned page-name bar) is CSS under "Phones" in ui.css.
   Copyright (c) 2026 JNFoo. MIT License.
   ============================================================================ */

let typing = false;
const TYPING_FIELD = 'textarea, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=file]):not([type=color])';

/** Typing mode only exists on a phone-sized touch screen (a test can force touch with window.__editor.touch(true)). */
const typingPossible = () => phoneLayout() && touchOnly();

/** The slim row above the keyboard: add a paragraph or a choice, Undo, Redo, and Done (closes the keyboard and brings everything back). */
function renderKeyrow() {
  const k = $('#keyrow');
  if (!k) return;
  k.textContent = '';
  const p = view === 'write' ? byId(selId) : null;
  const key = (text, label, fn, cls, off) =>
    h('button', {
      type: 'button',
      class: `btn small ${cls || ''}`,
      text,
      'aria-label': label,
      title: label,
      disabled: off ? true : null,
      onmousedown: e => e.preventDefault(), // a tap here must not take the focus away from the text box, or the keyboard would drop
      onclick: fn
    });
  if (p) {
    k.appendChild(
      key('+ Paragraph', 'Add a paragraph', () => {
        p.blocks.push(makeBlock(''));
        refresh();
        focusSoon('#main .block textarea', -1);
      })
    );
    if (!p.ending)
      k.appendChild(
        key('+ Choice', 'Add a choice to this page', () => {
          p.choices.push(makeChoice('', ''));
          refresh();
          focusSoon('#main .clabel', -1);
        })
      );
  }
  k.appendChild(key('↶', 'Undo', undo, 'kicon', !undoStack.length));
  k.appendChild(key('↷', 'Redo', redo, 'kicon', !redoStack.length));
  k.appendChild(h('span', { class: 'kgap' }));
  k.appendChild(
    h('button', {
      type: 'button',
      class: 'btn small primary',
      text: 'Done',
      'aria-label': 'Done typing: close the keyboard',
      onclick: () => {
        const a = document.activeElement;
        if (a?.blur) a.blur();
        setTyping(false);
      }
    })
  );
}

/** Switches typing mode on or off. */
function setTyping(on) {
  on = !!on;
  if (on === typing) {
    if (on) renderKeyrow();
    return;
  }
  typing = on;
  document.body.classList.toggle('typing', on);
  const k = $('#keyrow');
  if (k) k.hidden = !on;
  if (on) renderKeyrow();
}

/** The open text box stays visible after the chrome around it folds away (and again once the keyboard has finished rising). */
function keepFieldVisible(el) {
  const show = () => {
    if (document.activeElement === el && el.isConnected) el.scrollIntoView({ block: 'nearest' });
  };
  requestAnimationFrame(show);
  setTimeout(show, 280);
}

function wirePhone() {
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (!typingPossible() || !el?.matches?.(TYPING_FIELD) || !el.closest('#main')) return;
    setTyping(true);
    keepFieldVisible(el);
  });
  document.addEventListener('focusout', () => {
    if (!typing) return;
    setTimeout(() => {
      const a = document.activeElement;
      if (!(a?.matches?.(TYPING_FIELD) && a.closest('#main'))) setTyping(false); // focus did not move to another text box
    }, 150);
  });
  /* on a phone whose browser covers the page with the keyboard (instead of shrinking it), lift the key row by the keyboard's height */
  const vv = window.visualViewport;
  if (vv) {
    const lift = () => {
      const kb = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty('--kb', `${kb}px`);
    };
    vv.addEventListener('resize', lift);
    vv.addEventListener('scroll', lift);
    lift();
  }
  /* swipe the page-name bar: left for the next page in the list, right for the previous one */
  const bar = $('#drawerbar');
  let sx = 0;
  let sy = 0;
  let st = 0;
  let down = false;
  bar.addEventListener('pointerdown', e => {
    down = e.isPrimary;
    sx = e.clientX;
    sy = e.clientY;
    st = Date.now();
  });
  bar.addEventListener('pointerup', e => {
    if (!down) return;
    down = false;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Date.now() - st > 800 || Math.abs(dx) < 56 || Math.abs(dy) > Math.abs(dx) / 2) return;
    const order = listedPages().map(x => x.p);
    const to = order[order.indexOf(byId(selId)) + (dx < 0 ? 1 : -1)];
    if (to) openPage(to);
    else toast(dx < 0 ? 'This is the last page in the list.' : 'This is the first page in the list.');
  });
  bar.addEventListener('pointercancel', () => (down = false));
}
