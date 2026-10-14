/* ---------------------------------------------------------------------------
   3d. The other screens: Items, Map, Check, Play
   --------------------------------------------------------------------------- */

/* ----- Items tab: rename, set object/state, delete ----- */

/** How many places use this item (for the "Used in N places" note and the delete warning). */
function usage(id) {
  let n = 0;
  const mentions = list => list.filter(x => x === id || x.indexOf(`t:${id}:`) === 0).length; // a number is used by its tests ("Courage 5 or more")
  project.passages.forEach(p => {
    p.blocks.forEach(b => {
      if (mentions(b.needs) || mentions(b.forbid)) n++;
    });
    p.choices.forEach(c => {
      if (mentions(c.needs) || mentions(c.forbid)) n++;
      if ((c.gives || []).concat(c.takes || []).includes(id)) n++;
      if (id in (c.adds || {})) n++;
      if (c.check && c.check.stat === id) n++;
    });
    if (p.gives.includes(id) || p.takes.includes(id) || id in (p.adds || {})) n++;
  });
  project.items.forEach(it => {
    (it.names || []).forEach(nm => {
      if (nm.when === id) n++;
    });
  }); // "shown as … when" counts too
  return n;
}
/** Deletes an item and every mention of it. */
function removeItemEverywhere(id) {
  function rm(a) {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] === id || a[i].indexOf(`t:${id}:`) === 0) a.splice(i, 1); // a number's tests go with it
  }
  project.passages.forEach(p => {
    p.blocks.forEach(b => {
      rm(b.needs);
      rm(b.forbid);
    });
    p.choices.forEach(c => {
      rm(c.needs);
      rm(c.forbid);
      rm(c.gives || []);
      rm(c.takes || []);
      if (c.adds) delete c.adds[id];
      if (c.check && c.check.stat === id) c.check = null; // the choice becomes an ordinary one
    });
    rm(p.gives);
    rm(p.takes);
    if (p.adds) delete p.adds[id];
  });
  (project.givens || []).forEach(g => {
    rm(g.options);
  });
  project.items.forEach(it => {
    if (it.names) {
      it.names = it.names.filter(nm => nm.when !== id);
      if (!it.names.length) delete it.names;
    }
  });
  project.items = project.items.filter(i => i.id !== id);
}

/** Adds a Given: a question asked before the story starts, whose answers become states. */
function createGiven() {
  promptDialog(
    'New Given',
    [
      { label: 'The question the player answers before the story starts', placeholder: 'Who are you?' },
      { label: 'The answers, separated by commas', placeholder: 'Man, Woman, They' }
    ],
    'Add'
  ).then(v => {
    if (!v) return;
    const g = { id: uid('g_'), question: v[0] || 'Who are you?', options: [] };
    v[1]
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(nm => {
        const it = makeItem(nm, 'state');
        it.show = false;
        project.items.push(it);
        g.options.push(it.id); // Given answers stay hidden unless switched on
      });
    project.givens.push(g);
    refresh();
    toast(
      g.options.length >= 2
        ? 'Added. Players answer it before page one. Use the answers in “Only if” boxes.'
        : 'Added. Give it at least two answers on the Items tab.'
    );
  });
}

/** Asks for a "shown as" name for item `it`: what it is called while the player has or is something else. */
function addShownAs(it) {
  const states = project.items.filter(x => x.id !== it.id);
  if (!states.length) {
    toast('Add a state or a Given first, for example Woman.');
    return;
  }
  dialog((d, close) => {
    const name = h('input', { class: 'in', maxlength: 80, placeholder: 'For example: purse', 'aria-label': 'Shown as' });
    const when = h(
      'select',
      { class: 'in', 'aria-label': 'When' },
      states.map(x => {
        const g = givenOf(project, x.id);
        return h('option', { value: x.id, text: (g ? `${g.question} ` : '') + x.name });
      })
    );
    function go() {
      if (!name.value.trim()) {
        name.focus();
        return;
      }
      it.names = (it.names || []).filter(nm => nm.when !== when.value).concat([{ when: when.value, name: name.value.trim() }]);
      close();
      refresh();
    }
    name.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        go();
      }
    });
    d.appendChild(h('h3', { text: `“${it.name}” is shown as…` }));
    d.appendChild(h('label', { class: 'f' }, ['Name the player sees', name]));
    d.appendChild(h('label', { class: 'f' }, ['While the player is or has', when]));
    d.appendChild(
      h('div', { class: 'hint', text: `Used on the player’s “Carrying” line. Conditions keep using “${it.name}”, so nothing else changes.` })
    );
    d.appendChild(
      h('div', { class: 'row end' }, [
        h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close }),
        h('button', { class: 'btn primary', type: 'button', text: 'Add', onclick: go })
      ])
    );
    setTimeout(() => {
      name.focus();
    }, 0);
  });
}

/**
 * The Items tab: one compact line per item. Objects and states are listed under their own headings, each with
 * its "+ New" button beside the heading. A line holds the name, the kind switch, a "Show" toggle (list it for
 * the player), how many places use it, and delete.
 */
function renderItems(main) {
  const wrap = h('div', { class: 'wrap items' }, [
    h('div', {
      class: 'hint',
      text: adv('items')
        ? 'Objects are things a player carries (a key, a phone). States are conditions they are in (sick, brave). Numbers are scores that go up and down (Courage, Money). Givens are answered before the story starts (who the player is). All of them can decide which text and choices appear.'
        : 'Objects are things a player carries (a key, a phone). States are conditions they are in (sick, brave). Both can decide which text and choices appear.'
    })
  ]);
  /** A number: its name, lowest, highest and starting value, Show, uses, delete. */
  function statLine(it) {
    const n = usage(it.id);
    const name = h('input', {
      class: 'in',
      value: it.name,
      maxlength: 80,
      'aria-label': 'Number name',
      title: 'The name shown in menus and, if “Show” is on, beside the bar the player sees',
      oninput: function (e) {
        it.name = e.target.value;
        commit(`i:${it.id}`);
      }
    });
    /** A small labeled whole-number box that keeps lowest < highest and the start inside both. */
    const box = (label, tip, value, apply) =>
      h('label', { class: 'numf', title: tip }, [
        label,
        h('input', {
          type: 'number',
          class: 'in chipnum',
          value: String(value),
          'aria-label': `${it.name}: ${label}`,
          onchange: function (e) {
            const v = Math.round(Number(e.target.value));
            if (Number.isFinite(v)) apply(v);
            it.lo = Math.max(STAT_MIN, Math.min(STAT_MAX - 1, it.lo));
            it.hi = Math.max(it.lo + 1, Math.min(STAT_MAX, it.lo + STAT_SPAN, it.hi));
            it.start = Math.max(it.lo, Math.min(it.hi, it.start));
            refresh();
          }
        })
      ]);
    const show = h('button', {
      class: `btn small ghost${it.show ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': it.show ? 'true' : 'false',
      text: 'Show',
      title: it.show
        ? 'The player sees a bar for this number under the page text. Click to hide it.'
        : 'Hidden from the player. Click to show a bar for it.',
      onclick: function () {
        it.show = !it.show;
        refresh();
      }
    });
    const del = iconBtn(
      '✕',
      `Delete “${it.name}” and remove it everywhere it is used`,
      () => {
        ask(
          `Delete “${it.name}”?`,
          n
            ? `It is used in ${n} place${n === 1 ? '' : 's'}. Its tests and changes are removed, and dice checks that use it become ordinary choices. You can undo this.`
            : 'Nothing uses it.',
          'Delete',
          true
        ).then(ok => {
          if (ok) {
            removeItemEverywhere(it.id);
            refresh();
          }
        });
      },
      false,
      'danger'
    );
    const wide = it.hi - it.lo > STAT_SPAN_COMFY;
    return h('div', {}, [
      h('div', { class: 'iline' }, [
        h('span', { class: 'iico', title: 'A number' }, [itemIcon(it, 16)]),
        name,
        box('from', 'The lowest it can go', it.lo, v => (it.lo = v)),
        box('to', 'The highest it can go', it.hi, v => (it.hi = v)),
        box('starts at', 'What every new player begins with', it.start, v => (it.start = v)),
        show,
        h('span', {
          class: 'uses',
          title: n ? `Used in ${n} place${n === 1 ? '' : 's'}` : 'Not used anywhere yet',
          text: n ? n + (n === 1 ? ' use' : ' uses') : 'unused'
        }),
        del
      ]),
      wide
        ? h('div', {
            class: 'hint',
            text: 'A wide range makes the checker slower, because it tries every value. 0 to 10 is plenty for most stories.'
          })
        : null
    ]);
  }
  function line(it) {
    if (it.kind === 'stat') return statLine(it);
    const n = usage(it.id);
    const isState = it.kind === 'state';
    const name = h('input', {
      class: 'in',
      value: it.name,
      maxlength: 80,
      'aria-label': `${isState ? 'State' : 'Object'} name`,
      title: 'The name shown in menus and, if “Show” is on, to the player',
      oninput: function (e) {
        it.name = e.target.value;
        commit(`i:${it.id}`);
      }
    });
    const kind = h(
      'div',
      {
        class: 'seg',
        role: 'radiogroup',
        'aria-label': 'Kind',
        title: 'Object: something the player carries. State: a condition the player is in.'
      },
      [
        ['object', 'Object'],
        ['state', 'State']
      ].map(o => {
        const on = (isState ? 'state' : 'object') === o[0];
        return h('label', { class: on ? 'on' : '' }, [
          h('input', {
            type: 'radio',
            name: `kind-${it.id}`,
            checked: on ? 'checked' : null,
            onchange: function () {
              it.kind = o[0];
              refresh();
            }
          }),
          o[1]
        ]);
      })
    );
    const show = h('button', {
      class: `btn small ghost${it.show ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': it.show ? 'true' : 'false',
      text: 'Show',
      title: it.show
        ? isState
          ? 'The player sees this under “Feeling / status” while it applies. Click to hide it.'
          : 'The player sees this under “Carrying” while they have it. Click to hide it.'
        : `Hidden from the player. Click to list it for them (${isState ? 'under “Feeling / status”' : 'under “Carrying”'}).`,
      onclick: function () {
        it.show = !it.show;
        refresh();
      }
    });
    const del = iconBtn(
      '✕',
      `Delete “${it.name}” and remove it everywhere it is used`,
      () => {
        ask(
          `Delete “${it.name}”?`,
          n ? `It is used in ${n} place${n === 1 ? '' : 's'}. It will be removed from all of them. You can undo this.` : 'Nothing uses it.',
          'Delete',
          true
        ).then(ok => {
          if (ok) {
            removeItemEverywhere(it.id);
            refresh();
          }
        });
      },
      false,
      'danger'
    );
    const as =
      adv('items') &&
      h('button', {
        class: 'btn small ghost',
        type: 'button',
        text: 'Shown as…',
        title: 'Give it another name while the player is or has something, e.g. “purse” when Woman',
        onclick: function () {
          addShownAs(it);
        }
      });
    const row = h('div', { class: 'iline' }, [
      h('span', { class: 'iico', title: isState ? 'A state' : 'An object' }, [itemIcon(it, 16)]),
      name,
      kind,
      show,
      as,
      h('span', {
        class: 'uses',
        title: n ? `Used in ${n} place${n === 1 ? '' : 's'}` : 'Not used anywhere yet',
        text: n ? n + (n === 1 ? ' use' : ' uses') : 'unused'
      }),
      del
    ]);
    if (!(it.names && it.names.length) || !adv('items')) return row; // "shown as" names are an advanced Items feature
    return h('div', {}, [
      row,
      h(
        'div',
        { class: 'aliases' },
        it.names.map(nm =>
          h(
            'span',
            { class: 'chip alias', title: `The player sees “${nm.name}” instead of “${it.name}” while they are or have ${itemName(nm.when)}` },
            [
              `shown as ${nm.name} when ${itemName(nm.when)}`,
              h(
                'button',
                {
                  type: 'button',
                  'aria-label': 'Remove',
                  title: 'Remove this name',
                  onclick: function () {
                    it.names.splice(it.names.indexOf(nm), 1);
                    if (!it.names.length) delete it.names;
                    refresh();
                  }
                },
                ['×']
              )
            ]
          )
        )
      )
    ]);
  }
  /** One Given: its question, its answers as chips (click to rename, × to remove), a box to add an answer, Show, delete. */
  function givenBlock(g) {
    const q = h('input', {
      class: 'in',
      value: g.question,
      maxlength: 160,
      'aria-label': 'Question',
      title: 'The question players answer before the story starts',
      oninput: function (e) {
        g.question = e.target.value;
        commit(`gq:${g.id}`);
      }
    });
    const shown =
      g.options.length &&
      g.options.every(id => {
        const it = itemById(id);
        return it && it.show;
      });
    const show = h('button', {
      class: `btn small ghost${shown ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': shown ? 'true' : 'false',
      text: 'Show',
      title: shown
        ? 'The player sees their answer under “Feeling / status”. Click to hide it.'
        : 'Hidden from the player. Click to show their answer under “Feeling / status”.',
      onclick: function () {
        g.options.forEach(id => {
          const it = itemById(id);
          if (it) it.show = !shown;
        });
        refresh();
      }
    });
    const del = iconBtn(
      '✕',
      'Delete this Given and its answers',
      () => {
        ask(`Delete the Given “${g.question}”?`, 'Its answers are removed everywhere they are used. You can undo this.', 'Delete', true).then(ok => {
          if (!ok || project.givens.indexOf(g) < 0) return;
          g.options.slice().forEach(removeItemEverywhere);
          project.givens.splice(project.givens.indexOf(g), 1);
          refresh();
        });
      },
      false,
      'danger'
    );
    const add = h('input', {
      class: 'in addans',
      placeholder: '+ answer',
      maxlength: 80,
      'aria-label': 'Add an answer',
      title: 'Type an answer and press Enter',
      onkeydown: function (e) {
        if (e.key !== 'Enter' || !e.target.value.trim()) return;
        e.preventDefault();
        const it = makeItem(e.target.value.trim(), 'state');
        it.show = !!(
          g.options.length &&
          g.options.every(id => {
            const o = itemById(id);
            return o && o.show;
          })
        );
        project.items.push(it);
        g.options.push(it.id);
        refresh();
        focusSoon('#main .addans', project.givens.indexOf(g));
      }
    });
    const answers = h(
      'div',
      { class: 'chips' },
      g.options
        .map(id => {
          const it = itemById(id);
          const n = usage(id);
          return h(
            'span',
            { class: 'chip given', title: `${n ? `Used in ${n} place${n === 1 ? '' : 's'}` : 'Not used yet'}. Click the name to rename it.` },
            [
              h('button', {
                type: 'button',
                class: 'nm',
                text: it.name,
                'aria-label': `Rename ${it.name}`,
                onclick: function () {
                  promptDialog('Rename answer', [{ label: 'Answer', value: it.name }], 'Rename').then(v => {
                    if (v && v[0]) {
                      it.name = v[0];
                      refresh();
                    }
                  });
                }
              }),
              h(
                'button',
                {
                  type: 'button',
                  'aria-label': `Remove ${it.name}`,
                  title: 'Remove this answer everywhere',
                  onclick: function () {
                    ask(
                      `Remove the answer “${it.name}”?`,
                      n ? `It is used in ${n} place${n === 1 ? '' : 's'}. You can undo this.` : 'Nothing uses it yet.',
                      'Remove',
                      true
                    ).then(ok => {
                      if (ok) {
                        removeItemEverywhere(id);
                        refresh();
                      }
                    });
                  }
                },
                ['×']
              )
            ]
          );
        })
        .concat([add])
    );
    return h('div', { class: 'gblock' }, [
      h('div', { class: 'iline' }, [h('span', { class: 'iico', title: 'A Given' }, [icon('givens', 18)]), q, show, del]),
      answers
    ]);
  }
  [
    ['object', 'Objects', 'No objects yet. Add one for something the player can pick up or hand over.'],
    ['state', 'States', 'No states yet. Add one for a condition like Hungover, Brave or Sick.']
  ]
    .concat(
      numbersShown()
        ? [['stat', 'Numbers', 'No numbers yet. Add one for a score like Courage or Money; choices can test it, and dice checks add it to the roll.']]
        : []
    )
    .forEach(g => {
      const members = project.items.filter(i => kindOf(i) === g[0] && !givenOf(project, i.id));
      const sec = h('section', { class: 'sect' });
      sec.appendChild(
        h('div', { class: 'sech' }, [
          h('span', { class: 'iico' }, [icon(g[0] === 'state' ? 'heart' : g[0] === 'stat' ? 'meter' : 'gift', 14)]),
          h('span', { class: 'sl', text: `${g[1]} (${members.length})` }),
          h('button', {
            class: 'btn small ghost',
            type: 'button',
            text: g[0] === 'state' ? '+ New state' : g[0] === 'stat' ? '+ New number' : '+ New object',
            onclick: function () {
              createItem(g[0]);
            }
          })
        ])
      );
      if (!members.length) sec.appendChild(h('div', { class: 'hint', text: g[2] }));
      members.forEach(it => {
        sec.appendChild(line(it));
      });
      wrap.appendChild(sec);
    });
  /* Givens: states the player chooses before the story starts, fixed from then on (an advanced Items feature) */
  if (!adv('items')) {
    main.appendChild(wrap);
    return;
  }
  const gs = h('section', { class: 'sect' });
  gs.appendChild(
    h('div', { class: 'sech' }, [
      h('span', { class: 'iico' }, [icon('givens', 15)]),
      h('span', { class: 'sl', text: `Givens (${project.givens.length})` }),
      h('button', { class: 'btn small ghost', type: 'button', text: '+ New Given', onclick: createGiven })
    ])
  );
  gs.appendChild(
    h('div', {
      class: 'hint',
      text: 'A Given is a question the player answers before page one, like “Who are you?”. Each answer is a state that stays the same for the whole story, so you can use it in any “Only if” box.'
    })
  );
  project.givens.forEach(g => {
    gs.appendChild(givenBlock(g));
  });
  wrap.appendChild(gs);
  main.appendChild(wrap);
}

/* ----- Check tab: story shape, dice checks, endings explorer, pacing ----- */

let checkSim = { key: '', data: null }; // simulated players for the Check tab, kept until the story changes
/** The simulated players (1,500 random runs) for the story as it is now. */
function simulated() {
  if (checkSim.key !== cur) checkSim = { key: cur, data: playtest(project, { runs: 1500, mode: 'random' }) };
  return checkSim.data;
}
/** Minutes, said plainly: "under a minute", "about 4 minutes". */
function sayMinutes(words) {
  const m = words / prefs.wpm;
  if (m < 0.75) return 'under a minute';
  return `about ${Math.round(m)} minute${Math.round(m) === 1 ? '' : 's'}`;
}
/** The value below which `q` (0 to 1) of the numbers fall. */
function quantile(list, q) {
  if (!list.length) return 0;
  const a = list.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
}

/** The "Story shape" card: what kind of structure the story has, where it forks and joins, and the pages everything depends on. */
function shapeCard() {
  const st = analyzeStructure(project);
  if (!st.label) return null;
  const keyPages = st.bottlenecks.slice(0, 6);
  return h('div', { class: 'card shape' }, [
    h('div', { class: 'cardhd' }, [h('strong', { text: 'Story shape: ' }), st.label]),
    h(
      'ul',
      { class: 'facts' },
      st.facts.map(f => h('li', { text: f }))
    ),
    h('div', { class: 'hint', text: st.tip }),
    keyPages.length
      ? h(
          'div',
          { class: 'row keypages' },
          [h('span', { class: 'sl', text: 'Key pages' })].concat(
            keyPages.map(b =>
              h('button', {
                class: 'btn small',
                type: 'button',
                text: b.name || 'Untitled page',
                title: `Readers of ${b.gates} ending${b.gates === 1 ? '' : 's'} pass through this page. Open it.`,
                onclick: function () {
                  openPage(byId(b.pid));
                }
              })
            )
          )
        )
      : null
  ]);
}

/** A folded list of the story's dice checks with the odds at the lowest and highest score. */
function checksCard() {
  const rows = [];
  project.passages.forEach(p =>
    p.choices.forEach(c => {
      const st = c.check && itemById(c.check.stat);
      if (st) rows.push({ p, c, st });
    })
  );
  if (!rows.length) return null;
  const d = h('details', { class: 'notes' }, [
    h('summary', { text: `Dice checks (${rows.length})`, title: 'Every choice that rolls two dice, and the chance of passing' })
  ]);
  rows.forEach(({ p, c, st }) => {
    const at = v => klOdds({ [`v:${st.id}`]: v }, c.check);
    d.appendChild(
      h('div', { class: 'issue note' }, [
        h('div', {
          class: 't',
          text: `“${c.label || 'unnamed'}” on “${pname(p)}”: ${st.name} + two dice, target ${c.check.target}. Chance: ${at(st.lo)}% at ${st.lo}, ${at(st.start)}% at the start (${st.start}), ${at(st.hi)}% at ${st.hi}.`
        }),
        h('button', { class: 'btn small', type: 'button', text: 'Open page', onclick: () => openPage(p) })
      ])
    );
  });
  return d;
}

/** For one ending: how to reach it, filled in when the person opens it (the work is done only on request). */
function endingExplorer(e, a) {
  const d = h('details', { class: 'xplore' }, [h('summary', { text: 'How can a player reach this?' })]);
  d.addEventListener('toggle', () => {
    if (!d.open || d.dataset.done) return;
    d.dataset.done = '1';
    const x = a.explain && a.explain(e.pid);
    if (!x) {
      d.appendChild(h('div', { class: 'hint', text: 'Not available for this ending.' }));
      return;
    }
    const lines = [
      `${x.situations} different way${x.situations === 1 ? '' : 's'} of arriving here were found (counting what the player holds and their numbers).`
    ];
    if (x.must && x.must.length) lines.push(`Every route passes through: ${x.must.map(m => `“${m.name}”`).join(', ')}.`);
    else if (x.must) lines.push('No single page is on every route, so there is more than one way in.');
    if (x.always.length) lines.push(`Every player who gets here has: ${x.always.join(', ')}.`);
    x.nums.forEach(n => lines.push(n.lo === n.hi ? `${n.name} is always ${n.lo}.` : `${n.name} is between ${n.lo} and ${n.hi}.`));
    lines.forEach(t => d.appendChild(h('div', { class: 'xl', text: t })));
    const play = h('button', {
      class: 'btn small',
      type: 'button',
      text: 'Play from the page before this',
      title: 'Opens the Play tab on the last page before this ending, as a player on the shortest route would arrive',
      onclick: function () {
        const prev = x.path.filter(s => !s.given).slice(-2, -1)[0];
        playFrom(prev ? prev.to : e.pid);
      }
    });
    if (x.path.some(s => !s.given)) d.appendChild(play);
  });
  return d;
}

/** The pacing and reading time card (uses the simulated players). */
function pacingCard() {
  const pt = simulated();
  if (!pt.runs) return null;
  const done = pt.paths.map((_, i) => i).filter(i => pt.results[i] !== 'stuck');
  if (!done.length) return null;
  const words = done.map(i => pt.words[i]);
  const steps = done.map(i => pt.paths[i].length);
  const med = quantile(words, 0.5);
  const pageWords = p => p.blocks.reduce((n, b) => n + ((String(b.text).match(/\S+/g) || []).length || 0), 0);
  const wc = project.passages.map(p => [p, pageWords(p)]);
  const heavy = wc
    .slice()
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3);
  const avgWords = wc.length ? wc.reduce((n, x) => n + x[1], 0) / wc.length : 0;
  const longRun = quantile(
    done.map(i => pt.stretch[i]),
    0.9
  );
  const withChoices = project.passages.filter(p => !p.ending && p.choices.length);
  const single = withChoices.filter(p => p.choices.length === 1).length;
  const speed = h(
    'select',
    {
      class: 'in',
      'aria-label': 'Reading speed',
      title: 'How fast the reader reads, for the time estimates',
      onchange: function (e) {
        prefs.wpm = Number(e.target.value);
        savePref(`${STORE}-prefs`, JSON.stringify(prefs));
        renderMain();
      }
    },
    [
      [180, 'relaxed (180 words a minute)'],
      [230, 'average (230)'],
      [300, 'quick (300)']
    ].map(o => h('option', { value: o[0], text: o[1] }))
  );
  speed.value = String(prefs.wpm);
  const card = h('div', { class: 'card pacing' }, [
    h('div', { class: 'cardhd' }, [h('strong', { text: 'Pacing and reading time' }), h('label', { class: 'numf' }, ['Reader is ', speed])]),
    h('ul', { class: 'facts' }, [
      h('li', {
        text: `A typical play-through reads ${Math.round(med).toLocaleString('en')} words, ${sayMinutes(med)}, across ${quantile(steps, 0.5)} pages.`
      }),
      h('li', {
        text: `Shortest ${sayMinutes(quantile(words, 0.05))}; longest ${sayMinutes(quantile(words, 0.95))} (from ${pt.runs.toLocaleString('en')} simulated players).`
      }),
      h('li', {
        text:
          longRun >= 5
            ? `Some players press through ${longRun} pages in a row with only one choice each. A long stretch like that can feel like reading a book with no say in it.`
            : 'No long stretches without a real choice.'
      }),
      h('li', {
        text: `${single} of ${withChoices.length} pages with choices offer just one (a “Continue”). The average page is ${Math.round(avgWords)} words.`
      })
    ]),
    h(
      'div',
      { class: 'row keypages' },
      [h('span', { class: 'sl', text: 'Longest pages' })].concat(
        heavy.map(([p, n]) =>
          h('button', { class: 'btn small', type: 'button', text: `${pname(p)} (${n} words)`, title: 'Open this page', onclick: () => openPage(p) })
        )
      )
    )
  ]);
  /* the rhythm of one typical play-through: a bar per page, tall for long pages, lit where the reader gets a real choice */
  const typical = done.slice().sort((x, y) => Math.abs(pt.words[x] - med) - Math.abs(pt.words[y] - med))[0];
  if (typical !== undefined) {
    const strip = h('div', {
      class: 'strip',
      role: 'img',
      'aria-label': 'The rhythm of a typical play-through: one bar per page, taller for longer pages'
    });
    const top = Math.max(1, ...Array.from(pt.paths[typical]).map(i => wc[i][1]));
    Array.from(pt.paths[typical]).forEach(i => {
      const p = project.passages[i];
      const bar = h('i', {
        class: p.ending ? 'end' : p.choices.length > 1 ? 'pick' : '',
        title: `${pname(p)}: ${wc[i][1]} words${p.ending ? ' (ending)' : p.choices.length > 1 ? `, ${p.choices.length} choices` : ''}`
      });
      bar.style.height = `${Math.max(8, Math.round((wc[i][1] / top) * 100))}%`;
      strip.appendChild(bar);
    });
    card.appendChild(h('div', { class: 'hint', text: 'One typical play-through, page by page (tall = long page, bright = a real choice):' }));
    card.appendChild(strip);
  }
  return card;
}

/* ----- Check tab ----- */

/** Re-runs the checker soon after the last edit. */
function scheduleCheck() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    runCheck();
  }, CHECK_DELAY);
}
/** Runs the checker now and refreshes whatever shows its results. */
function runCheck() {
  const already = analysis && analysisFor === cur; // the map may have analyzed this exact version already
  freshAnalysis();
  freshWriting();
  renderTop();
  if (view === 'write') {
    renderSide.list && renderSide.list();
    renderPageNotes();
  }
  if (!already && (view === 'check' || view === 'map')) {
    const m = $('#main');
    const st = m.scrollTop;
    renderMain();
    m.scrollTop = st;
  }
}
/** The checker's result for the story as it is now, re-using the last result when nothing has changed since. */
function freshAnalysis() {
  if (analysis && analysisFor === cur) return analysis;
  const t0 = performance.now();
  try {
    analysis = analyze(project);
    speedNote('checker', performance.now() - t0, `${analysis.states} situations`);
  } catch (e) {
    logError('checker', e);
    analysis = {
      problems: [{ pid: '', msg: `The checker hit an error: ${e.message}` }],
      warnings: [],
      notes: [],
      endings: [],
      states: 0,
      truncated: true
    };
  }
  analysis.notes = (analysis.notes || []).concat(editorNotes());
  analysisFor = cur;
  return analysis;
}
/**
 * "Good to know" notes about the editor itself: Hands over is hidden for now, and features turned off under
 * Options → Advanced that this story still uses (they keep working in its games).
 */
function editorNotes() {
  const out = [];
  const sending = project.passages.filter(p => Object.keys(p.sends || {}).length);
  out.push({
    pid: sending[0]?.id || '',
    msg: sending.length
      ? `Hands over (giving an object to someone, or leaving it on a page, so later text can depend on where it went) is hidden in the editor for now. ${sending.length === 1 ? 'One page' : `${sending.length} pages`} in this story still ${sending.length === 1 ? 'hands' : 'hand'} something over, and ${sending.length === 1 ? 'it works' : 'they work'} in the game as before.`
      : 'Hands over (giving an object to someone, or leaving it on a page, so later text can depend on where it went) is hidden in the editor for now. Use Loses to take an object away.'
  });
  const fx = project.passages.filter(p => p.choices.some(c => c.gives.length || c.takes.length));
  if (!adv('write') && fx.length)
    out.push({
      pid: fx[0].id,
      msg: `Some choices in this story give or take items when picked, but that feature is hidden (Options → Advanced → Write). They still work in the game; turn Write on to see and change them.`
    });
  if (!adv('items') && (project.givens.length || project.items.some(i => i.names?.length)))
    out.push({
      pid: '',
      items: true,
      kind: 'given',
      msg: 'This story uses Givens or “Shown as” names, but they are hidden (Options → Advanced → Items). They still work in the game; turn Items on to see and change them.'
    });
  return out;
}

function renderCheck(main) {
  const a = freshAnalysis();
  const wrap = h('div', { class: 'wrap' });
  const reached = a.endings.filter(e => e.reachable).length;
  wrap.appendChild(h('h2', { class: 'sec', text: 'Check your story' }));
  wrap.appendChild(
    h('div', {
      class: 'hint',
      text: 'The checker plays every way a player could move through your story, with every combination of items and Given answers, and reports anything that would trap or confuse them.'
    })
  );
  if (a.problems.length)
    wrap.appendChild(
      h('div', { class: 'banner bad' }, [
        h('strong', { text: `${a.problems.length} problem${a.problems.length === 1 ? '' : 's'} to fix. ` }),
        'Players could get stuck or be unable to finish.'
      ])
    );
  else if (a.truncated)
    wrap.appendChild(
      h('div', { class: 'banner' }, [
        h('strong', { text: 'No problems found so far. ' }),
        `The story is too large to check completely (${a.states.toLocaleString('en')} situations checked), so some problems may not show.`
      ])
    );
  else
    wrap.appendChild(
      h('div', { class: 'banner good' }, [
        h('strong', { text: 'No problems found. ' }),
        `Every page can be reached, nobody gets stuck or trapped${a.endings.length ? `, and ${reached} of ${a.endings.length} endings can be reached` : ''}. (${a.states.toLocaleString('en')} situations checked.)`
      ])
    );
  if (a.pruned)
    wrap.appendChild(
      h('div', {
        class: 'hint',
        text: 'This story is large, so the checker forgets each number once no later page can read it. That keeps the check fast and gives the same answers; explanations leave out numbers that no longer matter.'
      })
    );
  if (adv('map')) {
    const sc = shapeCard();
    if (sc) wrap.appendChild(sc);
  }
  function issue(kind, it) {
    const p = it.pid ? byId(it.pid) : null;
    return h('div', { class: `issue ${kind}` }, [
      it.items
        ? h('span', { class: 'iico' }, [
            icon(it.kind === 'given' ? 'givens' : it.kind === 'state' ? 'heart' : it.kind === 'stat' ? 'meter' : 'gift', 16)
          ])
        : null,
      h('div', { class: 't', text: it.msg }),
      it.items
        ? h('button', {
            class: 'btn small',
            type: 'button',
            text: 'Open Items',
            title: 'Go to the Items tab',
            onclick: function () {
              setView('items');
            }
          })
        : null,
      p
        ? h('button', {
            class: 'btn small',
            type: 'button',
            text: kind === 'bad' && !it.items ? 'Fix it' : 'Open page',
            title: `Open “${pname(p)}” in the Write tab`,
            onclick: function () {
              openPage(p);
            }
          })
        : null
    ]);
  }
  a.problems.forEach(it => {
    wrap.appendChild(issue('bad', it));
  });
  if (a.warnings.length) {
    wrap.appendChild(h('h2', { class: 'sec', text: 'Things to look at' }));
    a.warnings.forEach(it => {
      wrap.appendChild(issue('warn', it));
    });
  }
  wrap.appendChild(writingCard());
  const unfinished = project.passages.filter(p => p.todo);
  if (unfinished.length) {
    // the author's own bookmarks; never a problem, never shown to players
    wrap.appendChild(h('h2', { class: 'sec', text: `Unfinished pages (${unfinished.length})` }));
    unfinished.forEach(p => {
      wrap.appendChild(
        h('div', { class: 'issue todo' }, [
          h('span', { class: 'iico' }, [icon('todo', 16)]),
          h('div', { class: 't', text: `${pname(p)} is marked unfinished.` }),
          h('button', {
            class: 'btn small',
            type: 'button',
            text: 'Mark finished',
            title: 'Clear the flag',
            onclick: function () {
              p.todo = false;
              refresh();
            }
          }),
          h('button', {
            class: 'btn small',
            type: 'button',
            text: 'Open page',
            title: `Open “${pname(p)}” in the Write tab`,
            onclick: function () {
              openPage(p);
            }
          })
        ])
      );
    });
  }
  const pins = routesFor(project.id).pinned;
  if (pins.length) {
    const results = pins.map(pn => ({ pn, res: routeReplay(project, pn.route) }));
    const works = results.filter(x => !x.res.problem).length;
    wrap.appendChild(h('h2', { class: 'sec', text: `Pinned routes (${works} of ${pins.length} still work)` }));
    results.forEach(({ pn, res }) => {
      wrap.appendChild(
        h('div', { class: `issue ${res.problem ? 'warn' : 'ok'}` }, [
          h('span', { class: 'iico' }, [icon(res.problem ? 'frown' : 'smile', 16)]),
          h('div', { class: 't', text: res.problem ? `${pn.name}: ${res.problem.text}` : `${pn.name}: all ${res.total} pages can still be played in this order.` }),
          h('button', {
            class: 'btn small',
            type: 'button',
            text: res.problem ? 'Play to where it stops' : 'Play it',
            onclick: function () {
              playRoutePending = pn.route;
              setView('play');
            }
          })
        ])
      );
    });
  }
  if (a.notes?.length) {
    // folded: worth knowing, not mistakes
    const d = h('details', { class: 'notes' }, [
      h('summary', {
        text: `Good to know (${a.notes.length})`,
        title: 'Not mistakes: optional choices a player can miss for good, and items given or taken where it makes no difference'
      })
    ]);
    a.notes.forEach(it => {
      d.appendChild(issue('note', it));
    });
    wrap.appendChild(d);
  }
  const dc = checksCard();
  if (dc) wrap.appendChild(dc);
  if (adv('map')) {
    const uc = unreachedCard(a);
    if (uc) wrap.appendChild(uc);
  }
  if (adv('map')) {
    const pc = pacingCard();
    if (pc) wrap.appendChild(pc);
  }
  if (a.endings.length) {
    wrap.appendChild(h('h2', { class: 'sec', text: 'Endings' }));
    const t = h('div', { class: 'table' });
    const sim = adv('map') ? simulated() : null;
    a.endings.forEach(e => {
      let odds = '';
      if (sim && sim.runs) {
        const mine = sim.ends.map((id, i) => (id === e.pid ? i : -1)).filter(i => i >= 0);
        if (mine.length) {
          const mean = mine.reduce((n, i) => n + sim.words[i], 0) / mine.length;
          odds = `${Math.round((mine.length / sim.runs) * 1000) / 10}% of simulated players end here, after ${sayMinutes(mean)} of reading.`;
        } else odds = 'No simulated player ended here.';
      }
      const way = e.reachable
        ? e.path.length
          ? `Shortest way there: ${e.path.map(s => (s.given ? `as ${s.label}` : `“${s.label}”`)).join(' → ')}`
          : 'It is the first page.'
        : e.reachable === null
          ? 'Not found before the check stopped; it may still be reachable.'
          : 'Nobody can reach this ending.';
      const st = e.reachable ? ['ok', 'reachable'] : e.reachable === null ? ['neutral', 'not checked'] : ['bad', 'unreachable'];
      t.appendChild(
        h('div', { class: 'r' }, [
          h('span', { class: `pill ${st[0]}`, text: st[1] }),
          h('span', { class: `pill ${e.valence === 'good' ? 'ok' : e.valence === 'bad' ? 'bad' : 'neutral'}` }, [
            e.valence === 'good' ? icon('smile', 13) : e.valence === 'bad' ? icon('frown', 13) : null,
            (e.valence ? ' ' : '') + (e.valence === 'good' ? 'good ending' : e.valence === 'bad' ? 'bad ending' : 'neutral')
          ]),
          h('div', { class: 't' }, [
            h('div', { text: e.heading || e.name || 'Ending' }),
            h('div', { class: 'hint', text: way }),
            odds ? h('div', { class: 'hint', text: odds }) : null,
            adv('map') && e.reachable ? endingExplorer(e, a) : null
          ]),
          h('button', {
            class: 'btn small',
            type: 'button',
            text: 'Open',
            title: 'Open this ending in the Write tab',
            onclick: function () {
              openPage(byId(e.pid));
            }
          })
        ])
      );
    });
    wrap.appendChild(t);
  }
  main.appendChild(wrap);
}

/**
 * "Why can't I reach this page?" (or: how do players get there). Plain words, built from analyze().why(): every choice that leads to
 * the page, and what keeps players from being offered it. Asking "Why not?" about the page a choice starts on follows the chain back.
 */
function whyDialog(pid) {
  const a = freshAnalysis();
  const p = byId(pid);
  const w = a.why && p ? a.why(pid) : null;
  dialog((d, close) => {
    d.classList.add('wide');
    d.appendChild(h('h3', { text: w && w.reachable ? `How players reach “${pname(p)}”` : `Why can’t players reach “${pname(p)}”?` }));
    if (!w) {
      d.appendChild(h('div', { class: 'hint', text: 'That page is no longer in the story.' }));
    } else if (w.reachable === null) {
      d.appendChild(h('div', { class: 'banner' }, ['The story is too large to check completely, so I cannot say for certain whether players can reach this page.']));
    } else if (w.reachable) {
      const one = a.samples(pid, 1)[0];
      d.appendChild(
        h('div', { class: 'banner good' }, [
          h('strong', { text: 'Players can reach this page. ' }),
          w.isStart || !one || !one.path.length
            ? 'It is the first page of the story.'
            : `The quickest way: ${one.path.map(s => (s.given ? `as ${s.label}` : `“${s.label}”`)).join(' → ')}.`
        ])
      );
    } else {
      d.appendChild(
        h('div', { class: 'banner bad' }, [h('strong', { text: 'No player can get here. ' }), 'Here is what stops each way in.'])
      );
    }
    if (w) {
      const list = h('div', { class: 'whylist' });
      if (!w.incoming.length && !w.isStart)
        list.appendChild(
          h('div', { class: 'issue bad' }, [
            h('div', { class: 't', text: 'No choice on any page leads here. Add a choice on another page and point it at this one (or drag this page onto a choice).' })
          ])
        );
      w.incoming.forEach(r => {
        const q = `“${r.label || 'a choice with no words yet'}”`;
        const where = `“${r.fromName}”`;
        const terms = r.blockers.map(b =>
          b.kind === 'needs'
            ? `${itemName(b.id)} (nobody who gets to ${where} has it)`
            : b.kind === 'forbid'
              ? `to not have ${itemName(b.id)} (everybody who gets to ${where} has it)`
              : 'all of its conditions at once (no player can meet them together)'
        );
        let msg;
        let tone = 'bad';
        if (!r.fromReached) msg = `${q} on ${where} leads here${r.fail ? ' when its roll fails' : ''}, but no player can reach ${where} either.`;
        else if (!r.offered) msg = `${q} on ${where} leads here, but it is never offered. It needs ${joinAnd(terms)}.`;
        else if (r.roll === 'never-wins') msg = `${q} on ${where} leads here only when its roll succeeds, and the roll can never succeed (the number is too low for the target).`;
        else if (r.roll === 'never-fails') msg = `${q} on ${where} leads here only when its roll fails, and the roll can never fail (the number is always high enough).`;
        else {
          msg = `${q} on ${where} leads here${r.fail ? ' when its roll fails' : ''}, and some players are offered it.`;
          tone = 'note';
        }
        list.appendChild(
          h('div', { class: `issue ${w.reachable ? 'note' : tone}` }, [
            h('div', { class: 't', text: msg }),
            !r.fromReached
              ? h('button', {
                  class: 'btn small',
                  type: 'button',
                  text: `Why not “${r.fromName}”?`,
                  title: 'Ask the same question about that page',
                  onclick: function () {
                    close();
                    whyDialog(r.from);
                  }
                })
              : null,
            h('button', {
              class: 'btn small',
              type: 'button',
              text: 'Open page',
              title: `Open “${r.fromName}” in the Write tab`,
              onclick: function () {
                close();
                openPage(byId(r.from));
              }
            })
          ])
        );
      });
      d.appendChild(list);
    }
    d.appendChild(
      h('div', { class: 'row end' }, [
        p
          ? h('button', {
              class: 'btn',
              type: 'button',
              text: 'Open this page',
              onclick: function () {
                close();
                openPage(p);
              }
            })
          : null,
        h('button', { class: 'btn primary', type: 'button', text: 'Close', onclick: close })
      ])
    );
  });
}

/**
 * "Pages nobody reached": pages that none of the simulated players visited. A page the checker proves nobody can reach is listed as
 * unreachable; a page that can be reached but that no simulated player found is listed as very unlikely. Both can ask "Why?".
 */
function unreachedCard(a) {
  const pt = simulated();
  if (!pt.runs) return null;
  const seen = playtestCount(pt).visits;
  const rows = project.passages
    .filter(p => !seen[p.id])
    .map(p => {
      const ways = a.samples(p.id, 1).length;
      return { p, can: a.truncated && !ways ? null : ways > 0 };
    });
  if (!rows.length) return null;
  const card = h('div', { class: 'card' }, [
    h('div', { class: 'cardhd' }, [h('strong', { text: `Pages nobody reached (${rows.length})` })]),
    h('div', { class: 'hint', text: `${pt.runs.toLocaleString('en')} simulated players made random choices from the start. These pages were never visited.` })
  ]);
  rows.slice(0, 30).forEach(({ p, can }) => {
    card.appendChild(
      h('div', { class: 'row unreached' }, [
        h('span', { class: `pill ${can === false ? 'bad' : 'neutral'}`, text: can === false ? 'cannot be reached' : can === null ? 'not checked' : 'possible, but very unlikely' }),
        h('span', { class: 'grow', text: pname(p) }),
        h('button', {
          class: 'btn small',
          type: 'button',
          text: 'Why?',
          title: 'Explain what stands between players and this page',
          onclick: function () {
            whyDialog(p.id);
          }
        }),
        h('button', {
          class: 'btn small',
          type: 'button',
          text: 'Open page',
          onclick: function () {
            openPage(p);
          }
        })
      ])
    );
  });
  if (rows.length > 30) card.appendChild(h('div', { class: 'hint', text: `…and ${rows.length - 30} more.` }));
  return card;
}

/* ----- Play tab ----- */

let playStart = null; // a page to start the Play tab from once (set by "Play from here" on the map)
/** Opens the Play tab, starting at page `id`. */
function playFrom(id) {
  playStart = id;
  setView('play');
}

const sessionGivens = {}; // Play tab: givenId -> answer id to use, or absent to ask each time

/**
 * "Choose what they have…": a dialog to set exactly what a tester holds when they arrive on page `p` (objects, states and
 * numbers), then play from there. Warns if the checker found no way to arrive like that (the test still runs on request).
 */
function testDialog(p, play) {
  const a = freshAnalysis();
  dialog((d, close) => {
    const picks = {};
    const nums = {};
    d.appendChild(h('h3', { text: `Test from “${pname(p)}”` }));
    d.appendChild(h('div', { class: 'hint', text: 'Choose what the player has when they arrive. Anything you leave unticked, they do not have.' }));
    const list = h('div', { class: 'testlist' });
    project.items
      .filter(i => i.kind !== 'stat' && !givenOf(project, i.id))
      .forEach(i => {
        list.appendChild(
          h('label', { class: 'chk' }, [
            h('input', {
              type: 'checkbox',
              onchange: function (e) {
                picks[i.id] = e.target.checked;
                warn.hidden = true;
                go.textContent = 'Play from here';
              }
            }),
            itemIcon(i, 13),
            i.name
          ])
        );
      });
    statItems().forEach(st => {
      nums[st.id] = st.start;
      list.appendChild(
        h('label', { class: 'numf' }, [
          icon('meter', 13),
          `${st.name} `,
          h('input', {
            type: 'number',
            class: 'in chipnum',
            value: String(st.start),
            min: st.lo,
            max: st.hi,
            'aria-label': `${st.name} (${st.lo} to ${st.hi})`,
            onchange: function (e) {
              nums[st.id] = Math.max(st.lo, Math.min(st.hi, Math.round(Number(e.target.value)) || 0));
              e.target.value = String(nums[st.id]);
              warn.hidden = true;
              go.textContent = 'Play from here';
            }
          }),
          h('span', { class: 'hint', text: `(${st.lo} to ${st.hi})` })
        ])
      );
    });
    if (!list.childNodes.length) list.appendChild(h('div', { class: 'hint', text: 'This story has no objects, states or numbers yet.' }));
    d.appendChild(list);
    const warn = h('div', { class: 'banner', hidden: true }, [
      'The checker found no way for a player to arrive here like this, so a real player never would. You can still try it.'
    ]);
    d.appendChild(warn);
    const flags = () => {
      const f = {};
      Object.keys(picks).forEach(id => picks[id] && (f[id] = true));
      Object.keys(nums).forEach(id => nums[id] && (f[`v:${id}`] = nums[id]));
      return f;
    };
    const go = h('button', {
      class: 'btn primary',
      type: 'button',
      text: 'Play from here',
      onclick: function () {
        const f = flags();
        if (warn.hidden && a.canArrive && a.canArrive(p.id, f) === false) {
          warn.hidden = false;
          go.textContent = 'Play anyway';
          return;
        }
        close();
        play(f);
      }
    });
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close }), go]));
  });
}

/**
 * The Game tab (only while the Game switch in Options → Advanced is on): the reader options for exported games on the left,
 * and on the right this story running in the real game player with those options, so every choice can be seen at once.
 * Hovering over, tabbing to or arrowing through the colors shows each one in the preview; clicking (or Enter) keeps it.
 */
function renderGame(main) {
  const box = h('div', { class: 'playbox' });
  const trying = h('div', { class: 'hint pal-trying', role: 'status', 'aria-live': 'polite' });
  let story = null;
  /** Shows the colors of palette `k` in the preview, or (null) the kept ones, without restarting the story. */
  function showPal(k) {
    const key = k || project.game.pal;
    if (story) story.game.pal = key; // pages the reader opens next are drawn in these colors too
    box.querySelectorAll('.kl').forEach(w => (key === 'paper' ? w.removeAttribute('data-pal') : w.setAttribute('data-pal', key)));
    trying.textContent = k && k !== project.game.pal ? `Trying “${PALETTES[k].name}”. Click it to keep it.` : `Colors: ${PALETTES[key].name}.`;
  }
  function start() {
    box.textContent = '';
    story = exportStory(project);
    story.game = story.game || {};
    klPlayer(box, story, { persist: false, startId: project.start, givens: sessionGivens });
    showPal(null);
  }
  const opts = gameOptions(
    key => {
      if (key === 'pal') {
        opts.querySelectorAll('.palbtn').forEach(b => {
          const on = b.getAttribute('data-pal') === project.game.pal;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        showPal(null);
      } else start();
    },
    k => showPal(k)
  );
  main.appendChild(
    h('div', { class: 'gametab' }, [
      h('div', { class: 'gamecol' }, [
        h('h2', { class: 'sec', text: 'Game' }),
        h('div', { class: 'hint', text: 'How exported games look and behave. The Game tab shows because its switch is on in Options → Advanced.' }),
        opts
      ]),
      h('div', { class: 'gamecol' }, [
        h('h2', { class: 'sec', text: 'Preview' }),
        h('div', { class: 'hint', text: 'Your story as a player will see it. Hover over or arrow through the colors to try each one; click to keep it.' }),
        trying,
        box,
        h('div', { class: 'row' }, [
          h('button', { class: 'btn', type: 'button', text: 'Start the preview over', onclick: start })
        ])
      ])
    ])
  );
  start();
}

/* ----- pinned routes (see routes.js) ----- */
let liveRoute = null; // the route of the run in the Play tab
let playRoutePending = null; // a route the Check tab asked the Play tab to walk
let routeUi = null; // redraws the route row of the Play tab, if it is on screen

/** Records each page of the run in the Play tab as it is drawn. */
function routeNote(pid, flags, moved, story) {
  const r = liveRoute;
  if (!r || !byId(pid)) return;
  const name = pname(byId(pid));
  if (!r.steps.length) {
    r.start = pid;
    r.answers = {};
    (story.givens || []).forEach(g => {
      const a = (g.options || []).find(o => flags[o]);
      if (a) r.answers[g.id] = a;
    });
    r.steps.push({ id: pid, name });
  } else if (!moved) return;
  else if (routeIsBack(r.steps, pid, project)) r.steps.pop();
  else if (r.steps.length < ROUTE_MAX_STEPS) r.steps.push({ id: pid, name });
  const s = routesFor(project.id);
  routesSave(project.id, { last: r.steps.length > 1 ? { start: r.start, flags0: r.flags0, answers: r.answers, steps: r.steps } : s.last, pinned: s.pinned });
  routeUi && routeUi();
}

/** The sentence for a replay result, shown above the story. */
function routeResultText(res) {
  return res.problem
    ? `Back at “${pname(byId(res.at)) || '?'}” after ${res.done} of ${res.total} pages. ${res.problem.text}`
    : `Back where you were: all ${res.total} pages replayed with the current story.`;
}

/** The "Pinned routes" window: replay, remove, and say which ones still work. */
function pinnedDialog(replay) {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Pinned routes' }));
    d.appendChild(h('div', { class: 'hint', text: 'A pinned route is a path you played and want to keep trying. After you edit the story, each one is walked again with the game’s own rules; it works if every step is still possible. They are kept in this browser, not in the story file.' }));
    const list = h('div', { class: 'pinlist' });
    const draw = () => {
      list.textContent = '';
      const s = routesFor(project.id);
      if (!s.pinned.length) list.appendChild(h('div', { class: 'hint', text: 'Nothing pinned yet. Play a route, then choose “Pin this route”.' }));
      s.pinned.forEach((pn, i) => {
        const res = routeReplay(project, pn.route);
        list.appendChild(
          h('div', { class: `issue ${res.problem ? 'warn' : 'ok'}` }, [
            h('div', { class: 't' }, [
              h('strong', { text: pn.name }),
              h('div', { class: 'hint', text: routeLine(pn.route) }),
              h('div', { text: res.problem ? res.problem.text : `Works: all ${res.total} pages can still be played in this order.` })
            ]),
            h('button', { class: 'btn small', type: 'button', text: res.problem ? 'Play to where it stops' : 'Play it', onclick: () => { close(); replay(pn.route); } }),
            h('button', {
              class: 'btn small',
              type: 'button',
              text: 'Remove',
              onclick: () => {
                const t = routesFor(project.id);
                t.pinned.splice(i, 1);
                routesSave(project.id, t);
                draw();
                routeUi && routeUi();
              }
            })
          ])
        );
      });
    };
    draw();
    d.appendChild(list);
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Done', onclick: close })]));
  });
}

function renderPlay(main) {
  const p = byId(selId);
  const box = h('div', { class: 'playbox' });
  /* one menu per Given: ask each time, or always use one answer while testing */
  const gRow = project.givens
    .filter(g => g.options.length && adv('items'))
    .map(g => {
      const sel = h(
        'select',
        {
          class: 'in',
          'aria-label': g.question,
          title: `For testing: answer “${g.question}” automatically, or be asked each time`,
          onchange: function () {
            if (sel.value) sessionGivens[g.id] = sel.value;
            else delete sessionGivens[g.id];
            start(playFrom0);
          }
        },
        [h('option', { value: '', text: 'Ask each time' })].concat(g.options.map(id => h('option', { value: id, text: itemName(id) })))
      );
      sel.value = sessionGivens[g.id] && g.options.includes(sessionGivens[g.id]) ? sessionGivens[g.id] : '';
      return h('label', { class: 'gpick' }, [icon('givens', 15), g.question, sel]);
    });
  var playFrom0 = null;
  /* "Test from here": arrive on the page you are editing the way real players do (the checker's own examples), or with things you choose */
  const a = freshAnalysis();
  const samples = p && p.id !== project.start && a.samples ? a.samples(p.id) : [];
  let testRow = null;
  if (p && p.id !== project.start && (samples.length || project.items.length)) {
    const sel = h(
      'select',
      {
        class: 'in',
        'aria-label': `Test from “${pname(p)}” as a player who has…`,
        title: 'Start on this page holding what real players could have when they get here',
        onchange: function () {
          const v = sel.value;
          sel.value = '';
          if (v === 'pick') testDialog(p, f => start(p.id, f));
          else if (v) start(p.id, samples[Number(v)].flags);
        }
      },
      [h('option', { value: '', text: `Test from “${pname(p)}” as…` })]
        .concat(samples.map((sm, i) => h('option', { value: String(i), text: `${i === 0 ? 'Quickest route: ' : ''}${sm.held}` })))
        .concat(project.items.length ? [h('option', { value: 'pick', text: 'Choose what they have…' })] : [])
    );
    testRow = h('div', { class: 'row gpicks' }, [icon('play', 15), sel]);
  }
  /* the route so far: pin it, or go back to where you were after editing */
  const routeNoteEl = h('div', { class: 'hint routenote', role: 'status', 'aria-live': 'polite', hidden: true });
  const routeLineEl = h('span', { class: 'routeline' });
  const pinBtn = h('button', { class: 'btn small', type: 'button', text: 'Pin this route', title: 'Keep the pages you have played so far, to walk again after you edit the story' });
  const backBtn = h('button', { class: 'btn small', type: 'button', text: 'Continue where I was', title: 'Replay your last route with the story as it is now and carry on from the last page that still works' });
  const pinsBtn = h('button', { class: 'btn small', type: 'button' });
  const routeRow = h('div', { class: 'row gpicks routerow' }, [icon('mv-flow', 15), routeLineEl, pinBtn, backBtn, pinsBtn]);
  const redrawRoute = () => {
    if (!routeRow.isConnected) return;
    const s = routesFor(project.id);
    const r = liveRoute && liveRoute.steps.length > 1 ? liveRoute : null;
    routeLineEl.textContent = r ? `Route: ${routeLine(r)}` : 'Route: nothing played yet';
    pinBtn.disabled = !r || s.pinned.length >= ROUTE_MAX_PINNED;
    backBtn.hidden = !s.last;
    pinsBtn.textContent = `Pinned routes (${s.pinned.length})…`;
  };
  routeUi = redrawRoute;
  /** Walks `route` on the story as it is now, then plays on from where it stops. */
  const replay = route => {
    const res = routeReplay(project, route);
    if (!res.at) {
      routeNoteEl.textContent = res.problem.text;
      routeNoteEl.hidden = false;
      return;
    }
    start(res.at, res.flags, { start: route.start, flags0: route.flags0, answers: route.answers, steps: route.steps.slice(0, res.done) });
    routeNoteEl.textContent = routeResultText(res);
    routeNoteEl.hidden = false;
  };
  pinBtn.onclick = () => {
    const r = liveRoute;
    dialog((d, close) => {
      d.appendChild(h('h3', { text: 'Pin this route' }));
      d.appendChild(h('div', { class: 'hint', text: routeLine(r) }));
      const nm = h('input', { class: 'in', type: 'text', maxlength: '60', 'aria-label': 'Name for this route' });
      nm.value = `${r.steps[0].name} to ${r.steps[r.steps.length - 1].name}`.slice(0, 60);
      d.appendChild(nm);
      const ok = () => {
        const s = routesFor(project.id);
        s.pinned.push({ name: nm.value.trim() || 'Route', route: { start: r.start, flags0: r.flags0, answers: r.answers, steps: r.steps.slice() } });
        routesSave(project.id, s);
        close();
        redrawRoute();
        toast('Route pinned.');
      };
      nm.addEventListener('keydown', e => e.key === 'Enter' && ok());
      d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: close }), h('button', { class: 'btn primary', type: 'button', text: 'Pin it', onclick: ok })]));
      setTimeout(() => nm.select(), 0);
    });
  };
  backBtn.onclick = () => {
    const s = routesFor(project.id);
    if (s.last) replay(s.last);
  };
  pinsBtn.onclick = () => pinnedDialog(replay);
  const wrap = h('div', { class: 'wrap' }, [
    h('h2', { class: 'sec', text: 'Play it' }),
    h('div', { class: 'row' }, [
      h('button', {
        class: 'btn primary',
        type: 'button',
        text: 'Play from the beginning',
        onclick: function () {
          start(null);
        }
      }),
      p && p.id !== project.start
        ? h('button', {
            class: 'btn',
            type: 'button',
            text: `Play from “${pname(p)}”`,
            title: 'Starts at the page you are editing, with empty pockets',
            onclick: function () {
              start(p.id);
            }
          })
        : null
    ]),
    testRow,
    gRow.length ? h('div', { class: 'row gpicks' }, gRow) : null,
    routeRow,
    routeNoteEl,
    h('div', { class: 'hint', text: 'This is exactly how your exported game behaves. Nothing you do here is saved.' }),
    box
  ]);
  main.appendChild(wrap);
  function start(id, flags, seed) {
    playFrom0 = id;
    box.textContent = '';
    if (!seed) routeNoteEl.hidden = true;
    liveRoute = seed ? { start: seed.start, flags0: seed.flags0, answers: seed.answers, steps: seed.steps.slice() } : { start: id || project.start, flags0: flags ? Object.assign({}, flags) : null, answers: {}, steps: [] };
    const story = exportStory(project);
    redrawRoute();
    klPlayer(box, story, { persist: false, startId: id || project.start, givens: sessionGivens, flags, exact: !!flags, onPage: (pid, f, moved) => routeNote(pid, f, moved, story) });
  }
  start(playStart);
  playStart = null;
  if (playRoutePending) {
    const r = playRoutePending;
    playRoutePending = null;
    replay(r);
  }
}
