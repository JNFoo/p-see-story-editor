/* ============================================================================
   HELPERS (screen part): File → Paste an outline…, and the Writing notes in the Check tab.
   The reading and checking itself is in helpers.js. Nothing here sends anything anywhere.
   Copyright (c) 2026 LFC Foundry. MIT License.
   ============================================================================ */

/* ----- paste an outline ----- */

const OUTLINE_EXAMPLE = `Start
  The ferry leaves you on the rock. Fog is coming in.
  Walk to the lighthouse → Lighthouse door
  Wait for the next ferry → Cold night (bad ending)
Lighthouse door
  The door is open a hand's width.
  Go in → Hall
Hall
  Climb the stairs → Lamp room`;

/** Turns what was read into the pages to add: names made unique, choices pointed at pages, endings given no choices. */
function planOutline(parsed) {
  const issues = parsed.issues.slice();
  const taken = new Set(project.passages.map(p => pname(p).trim().toLowerCase()));
  const blank = project.passages.length === 1 && isBlankPage(project.passages[0]) ? project.passages[0] : null;
  if (blank) taken.delete(pname(blank).trim().toLowerCase());
  const made = new Map(); // outline name (lowercase) -> the page to make
  const create = [];
  parsed.pages.forEach(op => {
    let name = op.name;
    let n = 2;
    while (taken.has(name.toLowerCase())) name = `${op.name} ${n++}`;
    if (name !== op.name) issues.push(`A page called “${op.name}” is already in the story, so the new one is named “${name}”.`);
    taken.add(name.toLowerCase());
    const p = makePassage(name);
    if (op.texts.length) p.blocks = op.texts.map(makeBlock);
    if (op.ending) {
      p.ending = true;
      p.valence = op.valence;
      if (op.choices.length) issues.push(`“${op.name}” is an ending, so its ${op.choices.length === 1 ? 'choice was' : 'choices were'} left out.`);
    }
    made.set(op.name.toLowerCase(), p);
    create.push({ p, op });
  });
  const existing = new Map(project.passages.filter(p => p !== blank).map(p => [pname(p).trim().toLowerCase(), p]));
  const empties = []; // pages named only in a choice
  create.forEach(({ p, op }) => {
    if (p.ending) return;
    op.choices.forEach(c => {
      let dest = '';
      if (c.to) {
        const key = c.to.toLowerCase();
        const target = made.get(key) || existing.get(key) || empties.find(e => e.name.toLowerCase() === key);
        if (target) dest = target.id;
        else {
          const e = makePassage(c.to);
          empties.push(e);
          dest = e.id;
        }
      }
      p.choices.push(makeChoice(c.label, dest));
    });
  });
  if (empties.length) issues.push(`${empties.length === 1 ? 'A page is' : `${empties.length} pages are`} named in a choice but not written yet, so ${empties.length === 1 ? 'it was' : 'they were'} added empty: ${empties.slice(0, 5).map(e => `“${e.name}”`).join(', ')}${empties.length > 5 ? ', …' : ''}.`);
  return { pages: create.map(x => x.p), empties, blank, issues };
}

/** A page with nothing written on it (the one a new story starts with). */
function isBlankPage(p) {
  return !p.blocks.some(b => String(b.text).trim()) && !p.choices.length && !p.ending && !p.todo && !p.note && !p.heading && !p.gives.length && !p.takes.length;
}

/** Adds the planned pages to the story as one Undo step. */
function applyOutline(plan) {
  if (plan.blank) {
    project.passages = project.passages.filter(p => p !== plan.blank);
    project.start = plan.pages[0].id;
  }
  plan.pages.concat(plan.empties).forEach(p => project.passages.push(p));
  selId = plan.pages[0].id;
  view = 'write';
  closeDrawers();
  refresh();
  const n = plan.pages.length + plan.empties.length;
  toast(`Added ${n} page${n === 1 ? '' : 's'} from the outline.`, 'Undo', undo);
}

/** File → Paste an outline…: a box to paste into, a live preview of what would be added, and an Add button. */
function outlineDialog() {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Paste an outline' }));
    d.appendChild(
      h('div', {
        class: 'hint',
        text: 'Write or paste one page per line at the left edge, and indent its choices under it as “Choice words → Page name”. An indented line with no arrow becomes a paragraph of that page. Add (ending), (good ending) or (bad ending) after a page name for an ending. The pages are added to this story, and you can undo it.'
      })
    );
    const ta = h('textarea', { class: 'in mono', rows: 10, spellcheck: 'false', 'aria-label': 'Outline', placeholder: OUTLINE_EXAMPLE, style: 'width:100%' });
    const out = h('div', { class: 'outprev', 'aria-live': 'polite' });
    const add = h('button', { class: 'btn primary', type: 'button', text: 'Add the pages', disabled: true });
    let plan = null;
    const show = () => {
      const parsed = parseOutline(ta.value);
      plan = parsed.pages.length ? planOutline(parsed) : null;
      add.disabled = !plan;
      out.textContent = '';
      if (!ta.value.trim()) return;
      if (!plan) {
        out.appendChild(h('div', { class: 'hint', text: parsed.issues[0] || 'Nothing to add yet.' }));
        return;
      }
      const choices = plan.pages.reduce((n, p) => n + p.choices.length, 0);
      const writ = plan.pages.filter(p => p.blocks.some(b => b.text)).length;
      out.appendChild(
        h('div', { class: 'good' }, [
          h('strong', { text: `${plan.pages.length} page${plan.pages.length === 1 ? '' : 's'}` }),
          ` with ${choices} choice${choices === 1 ? '' : 's'}${writ ? `, ${writ} with words` : ''}${plan.empties.length ? `, and ${plan.empties.length} empty page${plan.empties.length === 1 ? '' : 's'} for choices to lead to` : ''}.`,
          plan.blank ? ' The empty first page is replaced, and the first page here becomes the start.' : ''
        ])
      );
      if (plan.issues.length) out.appendChild(h('ul', { class: 'hint' }, plan.issues.slice(0, 8).map(t => h('li', { text: t }))));
    };
    ta.addEventListener('input', show);
    add.addEventListener('click', () => {
      if (!plan) return;
      const p = plan;
      close();
      applyOutline(p);
    });
    d.appendChild(ta);
    d.appendChild(out);
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close }), add]));
  });
}

/* ----- writing notes ----- */

let writing = []; // the notes for the story as it was when the checker last ran
let writingFor = '';

/** The writing notes for the story as it is now (worked out once per version of the story). */
function freshWriting() {
  if (writingFor === cur) return writing;
  try {
    writing = writingChecks(project, { para: prefs.paraMax, page: prefs.pageMax, wpm: prefs.wpm, ignore: new Set(prefs.writingIgnore) });
  } catch (e) {
    logError('writing checks', e);
    writing = [];
  }
  writingFor = cur;
  return writing;
}

/** The Writing notes part of the Check tab, or null when there is nothing to say (the size boxes still show when something is turned off). */
function writingCard() {
  const list = freshWriting();
  const box = h('details', { class: 'notes' });
  box.open = list.length > 0 && list.length <= 12;
  box.appendChild(h('summary', { text: `Writing notes (${list.length})`, title: 'Not mistakes: things a careful reader might trip on. Checked offline, in this browser only.' }));
  const num = (label, key, lo, hi) =>
    h('label', { class: 'wlim' }, [
      `${label} `,
      h('input', {
        class: 'in',
        type: 'number',
        min: lo,
        max: hi,
        value: prefs[key],
        style: 'width:5.5em',
        onchange(e) {
          const v = Math.round(+e.target.value);
          prefs[key] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : prefs[key];
          savePrefs();
          writingFor = '';
          renderMain();
        }
      })
    ]);
  box.appendChild(h('div', { class: 'row wlims' }, [num('Long paragraph is over', 'paraMax', 30, 2000), ' words ', num('Long page is over', 'pageMax', 100, 20000), ' words']));
  const groups = [
    ['name', 'Names that may be spelled two ways'],
    ['repeat', 'Words typed twice in a row'],
    ['overuse', 'Words used again and again'],
    ['alike', 'Choices that read alike'],
    ['long', 'Long paragraphs and pages']
  ];
  groups.forEach(([kind, title]) => {
    const rows = list.filter(x => x.kind === kind);
    if (!rows.length) return;
    box.appendChild(h('div', { class: 'wgroup', text: `${title} (${rows.length})` }));
    rows.slice(0, 40).forEach(it => {
      const p = it.pid ? byId(it.pid) : null;
      box.appendChild(
        h('div', { class: 'issue note' }, [
          h('div', { class: 't', text: it.msg }),
          p ? h('button', { class: 'btn small', type: 'button', text: 'Open page', title: `Open “${pname(p)}” in the Write tab`, onclick: () => openPage(p) }) : null,
          h('button', {
            class: 'btn small',
            type: 'button',
            text: 'Ignore',
            title: 'Stop showing this one (kept in this browser, not in the story)',
            onclick() {
              prefs.writingIgnore = prefs.writingIgnore.concat(it.key).slice(-300);
              savePrefs();
              writingFor = '';
              renderMain();
            }
          })
        ])
      );
    });
    if (rows.length > 40) box.appendChild(h('div', { class: 'hint', text: `${rows.length - 40} more not shown. Fix some, or Ignore the ones that are fine.` }));
  });
  if (!list.length) box.appendChild(h('div', { class: 'hint', text: 'Nothing found: no repeated words, no names spelled two ways, no very long paragraphs, and no choices that read alike.' }));
  if (prefs.writingIgnore.length)
    box.appendChild(
      h('div', { class: 'row' }, [
        h('button', {
          class: 'btn small',
          type: 'button',
          text: `Show the ${prefs.writingIgnore.length} ignored again`,
          onclick() {
            prefs.writingIgnore = [];
            savePrefs();
            writingFor = '';
            renderMain();
          }
        })
      ])
    );
  return box;
}
