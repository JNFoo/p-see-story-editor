/* ============================================================================
   STATUS: named Undo and the History list, and the status line (saved here, file copy, problems).
   Copyright (c) 2026 JNFoo. MIT License.
   ============================================================================ */

/* ----- named undo ----- */

const HIST_SHOW = 20; // steps listed in History (the undo list itself keeps more)

/** What step `i` of the undo list did, in words: { text, pid }. Worked out when asked (a diff of two saved copies), then remembered. */
function stepInfo(i) {
  const x = undoStack[i];
  const next = undoStack[i + 1];
  const to = next ? next.s : cur;
  if (!x.info || x.infoFor !== to) {
    x.info = x.e !== (next ? next.e : epoch) ? { text: 'Open another story', pid: '' } : describeChange(x.s, to);
    x.infoFor = to;
  }
  return x.info;
}

/** The sentence under Undo and Redo, set when the button is pointed at, focused or about to be pressed (not on every keystroke). */
function nameUndoButtons() {
  const u = $('#undo');
  const r = $('#redo');
  const ut = undoStack.length ? `Undo: ${stepInfo(undoStack.length - 1).text} (Ctrl+Z)` : 'Nothing to undo';
  const rt = redoStack.length ? `Redo: ${describeChange(cur, redoStack[redoStack.length - 1].s).text} (Ctrl+Y)` : 'Nothing to redo';
  u.title = ut;
  u.setAttribute('aria-label', ut.replace(/ \(Ctrl\+Z\)$/, ''));
  r.title = rt;
  r.setAttribute('aria-label', rt.replace(/ \(Ctrl\+Y\)$/, ''));
}

/** After Undo, Redo or going back several steps: say what happened and show the page it touched (a one-time flash, none when motion is reduced). */
function afterTimeTravel(msg, pid) {
  toast(msg, redoStack.length ? 'Redo' : '', redo);
  if (view !== 'write') return;
  setTimeout(() => {
    const bar = document.querySelector('#main .pagebar');
    if (!bar || !pid) return;
    bar.classList.remove('flash');
    void bar.offsetWidth; // restart the animation
    bar.classList.add('flash');
  }, 0);
}

/** The History window: the last steps, newest first; a click goes back to just before that step. */
function historyDialog() {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'History' }));
    d.appendChild(
      h('div', {
        class: 'hint',
        text: 'The latest changes, newest first. Click one to go back to just before it. Redo brings the steps back, one at a time. A burst of typing counts as one step.'
      })
    );
    const n = undoStack.length;
    const list = h('div', { class: 'histlist', role: 'list' });
    if (!n) list.appendChild(h('div', { class: 'hint', text: 'Nothing to undo yet in this session.' }));
    for (let i = n - 1; i >= Math.max(0, n - HIST_SHOW); i--) {
      const info = stepInfo(i);
      const when = undoStack[i].t ? new Date(undoStack[i].t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const steps = n - i;
      list.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'histrow',
            role: 'listitem',
            title: steps === 1 ? 'Undo this step' : `Go back ${steps} steps, to just before this one`,
            onclick() {
              close();
              undoMany(steps);
            }
          },
          [h('span', { class: 'histtext', text: info.text }), h('time', { text: when })]
        )
      );
    }
    d.appendChild(list);
    if (n > HIST_SHOW) d.appendChild(h('div', { class: 'hint', text: `Older steps (${n - HIST_SHOW} more) can still be undone one at a time with Ctrl+Z.` }));
    d.appendChild(h('div', { class: 'row' }, [h('button', { class: 'btn', type: 'button', text: 'Close', onclick: close })]));
  });
}

/* ----- the status line, at the right end of the tab row ----- */

let problemAt = -1; // which problem "Next problem" opens next

/** Opens the next problem that belongs to a page (then the one after, round and round). */
function nextProblem() {
  const list = (analysis?.problems || []).filter(p => p.pid && byId(p.pid));
  if (!list.length) {
    setView('check');
    return;
  }
  problemAt = (problemAt + 1) % list.length;
  const it = list[problemAt];
  openPage(byId(it.pid));
  toast(`Problem ${problemAt + 1} of ${list.length}: ${it.msg}`);
}

/** One short line: is my work kept, how old is the file copy, and what the checker says right now. */
function renderStatus() {
  const el = $('#statusline');
  if (!el) return;
  el.textContent = '';
  const chip = (cls, ico, text, longText, tip, fn) => {
    const parts = [h('span', { class: 'sico', 'aria-hidden': 'true', text: ico }), longText ? h('span', { class: 'slong', text: longText }) : null, text ? h('span', { text }) : null];
    const a = h(fn ? 'button' : 'span', { class: `schip ${cls}`, title: tip || '' }, parts);
    if (fn) {
      a.type = 'button';
      a.addEventListener('click', fn);
    }
    el.appendChild(a);
    return a;
  };
  /* the checker */
  const a = analysis && analysisFor === cur ? analysis : null;
  if (!a) {
    chip('gray', '…', 'Checking', '', 'The checker is looking at the story as it is now');
  } else {
    const np = a.problems.length;
    const nw = a.warnings.length;
    if (np) chip('bad', '✕', `${np} problem${np === 1 ? '' : 's'}`, '', 'Open the Check tab', () => setView('check'));
    if (np && a.problems.some(p => p.pid)) chip('btn', '→', 'Next problem', '', 'Open the page of the next problem', nextProblem);
    if (nw) chip('warn', '▲', `${nw} to look at`, '', 'Open the Check tab', () => setView('check'));
    if (!np && a.truncated) chip('gray', '?', 'Not fully checked', '', 'The story is too large to check completely, so some problems may not show. Open the Check tab.', () => setView('check'));
    else if (!np && !nw) chip('ok', '✓', `No problems found: ${a.endings.length ? `${a.endings.length} ending${a.endings.length === 1 ? '' : 's'}` : `${project.passages.length} pages`}`, '', 'Every ending can be reached and nothing traps a player', () => setView('check'));
  }
  if (writing.length) chip('gray', '✎', `${writing.length} writing note${writing.length === 1 ? '' : 's'}`, '', 'Repeated words, names spelled two ways, long paragraphs and choices that read alike. Open the Check tab.', () => setView('check'));
  /* saving */
  if (!storageOk) {
    chip('bad', '⚠', 'Not kept in this browser. Save a file.', '', 'This browser refuses to keep the story between visits');
  } else {
    const t = lastLocalSave ? new Date(lastLocalSave).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    if (saveTimer) chip('gray', '…', 'Saving', '', 'Writing to this browser');
    else chip('ok', '✓', t, t ? 'Saved in this browser, ' : 'Saved in this browser', 'The story is autosaved in this browser after every change');
  }
  const at = project.savedAt ? Date.parse(project.savedAt) : NaN;
  if (Number.isFinite(at)) chip('gray sfile', '', agoText(Date.now() - at), 'File copy: ', fileSaveLine());
}

/** Hooks up the Undo, Redo and History buttons. */
function wireHistory() {
  ['#undo', '#redo'].forEach(id => {
    ['pointerover', 'focus'].forEach(ev => $(id).addEventListener(ev, nameUndoButtons));
  });
  $('#hist').addEventListener('click', historyDialog);
}
