/* ---------------------------------------------------------------------------
   3c. The Write screen
   ----------------------------------------------------------------------------
   Left: the page list.  Right: the item list.  Center: the page editor, which
   is deliberately short. From top to bottom it has just four rows:
     1. Page bar    name · heading · first-page star · play · ⋯
     2. Type and    page / ending / good / bad, then three small boxes for what
        arrival     happens on arrival: Gets · Loses (one line when it fits; Hands over is hidden for now)
     3. Text        paragraphs, each with optional "only if" conditions
     4. Choices     one line per choice: words · destination · tools
   Drag a page onto a choice to link it; drag an item onto a paragraph or a
   choice to show it only when the player has that item.
   --------------------------------------------------------------------------- */

/* ----- item pickers ----- */

/** Asks for a name, makes a new object, state or number, and hands its id to `then`. */
function createItem(kind, then) {
  const word = kind === 'state' ? 'state' : kind === 'stat' ? 'number' : 'object';
  promptDialog(
    `New ${word}`,
    [
      {
        label:
          kind === 'state'
            ? 'Name (for example: Hungover, Brave, Poisoned)'
            : kind === 'stat'
              ? 'Name (for example: Courage, Strength, Money)'
              : 'Name (for example: Brass key, Wallet)'
      }
    ],
    'Add'
  ).then(v => {
    if (!v || !v[0]) {
      refresh();
      return;
    }
    const it = makeItem(v[0], kind);
    project.items.push(it);
    if (then) then(it.id);
    refresh();
    toast(
      kind === 'stat'
        ? `Added the number “${it.name}” (${it.lo} to ${it.hi}, starting at ${it.start}). Change its range on the Items tab.`
        : `Added the ${word} “${it.name}”. You can rename it on the Items tab.`
    );
  });
}

/** An item dragged onto a paragraph or choice, as a condition id: a number becomes "number or more" (halfway up its range to begin with). */
function condIdFor(id) {
  const st = id.indexOf('t:') !== 0 && itemById(id);
  return st && st.kind === 'stat' ? statTest(id, Math.max(st.lo + 1, Math.ceil((st.lo + st.hi) / 2))) : id;
}

/** The statistic items (numbers), in list order. */
const statItems = () => project.items.filter(i => i.kind === 'stat');
/** Number tests ("Courage 5 or more") are offered when the Items switch is on, or when the story already has numbers. */
const numbersShown = () => adv('items') || statItems().length > 0;

/**
 * A row of removable chips plus a "+ add" menu, editing the id list `list` in place.
 * Items can also be dropped onto it. Options (o):
 *   noMoved      leave "where things went" records out (effects can only use real items)
 *   skip(id)     hide ids that another box already shows
 *   noGivens     leave Given answers out (Givens are fixed: pages cannot give or take them)
 *   placeholder  text of the closed menu (default "+ add")
 */
function chips(list, onChange, o = {}) {
  const box = h('div', { class: 'chips' });
  list.forEach(id => {
    if (o.skip && o.skip(id)) return;
    const k = itemKind(id);
    const nm = itemName(id);
    const gv = k === 'state' && givenOf(project, id);
    const t = parseStatTest(id);
    const statItem = t && itemById(t.stat);
    const remove = h(
      'button',
      {
        type: 'button',
        title: `Remove “${nm}”`,
        'aria-label': `Remove ${nm}`,
        onclick: function () {
          list.splice(list.indexOf(id), 1);
          onChange();
        }
      },
      ['×']
    );
    if (statItem) {
      /* a number test: the number can be changed right in the chip */
      const num = h('input', {
        type: 'number',
        class: 'chipnum',
        value: String(t.n),
        min: statItem.lo + 1,
        max: statItem.hi,
        'aria-label': `${statItem.name}: the number to reach`,
        title: `${statItem.name} runs from ${statItem.lo} to ${statItem.hi}`,
        onchange: function (e) {
          const n = Math.max(statItem.lo + 1, Math.min(statItem.hi, Math.round(Number(e.target.value)) || t.n));
          const nid = statTest(statItem.id, n);
          if (!list.includes(nid)) list[list.indexOf(id)] = nid;
          onChange();
        }
      });
      box.appendChild(
        h('span', { class: 'chip stat', title: `A number: ${statItem.name}` }, [icon('meter', 12), statItem.name, num, 'or more', remove])
      );
      return;
    }
    box.appendChild(
      h(
        'span',
        {
          class: `chip${gv ? ' given' : k === 'state' ? ' state' : k === 'moved' ? ' moved' : ''}`,
          title: gv ? `An answer to “${gv.question}”` : k === 'state' ? 'A state' : k === 'moved' ? 'A record of where an object went' : 'An object'
        },
        [k === 'moved' ? null : icon(gv ? 'givens' : k === 'state' ? 'heart' : 'gift', 12), nm, remove]
      )
    );
  });
  const avail = project.items.filter(i => !list.includes(i.id) && !(o.skip && o.skip(i.id)));
  function opt(i) {
    return h('option', { value: i.id, text: i.name });
  }
  const objs = avail.filter(i => kindOf(i) === 'object');
  const sts = avail.filter(i => i.kind === 'state' && !givenOf(project, i.id));
  const opts = [h('option', { value: '', text: o.placeholder || '+ add' })];
  if (objs.length) opts.push(h('optgroup', { label: 'Objects' }, objs.map(opt)));
  if (sts.length) opts.push(h('optgroup', { label: 'States' }, sts.map(opt)));
  /* numbers: "Courage 6 or more" and so on, only where a test makes sense (conditions, not Gets / Loses) */
  const nums = !o.noGivens && numbersShown() ? statItems() : [];
  nums.forEach(st => {
    const span = st.hi - st.lo;
    const step = span <= 12 ? 1 : span <= 40 ? 5 : 10;
    const ns = [];
    for (let n = st.lo + 1; n <= st.hi; n += step) ns.push(n);
    if (ns[ns.length - 1] !== st.hi) ns.push(st.hi);
    const opts2 = ns
      .filter(n => !list.includes(statTest(st.id, n)))
      .map(n => h('option', { value: statTest(st.id, n), text: `${st.name} ${n} or more` }));
    if (span > 12) opts2.push(h('option', { value: `__tn:${st.id}`, text: `${st.name}: another number…` }));
    if (opts2.length) opts.push(h('optgroup', { label: `Number: ${st.name} (${st.lo} to ${st.hi})` }, opts2));
  });
  if (!o.noGivens && adv('items'))
    project.givens.forEach(g => {
      // each Given's answers, under its question
      const ans = avail.filter(i => g.options.includes(i.id));
      if (ans.length) opts.push(h('optgroup', { label: `Given: ${g.question}` }, ans.map(opt)));
    });
  const mv = o.noMoved || !HANDS_OVER ? [] : virtualRefs(project).filter(v => !list.includes(v.id));
  if (mv.length)
    opts.push(
      h(
        'optgroup',
        { label: 'Where things went' },
        mv.map(v => h('option', { value: v.id, text: v.label }))
      )
    );
  opts.push(
    h(
      'optgroup',
      { label: 'Create' },
      [h('option', { value: '__newo', text: 'New object…' }), h('option', { value: '__news', text: 'New state…' })].concat(
        !o.noGivens && adv('items') ? [h('option', { value: '__newn', text: 'New number…' })] : []
      )
    )
  );
  const sel = h(
    'select',
    {
      'aria-label': 'Add an object or state',
      title: 'Add an object or a state',
      onchange: function () {
        const v = sel.value;
        if (v === '__newo' || v === '__news' || v === '__newn')
          createItem(v === '__news' ? 'state' : v === '__newn' ? 'stat' : 'object', id => {
            list.push(v === '__newn' ? statTest(id, 5) : id);
          });
        else if (v.indexOf('__tn:') === 0) {
          const st = itemById(v.slice(5));
          promptDialog(
            `${st.name} test`,
            [{ label: `Number to reach (${st.lo + 1} to ${st.hi})`, value: String(Math.ceil((st.lo + st.hi) / 2)) }],
            'Add'
          ).then(r => {
            const n = r && Math.round(Number(r[0]));
            if (n > st.lo && n <= st.hi && !list.includes(statTest(st.id, n))) list.push(statTest(st.id, n));
            onChange();
          });
        } else if (v) {
          list.push(v);
          onChange();
        }
      }
    },
    opts
  );
  box.appendChild(sel);
  box._drop = id => {
    if (itemKind(id) === 'stat' && id.indexOf('t:') !== 0) {
      /* a number dropped on a condition becomes "number or more" (halfway up its range to begin with) */
      const st = itemById(id);
      if (o.noGivens) {
        toast('A number changes by adding to it or taking from it: use the Numbers row.');
        return;
      }
      id = statTest(id, Math.max(st.lo + 1, Math.ceil((st.lo + st.hi) / 2)));
    }
    if (id.indexOf('m:') === 0 && o.noMoved) {
      toast('That is a record of where something went. Use it in an “only if” box instead.');
      return;
    }
    if (o.noGivens && givenOf(project, id)) {
      toast('A Given stays the same for the whole story. Use it in an “only if” box instead.');
      return;
    }
    if (!list.includes(id)) {
      list.push(id);
      onChange();
      toast(`Added “${itemName(id)}”.`);
    }
  };
  dropZone(box, box._drop, DRAGI);
  return box;
}

/**
 * The "Numbers" box: changes to numbers (stats), { statId: +2 }, edited in place. Each chip has the number's name, a
 * signed amount and a remove button; a menu adds the next number. `adds` is changed in place.
 */
function numbersBox(adds, onChange) {
  const box = h('div', { class: 'chips numbox' });
  Object.keys(adds).forEach(id => {
    const st = itemById(id);
    if (!st) return;
    const amt = h('input', {
      type: 'number',
      class: 'chipnum',
      value: String(adds[id]),
      min: -(st.hi - st.lo),
      max: st.hi - st.lo,
      'aria-label': `Change to ${st.name}`,
      title: `How much ${st.name} goes up (or down, if negative). It always stays between ${st.lo} and ${st.hi}.`,
      onchange: function (e) {
        const d = Math.round(Number(e.target.value));
        if (d) adds[id] = d;
        else delete adds[id];
        onChange();
      }
    });
    box.appendChild(
      h('span', { class: 'chip stat', title: `${st.name} changes by this much (stays between ${st.lo} and ${st.hi})` }, [
        icon('meter', 12),
        st.name,
        amt,
        h(
          'button',
          {
            type: 'button',
            title: `Remove the change to ${st.name}`,
            'aria-label': `Remove the change to ${st.name}`,
            onclick: function () {
              delete adds[id];
              onChange();
            }
          },
          ['×']
        )
      ])
    );
  });
  const avail = statItems().filter(st => !(st.id in adds));
  const sel = h(
    'select',
    {
      'aria-label': 'Change a number',
      title: 'Raise or lower a number, such as Courage',
      onchange: function () {
        const v = sel.value;
        if (v === '__newn') createItem('stat', id => (adds[id] = 1));
        else if (v) {
          adds[v] = 1;
          onChange();
        }
      }
    },
    [h('option', { value: '', text: '+ number' })].concat(
      avail.map(st => h('option', { value: st.id, text: st.name })),
      adv('items') ? [h('option', { value: '__newn', text: 'New number…' })] : []
    )
  );
  box.appendChild(sel);
  box._drop = id => {
    if (itemKind(id) !== 'stat' || id.indexOf('t:') === 0) {
      toast('Only numbers can be changed here. Drop objects and states on Gets or Loses.');
      return;
    }
    if (!(id in adds)) adds[id] = 1;
    onChange();
  };
  dropZone(box, box._drop, DRAGI);
  return box;
}

/** Every recipient already typed anywhere ("the clerk"), for autocomplete and consistent spelling. */
function allRecipients() {
  const out = [];
  project.passages.forEach(q => {
    Object.keys(q.sends || {}).forEach(id => {
      const sd = parseSend(q.sends[id]);
      if (sd && sd.kind === 'w' && !out.includes(sd.rest)) out.push(sd.rest);
    });
  });
  return out;
}

let focusHand = null; // object whose "handed to" box should get the cursor after the next redraw

/**
 * The "Hands over" box: objects the player gives away or leaves behind on this
 * page. The game remembers it, so "Lantern handed to Pell" can gate later text.
 */
function handBox(p) {
  const recips = allRecipients();
  const rows = p.takes.filter(id => p.sends[id] && itemKind(id) === 'object');
  const box = h('div', { class: 'chips handbox' });
  rows.forEach(id => {
    const cur = p.sends[id];
    const mode = cur === 'here' ? 'here' : 'who';
    const sel = h(
      'select',
      {
        class: 'in',
        'aria-label': `What happens to ${itemName(id)}`,
        title: 'Hand it to someone or something, or leave it on this page',
        onchange: function (e) {
          p.sends[id] = e.target.value === 'here' ? 'here' : 'w:';
          if (e.target.value !== 'here') focusHand = id;
          refresh();
        }
      },
      [h('option', { value: 'who', text: 'handed to…' }), h('option', { value: 'here', text: 'left on this page' })]
    );
    sel.value = mode;
    const row = h('div', { class: 'handrow' }, [
      h('span', { class: 'chip' }, [
        icon('gift', 12),
        itemName(id),
        h(
          'button',
          {
            type: 'button',
            title: 'Stop handing this over',
            'aria-label': `Remove ${itemName(id)}`,
            onclick: function () {
              p.takes.splice(p.takes.indexOf(id), 1);
              delete p.sends[id];
              refresh();
            }
          },
          ['×']
        )
      ]),
      sel
    ]);
    if (mode === 'who') {
      const c2 = parseSend(cur);
      const inp = h('input', {
        class: 'in',
        value: c2 ? c2.rest : '',
        placeholder: 'Who or what? e.g. the clerk',
        'aria-label': 'Handed to',
        title: 'Who or what receives it. Type a name; ones you used before are suggested.',
        list: 'recips',
        maxlength: 60,
        onchange: function (e) {
          let t = e.target.value.trim();
          const lower = t.toLowerCase();
          recips.forEach(r => {
            if (r.toLowerCase() === lower) t = r;
          }); // keep spelling consistent
          const oldV = vidOf(p, id, p.sends[id]);
          p.sends[id] = `w:${t}`;
          const newV = vidOf(p, id, p.sends[id]);
          if (oldV && newV && oldV !== newV) renameVirtual(project, oldV, newV); // conditions follow the rename
          refresh();
        }
      });
      if (focusHand === id) {
        focusHand = null;
        setTimeout(() => {
          inp.focus();
        }, 0);
      }
      row.appendChild(inp);
    }
    box.appendChild(row);
  });
  function add(id) {
    if (!p.takes.includes(id)) p.takes.push(id);
    p.sends[id] = 'w:';
    focusHand = id;
    refresh();
  }
  const avail = project.items.filter(i => kindOf(i) === 'object' && !p.takes.includes(i.id));
  const sel = h(
    'select',
    {
      'aria-label': 'Add an object to hand over',
      title: 'Pick an object to hand over or leave behind',
      onchange: function () {
        if (sel.value === '__newo') createItem('object', add);
        else if (sel.value) add(sel.value);
      }
    },
    [h('option', { value: '', text: '+ add' })].concat(
      avail.map(i => h('option', { value: i.id, text: i.name })),
      [h('option', { value: '__newo', text: 'New object…' })]
    )
  );
  box.appendChild(sel);
  box.appendChild(
    h(
      'datalist',
      { id: 'recips' },
      recips.map(r => h('option', { value: r }))
    )
  );
  box._drop = id => {
    if (itemKind(id) !== 'object') {
      toast('Only objects can be handed over or left behind.');
      return;
    }
    if (p.takes.includes(id)) {
      toast(`“${itemName(id)}” is already in the Loses box. Remove it there first.`);
      return;
    }
    add(id);
  };
  dropZone(box, box._drop, DRAGI);
  return box;
}

/* ----- conditions ("only if the player has / is ...") ----- */

/** The small "if" button on a paragraph or choice that opens its condition row. */
function condToggle(c, what) {
  const has = c.needs.length || c.forbid.length || c.orPrev;
  return h(
    'button',
    {
      class: `iconbtn txt${has || openCond.has(c) ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': has || openCond.has(c) ? 'true' : 'false',
      title: has
        ? `This ${what} only shows sometimes. Change the conditions in the row below.`
        : `Show this ${what} only sometimes: only if the player has an object or is in a state`,
      onclick: function () {
        if (has) return;
        if (openCond.has(c)) openCond.delete(c);
        else openCond.add(c);
        refresh();
      }
    },
    ['if']
  );
}

/** The object-and-state button on a choice (a gift with a heart, as on the Items tab): opens its "When picked" row, where the choice itself gives or takes items. */
function fxToggle(c) {
  const has = (c.gives || []).length || (c.takes || []).length || Object.keys(c.adds || {}).length;
  const on = has || openFx.has(c);
  return h(
    'button',
    {
      class: `iconbtn${on ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      title: has
        ? 'Picking this choice gives or takes something. Change it in the row below.'
        : 'Make this choice give or take an object or state the moment it is picked',
      onclick: function () {
        if (has) return;
        if (openFx.has(c)) openFx.delete(c);
        else openFx.add(c);
        refresh();
      }
    },
    [itemsTabIcon(17)]
  );
}
/** The "When picked" row under a choice: Gets and Loses, applied before the player arrives anywhere (null when not needed). */
function fxLine(c) {
  c.gives = c.gives || [];
  c.takes = c.takes || [];
  c.adds = c.adds || {};
  const used = c.gives.length || c.takes.length || Object.keys(c.adds).length;
  if (!used && !(openFx.has(c) && adv('write'))) return null; // with Write's advanced features off, shown only if already used
  const nums = numbersShown() && (adv('items') || Object.keys(c.adds).length);
  return h(
    'div',
    {
      class: 'condline fxline',
      title: 'Applied the moment the player picks this choice, before they reach the next page. A choice may lead back to its own page.'
    },
    [
      h('span', { class: 'cl', text: 'When picked:' }),
      h('span', { class: 'cl fxg', text: '+ Gets' }),
      chips(
        c.gives,
        () => {
          refresh();
        },
        { noMoved: true, noGivens: true }
      ),
      h('span', { class: 'cl fxl', text: '− Loses' }),
      chips(
        c.takes,
        () => {
          refresh();
        },
        { noMoved: true, noGivens: true }
      ),
      nums ? h('span', { class: 'cl fxn', text: '± Numbers' }) : null,
      nums
        ? numbersBox(c.adds, () => {
            refresh();
          })
        : null
    ]
  );
}

/** The button that turns a choice into a dice check (two dice plus a number against a target) and opens its row. */
function checkToggle(c) {
  const on = !!c.check;
  return h(
    'button',
    {
      class: `iconbtn${on ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      title: on
        ? 'This choice rolls two dice. Click to make it an ordinary choice again.'
        : 'Make this choice a dice check: the player rolls two dice and adds a number such as Courage; reaching the target succeeds',
      onclick: function () {
        if (on) {
          c.check = null;
          refresh();
          return;
        }
        const first = statItems()[0];
        if (first) {
          c.check = { stat: first.id, target: 7, fail: '' };
          refresh();
        } else
          createItem('stat', id => {
            c.check = { stat: id, target: 7, fail: '' };
          });
      }
    },
    [icon('dice', 17)]
  );
}
/** The row under a dice-check choice: which number, the target, where a failed roll goes, and the odds. */
function checkLine(p, c) {
  const k = c.check;
  if (!k) return null;
  const stats = statItems();
  const st = itemById(k.stat);
  const statSel = h(
    'select',
    {
      class: 'in',
      'aria-label': 'Number added to the roll',
      title: 'The number added to the two dice',
      onchange: function (e) {
        if (e.target.value === '__newn') createItem('stat', id => (k.stat = id));
        else {
          k.stat = e.target.value;
          refresh();
        }
      }
    },
    stats.map(x => h('option', { value: x.id, text: x.name })).concat(adv('items') ? [h('option', { value: '__newn', text: 'New number…' })] : [])
  );
  statSel.value = k.stat;
  const target = h('input', {
    type: 'number',
    class: 'in chipnum tgt',
    value: String(k.target),
    'aria-label': 'Target to reach',
    title: 'The dice plus the number must add up to at least this. Two dice make 2 to 12; 7 is an even-ish bet with no bonus.',
    onchange: function (e) {
      k.target = Math.max(-99, Math.min(111, Math.round(Number(e.target.value)) || 0));
      refresh();
    }
  });
  const fail = destButton({
    label: 'Where a failed roll leads',
    cur: k.fail,
    here: p.id,
    newLabel: c.label ? `${c.label.replace(/[.!?]+$/, '')} (fails)` : 'Failed roll',
    onPick: q => {
      k.fail = q.id;
      refresh();
    },
    onNew: name => {
      const np = newPage(name || (c.label ? `${c.label.replace(/[.!?]+$/, '')} (fails)` : 'Failed roll'), true);
      k.fail = np.id;
      toast(`Created “${pname(np)}”.`);
      refresh();
    }
  });
  const odds = st
    ? `Chance: ${klOdds({ [`v:${st.id}`]: st.start }, k)}% at ${st.name} ${st.start}, ${klOdds({ [`v:${st.id}`]: st.hi }, k)}% at ${st.hi}`
    : '';
  return h(
    'div',
    {
      class: 'condline checkline',
      title:
        'The player rolls two dice and adds the number. Reaching the target sends them to the choice’s page; falling short sends them to the failure page.'
    },
    [
      h('span', { class: 'cl', text: 'Roll 2 dice +' }),
      statSel,
      h('span', { class: 'cl', text: 'to reach' }),
      target,
      h('span', { class: 'cl', text: 'else go to' }),
      fail,
      h('span', { class: 'hint odds', text: odds })
    ]
  );
}

/** The one-line condition editor under a paragraph or choice (null when not needed). */
function condLine(c, o) {
  if (!(c.needs.length || c.forbid.length || c.orPrev) && !openCond.has(c)) return null;
  const kids = [];
  if (o.chain) {
    kids.push(
      h('label', { class: 'chk', title: 'Use this text only when the text above it was not shown. Handy for “if you have the key … otherwise …”.' }, [
        h('input', {
          type: 'checkbox',
          checked: c.orPrev ? 'checked' : null,
          onchange: function (e) {
            c.orPrev = e.target.checked;
            refresh();
          }
        }),
        'Otherwise'
      ])
    );
  }
  kids.push(h('span', { class: 'cl', text: 'Only if', title: 'Show only if the player has this object or is in this state' }));
  kids.push(
    chips(c.needs, () => {
      refresh();
    })
  );
  kids.push(h('span', { class: 'cl', text: 'Not if', title: 'Hide when the player has this object or is in this state' }));
  kids.push(
    chips(c.forbid, () => {
      refresh();
    })
  );
  if (o.lock && (c.needs.length || c.forbid.length) && (adv('write') || c.lock)) {
    /* show the choice greyed out, with the reason, instead of hiding it */
    kids.push(
      h(
        'label',
        {
          class: 'chk',
          title: 'Instead of hiding the choice, show it greyed out with a short reason, so the player knows something is waiting for them.'
        },
        [
          h('input', {
            type: 'checkbox',
            checked: c.lock ? 'checked' : null,
            onchange: function (e) {
              c.lock = e.target.checked;
              refresh();
            }
          }),
          'Show greyed out'
        ]
      )
    );
    if (c.lock)
      kids.push(
        h('input', {
          class: 'in whyin',
          value: c.why || '',
          maxlength: 120,
          placeholder: 'Reason (optional; made up for you if empty)',
          'aria-label': 'Reason shown on the greyed-out choice',
          oninput: function (e) {
            c.why = e.target.value;
            commit(`why:${c.label}`);
          }
        })
      );
  }
  return h('div', { class: 'condline' }, kids);
}

/* ----- the page list (left) ----- */

/** Makes a new page. Unless `quiet`, opens it with its name selected, ready to type. */
function newPage(name, quiet) {
  const p = makePassage(name || 'Untitled page');
  project.passages.push(p);
  if (!quiet) {
    selId = p.id;
    view = 'write';
    closeDrawers();
    refresh();
    const m = $('#main');
    if (m) m.scrollTop = 0;
    setTimeout(() => {
      const n = $('#pname');
      if (n) {
        n.focus();
        n.select();
      }
    }, 0);
  }
  return p;
}
/** A new page that already has two empty choices, open and ready to write. */
function newPageTwoChoices() {
  const p = newPage('Untitled page', true);
  p.choices.push(makeChoice('', ''), makeChoice('', ''));
  selId = p.id;
  view = 'write';
  closeDrawers();
  refresh();
  const m = $('#main');
  if (m) m.scrollTop = 0;
  setTimeout(() => {
    const n = $('#pname');
    if (n) {
      n.focus();
      n.select();
    }
  }, 0);
}
/** Opens a page in the Write tab. */
function openPage(p) {
  selId = p.id;
  view = 'write';
  closeDrawers();
  renderAll();
  const m = $('#main');
  if (m) m.scrollTop = 0;
  if (viaKeys) $('#pname')?.focus({ preventScroll: true }); // opened from the keyboard: carry on typing there
}

/** Which pages the checker flagged (for the red dot in the list). */
function problemSet() {
  const s = {};
  (analysis ? analysis.problems : []).forEach(p => {
    s[p.pid] = true;
  });
  return s;
}

/** How far the page list and the item list are scrolled, kept across redraws. */
let pagesScroll = 0;

let itemsScroll = 0;

/** Opens the page picker as a "go to page" box (Ctrl+K). Typing a name that does not exist offers to make it. */
function goToPage() {
  pagePicker({
    title: 'Go to a page…',
    allowNew: true,
    onPick: openPage,
    onNew: name => newPage(name || 'Untitled page')
  });
}

/** Shows or hides a side list (desktop only; on phones they are drawers). which = 'pages' | 'items'. */
function toggleSide(which) {
  const key = `${which}Open`;
  prefs[key] = !prefs[key];
  savePrefs();
  applySides();
  renderAll();
}
function applySides() {
  document.body.classList.toggle('hide-pages', !prefs.pagesOpen);
  document.body.classList.toggle('hide-items', !prefs.itemsOpen);
}
/** The button that hides a side list, at the top of it. */
function sideToggle(which) {
  const open = prefs[`${which}Open`];
  const label = which === 'pages' ? 'page list' : 'item list';
  return h(
    'button',
    {
      type: 'button',
      class: 'iconbtn sidetog',
      'aria-label': `Hide the ${label}`,
      'aria-expanded': String(open),
      title: `Hide the ${label} to make room for writing. A button beside the page name brings it back.`,
      onclick: () => toggleSide(which)
    },
    [icon(which === 'pages' ? 'sidel' : 'sider', 17)]
  );
}
/** The button in the page bar that brings a hidden side list back. */
function sideReveal(which) {
  const label = which === 'pages' ? 'page list' : 'item list';
  return h(
    'button',
    {
      type: 'button',
      class: 'iconbtn sidetog sidereveal',
      'aria-label': `Show the ${label}`,
      'aria-expanded': 'false',
      title: `Show the ${label}`,
      onclick: () => toggleSide(which)
    },
    [icon(which === 'pages' ? 'sidel' : 'sider', 17)]
  );
}

const SORT_NAMES = { written: 'Written order', story: 'Story order', az: 'A to Z' };
/** The pages as the side list shows them: [{ p, depth }]. */
function listedPages() {
  if (prefs.sort === 'az') {
    return project.passages
      .slice()
      .sort((x, y) => pname(x).localeCompare(pname(y), undefined, { sensitivity: 'base', numeric: true }))
      .map(p => ({ p, depth: 0 }));
  }
  if (prefs.sort === 'story') return storyOrder(project).map(o => ({ p: byId(o.id), depth: Math.min(o.depth, 6), loose: o.loose }));
  return project.passages.map(p => ({ p, depth: 0 }));
}
/** The next page with no text yet, after the open one in story order (wrapping round); null if there is none. */
function nextUnwritten() {
  const order = storyOrder(project).map(o => byId(o.id));
  const i = order.findIndex(p => p.id === selId);
  for (let n = 1; n <= order.length; n++) {
    const p = order[(i + n) % order.length];
    if (p.id !== selId && pageEmpty(p)) return p;
  }
  return null;
}
function unwrittenCount() {
  return project.passages.filter(pageEmpty).length;
}

function renderSide() {
  const side = $('#side');
  side.hidden = view !== 'write';
  if (view !== 'write') return;
  side.textContent = '';
  const bad = problemSet();
  const sortBtn = h('button', {
    type: 'button',
    class: 'btn small ghost sortbtn',
    text: `${SORT_NAMES[prefs.sort]} ▾`,
    'aria-haspopup': 'menu',
    title: 'How the list is ordered. Written order is the order you made the pages in (and the only one you can drag to rearrange).',
    onclick: function (e) {
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(
        r.left,
        r.bottom + 2,
        Object.keys(SORT_NAMES).map(k => ({
          label: SORT_NAMES[k],
          check: prefs.sort === k,
          title: { written: 'The order you made them in. Drag to rearrange.', story: 'The way a player meets them: from the first page along the choices, with later pages indented.', az: 'Alphabetical.' }[k],
          fn: () => {
            prefs.sort = k;
            savePrefs();
            renderSide();
          }
        })),
        viaKeys
      );
    }
  });
  side.appendChild(
    h('div', { class: 'sidehd' }, [
      h('span', { class: 'sidehd-t' }, [`Pages `, h('span', { class: 'hint tip', text: String(project.passages.length) })]),
      sortBtn,
      sideToggle('pages')
    ])
  );
  side.appendChild(
    h('div', { class: 'tools' }, [
      h('div', { class: 'newrow' }, [
        h('button', {
          class: 'btn primary',
          type: 'button',
          text: '+ New page',
          title: 'Add a page to the end of the list',
          onclick: function () {
            newPage();
          }
        }),
        h('button', {
          class: 'btn primary newmore',
          type: 'button',
          text: '▾',
          'aria-label': 'New page from a template',
          'aria-haspopup': 'menu',
          title: 'Start from a template',
          onclick: function (e) {
            const r = e.currentTarget.getBoundingClientRect();
            ctxMenu(
              r.left - 120,
              r.bottom + 2,
              [
                { label: 'Blank page', title: 'An empty page.', fn: () => newPage() },
                { label: 'Page with two choices', title: 'A page with two empty choices ready to fill in.', fn: () => newPageTwoChoices() }
              ],
              viaKeys
            );
          }
        })
      ]),
      h('div', { class: 'findrow' }, [
        h('button', {
          class: 'btn',
          type: 'button',
          title: 'Jump to a page by typing part of its name (Ctrl+K)',
          onclick: goToPage
        }, ['Go to…']),
        h('button', {
          class: 'btn',
          type: 'button',
          title: 'Find and replace words anywhere in the story (Ctrl+Shift+F)',
          onclick: findDialog
        }, ['Find…'])
      ])
    ])
  );
  if (project.passages.length <= 3)
    side.appendChild(
      h('div', {
        class: 'hint tip',
        text: 'Drag a page onto a choice to link it, or drag pages up and down to reorder. Right-click (or press and hold) for more.'
      })
    );
  side.appendChild(
    h('ul', {
      id: 'pages',
      onscroll: function (e) {
        pagesScroll = e.target.scrollTop;
      }
    })
  );
  renderList();

  /* Redrawing the list must not jump it back to the top: restore where it was, then make
     sure the open page is in view (it may have been opened from the map or a menu). */
  const ul = $('#pages');

  const curBtn = ul.querySelector('button[aria-current="true"]');
  ul.scrollTop = pagesScroll;
  if (curBtn) {
    const r = curBtn.getBoundingClientRect();
    const u = ul.getBoundingClientRect();
    if (r.top < u.top || r.bottom > u.bottom) curBtn.scrollIntoView({ block: 'nearest' });
  }
  function renderList() {
    const ul = $('#pages');
    ul.textContent = '';
    const dragOrder = prefs.sort === 'written';
    listedPages().forEach(({ p, depth }) => {
      if (filter && !pname(p).toLowerCase().includes(filter.toLowerCase())) return;
      const pbtn = h(
        'button',
        {
          type: 'button',
          'aria-current': p.id === selId ? 'true' : 'false',
          draggable: 'true',
          style: depth ? `padding-left:${8 + depth * 12}px` : null,
          title: 'Click to edit. Drag onto a choice to link to it, or within this list to reorder. Right-click for more.',
          ondragstart: function (e) {
            e.dataTransfer.setData(DRAG, p.id);
            e.dataTransfer.setData('text/plain', pname(p));
            e.dataTransfer.effectAllowed = 'linkMove';
          },
          onclick: function () {
            openPage(p);
          },
          oncontextmenu: function (e) {
            e.preventDefault();
            ctxMenu(e.clientX, e.clientY, pageMenu(p), viaKeys);
          }
        },
        [
          h('span', { class: 'nm', text: pname(p) }),
          p.id === project.start ? h('span', { class: 'pico', title: 'The first page of the story' }, [icon('flag', 14)]) : null,
          p.ending && p.valence === 'good' ? h('span', { class: 'pico', title: 'Good ending' }, [icon('smile', 14)]) : null,
          p.ending && p.valence === 'bad' ? h('span', { class: 'pico', title: 'Bad ending' }, [icon('frown', 14)]) : null,
          p.ending && !p.valence ? h('span', { class: 'tag end neutral', title: 'Neutral ending', text: 'end' }) : null,
          p.color ? h('span', { class: 'pcdot', style: `--c:var(--pc-${p.color})`, title: `Marked ${p.color}` }) : null,
          p.note ? h('span', { class: 'pico', title: p.note }, [icon('note', 14)]) : null,
          p.todo ? h('span', { class: 'pico todo', title: 'Marked unfinished' }, [icon('todo', 14)]) : null,
          pageEmpty(p) ? h('span', { class: 'pico empty', title: 'No text on this page yet' }) : null,
          bad[p.id] ? h('span', { class: 'dot', title: 'The checker found a problem here' }) : null
        ]
      );
      longPress(pbtn, (x, y) => {
        ctxMenu(x, y, pageMenu(p));
      });
      if (dragOrder) reorderTarget(pbtn, DRAG, () => project.passages, p.id);
      ul.appendChild(h('li', {}, [pbtn]));
    });
  }
  renderSide.list = renderList; // lets the name box refresh the list while typing
}

/* ----- the item list (right) ----- */

/** Right-click menu for an item in the side list. */
function itemMenu(it) {
  return [
    { header: it.name },
    {
      label: 'Move up',
      disabled: project.items.indexOf(it) === 0,
      fn: function () {
        nudge(project.items, it, -1);
      }
    },
    {
      label: 'Move down',
      disabled: project.items.indexOf(it) === project.items.length - 1,
      fn: function () {
        nudge(project.items, it, 1);
      }
    },
    { sep: true },
    {
      label: 'Rename or delete on the Items tab',
      fn: function () {
        setView('items');
      }
    }
  ];
}

/** Click on an item in the side list: it goes into the open page's Gets box (Shift: Loses; a number goes in the Numbers row). */
function giveToPage(it, take) {
  const key = kindOf(it) === 'stat' ? 'nums' : take ? 'loses' : 'gets';
  const box = document.querySelector(`#main [data-box=${key}]`);
  const drop = box && box.children[1] && box.children[1]._drop;
  if (drop) drop(it.id);
  else toast('The open page has no box for that.');
}

function renderItemSide() {
  const side = $('#itemside');
  side.hidden = view !== 'write';
  if (view !== 'write') return;
  side.textContent = '';
  side.appendChild(
    h('div', { class: 'sidehd' }, [
      h('span', { class: 'sidehd-t' }, ['Items ', h('span', { class: 'hint tip', text: 'click = Gets · Shift+click = Loses · or drag' })]),
      sideToggle('items')
    ])
  );
  const il = h('ul', {
    id: 'itemlist',
    onscroll: function (e) {
      itemsScroll = e.target.scrollTop;
    }
  });
  [
    ['object', 'Objects', 'Things the player can carry or hand over'],
    ['state', 'States', 'Conditions the player is in, like sick or brave']
  ]
    .concat(
      numbersShown()
        ? [['stat', 'Numbers', 'Scores such as Courage that go up and down; tests like “Courage 5 or more” can gate text and choices']]
        : []
    )
    .forEach(g => {
      const members = project.items.filter(i => kindOf(i) === g[0] && !givenOf(project, i.id));
      il.appendChild(
        h('li', { class: 'grp', title: g[2] }, [
          h('span', { text: g[1] }),
          h('button', {
            class: 'btn small ghost',
            type: 'button',
            text: '+ New',
            title: `Add ${g[0] === 'state' ? 'a state' : g[0] === 'stat' ? 'a number' : 'an object'}`,
            onclick: function () {
              createItem(g[0]);
            }
          })
        ])
      );
      if (!members.length) il.appendChild(h('li', { class: 'hint', style: 'padding:2px 10px 6px', text: 'None yet.' }));
      members.forEach(it => {
        const ibtn = h(
          'button',
          {
            type: 'button',
            class: it.kind === 'state' ? 'state' : it.kind === 'stat' ? 'stat' : '',
            draggable: 'true',
            onclick: function (e) {
              giveToPage(it, e.shiftKey);
            },
            title:
              (it.kind === 'stat'
                ? 'Click to add a change to this number on the open page (Numbers row). '
                : 'Click to put it in this page’s Gets box; Shift+click for Loses. ') +
              'Or drag it onto a paragraph, a choice or an effects box. Drag within this list to reorder.',
            ondragstart: function (e) {
              e.dataTransfer.setData(DRAGI, it.id);
              e.dataTransfer.setData('text/plain', it.name);
              e.dataTransfer.effectAllowed = 'linkMove';
            },
            oncontextmenu: function (e) {
              e.preventDefault();
              ctxMenu(e.clientX, e.clientY, itemMenu(it), viaKeys);
            }
          },
          [itemIcon(it, 13), h('span', { class: 'nm', text: it.name })]
        );
        longPress(ibtn, (x, y) => {
          ctxMenu(x, y, itemMenu(it));
        });
        reorderTarget(ibtn, DRAGI, () => project.items, it.id);
        il.appendChild(h('li', {}, [ibtn]));
      });
    });
  if (adv('items')) {
    /* Givens: their answers can be dragged onto paragraphs and choices (not onto Gets / Loses) */
    il.appendChild(
      h('li', { class: 'grp', title: 'Questions answered before the story starts' }, [
        h('span', { text: 'Givens' }),
        h('button', { class: 'btn small ghost', type: 'button', text: '+ New', title: 'Add a Given', onclick: createGiven })
      ])
    );
    if (!project.givens.length) il.appendChild(h('li', { class: 'hint', style: 'padding:2px 10px 6px', text: 'None yet.' }));
    project.givens.forEach(g => {
      il.appendChild(h('li', { class: 'gq', text: g.question }));
      g.options.forEach(id => {
        const it = itemById(id);
        if (!it) return;
        const gb = h(
          'button',
          {
            type: 'button',
            class: 'given',
            draggable: 'true',
            title: `Drag onto a paragraph or a choice to show it only for players who answered “${it.name}”`,
            ondragstart: function (e) {
              e.dataTransfer.setData(DRAGI, it.id);
              e.dataTransfer.setData('text/plain', it.name);
              e.dataTransfer.effectAllowed = 'link';
            }
          },
          [icon('givens', 13), h('span', { class: 'nm', text: it.name })]
        );
        il.appendChild(h('li', {}, [gb]));
      });
    });
  }
  if (HANDS_OVER) {
    const vr = virtualRefs(project);
    il.appendChild(
      h('li', { class: 'grp', title: 'Filled in automatically when an object is left behind or handed over' }, [
        h('span', { text: 'Where things went' })
      ])
    );
    if (!vr.length)
      il.appendChild(h('li', { class: 'hint', style: 'padding:2px 10px 6px', text: 'Fills in when an object is left or handed over.' }));
    vr.forEach(v => {
      il.appendChild(
        h('li', {}, [
          h(
            'button',
            {
              type: 'button',
              class: 'moved',
              draggable: 'true',
              title: 'Drag onto an “only if” row',
              ondragstart: function (e) {
                e.dataTransfer.setData(DRAGI, v.id);
                e.dataTransfer.setData('text/plain', v.label);
                e.dataTransfer.effectAllowed = 'link';
              }
            },
            [h('span', { class: 'nm', text: v.label })]
          )
        ])
      );
    });
  }
  side.appendChild(il);
  il.scrollTop = itemsScroll; // keep the list where it was after a redraw
}

/* ----- page actions and menus ----- */

/** Deletes a page after asking. Choices that led to it are left pointing nowhere. */
function deletePage(p) {
  let n = 0;
  project.passages.forEach(q => {
    q.choices.forEach(c => {
      if (c.to === p.id || c.check?.fail === p.id) n++;
    });
  });
  ask(
    `Delete “${pname(p)}”?`,
    `${n ? `${n} choice${n === 1 ? '' : 's'} lead${n === 1 ? 's' : ''} here and will be left pointing nowhere. ` : ''}You can undo this.`,
    'Delete page',
    true
  ).then(ok => {
    if (!ok || project.passages.indexOf(p) < 0) return; // (the page is gone if the story was rebuilt meanwhile)
    project.passages.forEach(q => {
      q.choices.forEach(c => {
        if (c.to === p.id) c.to = '';
        if (c.check?.fail === p.id) c.check.fail = '';
      });
    });
    const i = project.passages.indexOf(p);
    project.passages.splice(i, 1);
    if (project.start === p.id) {
      const nx = project.passages.find(q => !q.ending) || project.passages[0];
      nx.ending = false;
      project.start = nx.id;
    }
    if (selId === p.id || !byId(selId)) selId = project.passages[Math.max(0, i - 1)].id; // deleting some other page leaves the open page alone
    refresh();
    toast('Page deleted. Undo is in the top bar.');
  });
}
/** Makes a copy of a page just after it. */
function duplicatePage(p) {
  if (project.passages.indexOf(p) < 0) return;
  const np = deepCopy(p);
  np.id = uid('p_');
  np.name = `${pname(p)} copy`;
  project.passages.splice(project.passages.indexOf(p) + 1, 0, np);
  selId = np.id;
  refresh();
  toast('Duplicated. The copy has the same choices, but nothing leads to it yet.');
}
/** Marks a page as the story's first page. */
function makeStart(p) {
  if (p.ending) {
    toast('An ending cannot be the first page. Change this page to a normal page first.');
    return;
  }
  project.start = p.id;
  refresh();
  toast('This page now starts the story.');
}
/** Chooses "Page" (not an ending), or an ending kind: '' neutral, 'good', 'bad'. */
function setPageType(p, mode) {
  if (mode !== 'page' && p.id === project.start) {
    toast('The first page cannot be an ending. Make another page the first page if you want this one to end the story.');
    return;
  }
  p.ending = mode !== 'page';
  if (p.ending) p.valence = mode;
  refresh();
}

/**
 * The Find and replace window. Plain-text search over page names, headings, paragraphs, choice labels and lock reasons
 * (storyFind / storyReplace in core.js). "Go" opens the page and selects the words; "Replace" and "Replace all" are
 * one undo step each, so Undo brings the old words back.
 */
function findDialog() {
  let q = findLast.q;
  const opt = findLast.opt;
  let repl = findLast.repl;
  dialog((d, close) => {
    d.classList.add('wide', 'finder');
    d.appendChild(h('h3', { text: 'Find and replace' }));
    d.appendChild(h('div', { class: 'hint', text: 'Looks in page names, headings, paragraphs and choices. Words are matched exactly as typed (no patterns).' }));
    const qin = h('input', {
      class: 'in',
      type: 'search',
      value: q,
      placeholder: 'Find…',
      'aria-label': 'Find',
      oninput: function (e) {
        q = e.target.value;
        draw();
      }
    });
    const rin = h('input', {
      class: 'in',
      type: 'text',
      value: repl,
      placeholder: 'Replace with… (leave empty to delete)',
      'aria-label': 'Replace with',
      oninput: function (e) {
        repl = e.target.value;
        findLast.repl = repl;
      }
    });
    const chk = (label, key) =>
      h('label', { class: 'chk' }, [
        h('input', {
          type: 'checkbox',
          checked: opt[key] ? 'checked' : null,
          onchange: function (e) {
            opt[key] = e.target.checked;
            draw();
          }
        }),
        label
      ]);
    d.appendChild(h('div', { class: 'row' }, [h('div', { class: 'grow' }, [qin]), h('div', { class: 'grow' }, [rin])]));
    d.appendChild(h('div', { class: 'row' }, [chk('Match upper and lower case', 'matchCase'), chk('Whole words only', 'whole')]));
    const count = h('div', { class: 'hint', 'aria-live': 'polite' });
    const list = h('div', { class: 'findlist' });
    const all = h('button', { class: 'btn primary', type: 'button', text: 'Replace all' });
    d.appendChild(count);
    d.appendChild(list);
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn', type: 'button', text: 'Close', onclick: close }), all]));

    /* a short piece of the text around a match, with the match marked */
    function snippet(str, f) {
      const from = Math.max(0, f.pos - 28);
      const to = Math.min(str.length, f.pos + f.len + 48);
      return h('span', { class: 'snip' }, [
        (from ? '… ' : '') + str.slice(from, f.pos).replace(/\s+/g, ' '),
        h('mark', { text: str.slice(f.pos, f.pos + f.len) }),
        str.slice(f.pos + f.len, to).replace(/\s+/g, ' ') + (to < str.length ? ' …' : '')
      ]);
    }
    function go(f) {
      const p = byId(f.pid);
      if (!p) return;
      close();
      openPage(p);
      const box = f.field === 'name' ? $('#pname') : f.field === 'heading' ? $('#pheading') : f.field === 'text' ? document.querySelectorAll('#main textarea[aria-label^="Paragraph"]')[f.i] : null;
      if (box) {
        box.focus({ preventScroll: false });
        try {
          box.setSelectionRange(f.pos, f.pos + f.len);
        } catch {
          /* the box cannot select */
        }
      } else toast(`Found in a ${FIND_FIELDS[f.field]} on this page.`);
    }
    function draw() {
      findLast.q = q;
      list.textContent = '';
      const found = storyFind(project, q, opt);
      const pages = new Set(found.map(f => f.pid)).size;
      all.disabled = !found.length;
      all.textContent = found.length ? `Replace all (${found.length})` : 'Replace all';
      count.textContent = !q
        ? ''
        : !found.length
          ? 'Nothing found.'
          : `${found.length >= FIND_LIMIT ? 'More than ' : ''}${found.length} match${found.length === 1 ? '' : 'es'} on ${pages} page${pages === 1 ? '' : 's'}${found.length > 100 ? ' (the first 100 are listed)' : ''}.`;
      found.slice(0, 100).forEach(f => {
        const p = byId(f.pid);
        const t = findTarget(project, f);
        if (!p || !t) return;
        list.appendChild(
          h('div', { class: 'findrow' }, [
            h('div', { class: 't' }, [
              h('div', { class: 'where' }, [h('strong', { text: pname(p) }), ` · ${FIND_FIELDS[f.field]}${f.field === 'text' || f.field === 'label' || f.field === 'why' ? ` ${f.i + 1}` : ''}`]),
              snippet(t.o[t.k], f)
            ]),
            h('button', {
              class: 'btn small',
              type: 'button',
              text: 'Go',
              title: 'Open this page and select the words',
              onclick: function () {
                go(f);
              }
            }),
            h('button', {
              class: 'btn small',
              type: 'button',
              text: 'Replace',
              title: 'Change just this one',
              onclick: function () {
                if (storyReplace(project, q, repl, opt, f)) {
                  refresh();
                  draw();
                }
              }
            })
          ])
        );
      });
    }
    all.onclick = function () {
      const n = storyReplace(project, q, repl, opt);
      refresh();
      draw();
      toast(n ? `Replaced ${n}. Undo brings the old words back.` : 'Nothing to replace.');
    };
    qin.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const f = storyFind(project, q, opt)[0];
        if (f) go(f);
      }
    });
    draw();
    setTimeout(() => {
      qin.focus();
      qin.select();
    }, 0);
  });
}
const findLast = { q: '', repl: '', opt: { matchCase: false, whole: false } }; // the window remembers its last search while the editor stays open

/** Flags a page as unfinished (or clears the flag). The flag is the author's own: it is never exported and never changes the game. */
function toggleTodo(p) {
  p.todo = !p.todo;
  refresh();
  toast(p.todo ? 'Marked unfinished. The Check tab lists it.' : 'Marked finished.');
}

/**
 * "Color and note": the author's own marks on a page. A color (a stripe on the map, a dot in the page list) and a private note
 * (shown on the map when you point at the page). Neither is ever exported or read by the checker or the game.
 */
function pageMarkDialog(p) {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: `Color and note for “${pname(p)}”` }));
    d.appendChild(h('div', { class: 'hint', text: 'For you only. Players never see these, and they do not change the game.' }));
    const row = h('div', { class: 'pcrow', role: 'group', 'aria-label': 'Page color' });
    const set = c => {
      p.color = c;
      row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
      refresh();
    };
    ['', ...PAGE_COLORS].forEach(c => {
      row.appendChild(
        h('button', {
          type: 'button',
          class: 'pcswatch',
          'data-c': c,
          style: c ? `--c:var(--pc-${c})` : null,
          'aria-pressed': String(p.color === c),
          'aria-label': c || 'No color',
          title: c ? `Mark this page ${c}` : 'No color',
          text: c ? '' : '×',
          onclick: () => set(c)
        })
      );
    });
    d.appendChild(row);
    const note = h('textarea', { class: 'in pcnote', maxlength: String(PAGE_NOTE_MAX), 'aria-label': 'Note about this page', placeholder: 'A note to yourself, such as “reads too fast” or “needs the key scene”.' });
    note.value = p.note || '';
    note.addEventListener('change', () => {
      p.note = note.value.trim();
      refresh();
    });
    d.appendChild(note);
    d.appendChild(h('div', { class: 'row' }, [h('button', { class: 'btn primary', type: 'button', text: 'Done', onclick: () => {
      if (note.value.trim() !== (p.note || '')) {
        p.note = note.value.trim();
        refresh();
      }
      close();
    } })]));
    setTimeout(() => d.querySelector('.pcswatch[aria-pressed="true"]')?.focus(), 0);
  });
}

/** Menu entries that toggle every item of a list on or off for page `p` (list = 'gives' or 'takes'). */
function itemEntries(p, list) {
  if (!project.items.length) return [{ label: 'No items yet. Add some on the Items tab.', disabled: true }];
  const out = [];
  [
    ['object', 'Objects'],
    ['state', 'States']
  ].forEach(g => {
    const mem = project.items.filter(i => kindOf(i) === g[0] && !givenOf(project, i.id));
    if (!mem.length) return;
    out.push({ header: g[1] });
    mem.forEach(it => {
      const handed = list === 'takes' && p.sends[it.id];
      out.push({
        label: it.name,
        check: p[list].includes(it.id) && !handed,
        hint: handed ? 'handed over' : '',
        fn: function () {
          const i = p[list].indexOf(it.id);
          if (i >= 0) p[list].splice(i, 1);
          else p[list].push(it.id);
          if (list === 'takes') delete p.sends[it.id];
          refresh();
        }
      });
    });
  });
  return out;
}

/**
 * The menu for a page. Used by right-click / long-press on the map and the page
 * list. With `compact` (the ⋯ button in the page bar) only page-level actions show.
 */
function pageMenu(p, compact) {
  const others = project.passages.filter(q => q.id !== p.id);
  const i = project.passages.indexOf(p);
  const cur = !p.ending ? 'page' : p.valence || '';
  const objs = project.items.filter(it => kindOf(it) === 'object');
  const tail = [
    {
      label: p.id === project.start ? 'This is the first page' : 'Start the story here',
      disabled: p.id === project.start || p.ending,
      title: p.ending ? 'An ending cannot be the first page.' : null,
      fn: function () {
        makeStart(p);
      }
    },
    {
      label: 'Color and note…',
      title: 'Your own color mark and private note. Shown on the map and in the page list; never in the game.',
      fn: function () {
        pageMarkDialog(p);
      }
    },
    {
      label: p.todo ? 'Mark as finished' : 'Mark as unfinished',
      title: 'Your own reminder. It is listed on the Check tab and never appears in the game.',
      fn: function () {
        toggleTodo(p);
      }
    },
    {
      label: 'Split this page at the cursor',
      disabled: p.ending || caretIndex(p) < 0,
      title: 'Click in the text where the next page should begin, then choose this (or press Ctrl+Shift+Enter). The words after the cursor and all the choices move to a new page.',
      fn: function () {
        if (caretIndex(p) >= 0) splitPage(p, caretIndex(p), lastCaret.pos);
      }
    },
    {
      label: 'Duplicate',
      fn: function () {
        duplicatePage(p);
      }
    },
    {
      label: 'Move up in the list',
      disabled: i === 0,
      fn: function () {
        nudge(project.passages, p, -1);
      }
    },
    {
      label: 'Move down in the list',
      disabled: i === project.passages.length - 1,
      fn: function () {
        nudge(project.passages, p, 1);
      }
    },
    { sep: true },
    {
      label: 'Delete…',
      danger: true,
      disabled: project.passages.length < 2,
      fn: function () {
        deletePage(p);
      }
    }
  ];
  if (compact) return tail;
  return [
    { header: pname(p) },
    {
      label: 'Edit this page',
      fn: function () {
        openPage(p);
      }
    },
    {
      label: 'Why can’t players reach this page?',
      title: 'Explains in words what stands between players and this page, or how they get there',
      fn: function () {
        whyDialog(p.id);
      }
    },
    { sep: true },
    {
      label: 'Add a choice that leads to…',
      disabled: p.ending,
      title: p.ending ? 'Endings have no choices. Change the page type first.' : null,
      sub: [
        {
          label: 'A new page…',
          fn: function () {
            promptDialog(
              'Add a choice to a new page',
              [
                { label: 'What does the player do to get there?', placeholder: 'For example: Check the key counter' },
                { label: 'Name of the new page (only you see this)', placeholder: 'For example: Key counter' }
              ],
              'Add'
            ).then(v => {
              if (!v) return;
              const np = makePassage(v[1] || 'Untitled page');
              project.passages.push(np);
              p.choices.push(makeChoice(v[0], np.id));
              selId = np.id;
              refresh();
              toast(`Added “${pname(np)}”.`);
            });
          }
        },
        { sep: true },
        { header: 'An existing page' }
      ].concat(
        others.length
          ? others.map(q => ({
              label: pname(q),
              fn: function () {
                p.choices.push(makeChoice('', q.id));
                selId = p.id;
                view = 'write';
                refresh();
                focusSoon('#main .clabel', -1);
                toast(`Type what the player does to go to “${pname(q)}”.`);
              }
            }))
          : [{ label: 'No other pages yet', disabled: true }]
      )
    },
    {
      label: 'Page type',
      sub: [
        {
          label: 'Page',
          check: cur === 'page',
          fn: function () {
            setPageType(p, 'page');
          }
        },
        {
          label: 'Ending',
          disabled: p.id === project.start,
          check: cur === '',
          fn: function () {
            setPageType(p, '');
          }
        },
        {
          label: 'Good ending',
          disabled: p.id === project.start,
          check: cur === 'good',
          fn: function () {
            setPageType(p, 'good');
          }
        },
        {
          label: 'Bad ending',
          disabled: p.id === project.start,
          check: cur === 'bad',
          fn: function () {
            setPageType(p, 'bad');
          }
        }
      ]
    },
    {
      label: 'When the player gets here',
      sub: [
        { label: 'They get', sub: itemEntries(p, 'gives') },
        { label: 'They lose', sub: itemEntries(p, 'takes') },
        HANDS_OVER && {
          label: 'They hand over…',
          disabled: !objs.length,
          sub: objs.map(it => ({
            label: it.name,
            check: !!p.sends[it.id],
            fn: function () {
              if (!p.takes.includes(it.id)) p.takes.push(it.id);
              if (!p.sends[it.id]) p.sends[it.id] = 'w:';
              focusHand = it.id;
              selId = p.id;
              view = 'write';
              refresh();
            }
          }))
        }
      ]
    },
    {
      label: 'Rename…',
      fn: function () {
        promptDialog('Rename page', [{ label: 'Page name (only you see this)', value: p.name }], 'Rename').then(v => {
          if (v && v[0]) {
            p.name = v[0];
            refresh();
          }
        });
      }
    },
    {
      label: 'Heading…',
      fn: function () {
        promptDialog('Heading', [{ label: 'Shown large at the top of the page (leave empty for none)', value: p.heading }], 'Save').then(v => {
          if (v) {
            p.heading = v[0];
            refresh();
          }
        });
      }
    },
    {
      label: 'Play from here',
      fn: function () {
        playFrom(p.id);
      }
    },
    {
      label: 'Show on the map',
      fn: function () {
        showOnMap(p.id);
      }
    },
    { sep: true }
  ].concat(tail);
}

/* ----- the page editor (center) ----- */

/** Small square button used in rows. */
function iconBtn(text, title, fn, disabled, cls) {
  return h(
    'button',
    { class: `iconbtn${cls ? ` ${cls}` : ''}`, type: 'button', title, 'aria-label': title, disabled: disabled ? true : null, onclick: fn },
    [text]
  );
}
/** A tiny section heading with optional buttons on the right. */
function sectionHead(label, tip, buttons) {
  return h('div', { class: 'sech', title: tip }, [h('span', { class: 'sl', text: label })].concat(buttons || []));
}

function renderWrite(main) {
  const p = byId(selId) || project.passages[0];
  selId = p.id;
  histVisit();
  const wrap = h('div', { class: 'wrap sheet' });
  wrap.appendChild(pageBar(p));
  /* the page type and the three effect boxes share one line when there is room, and wrap when there is not */
  const fx = effectsRow(p);
  fx.prepend(pageBar.seg);
  wrap.appendChild(fx);
  wrap.appendChild(textSection(p));
  wrap.appendChild(choicesSection(p));
  wrap.appendChild(reachedFrom(p));
  main.appendChild(wrap);
  /* on a phone the end of the page is far away: a bar pinned to the bottom keeps the three things you do most in reach */
  const nxt = nextUnwritten();
  main.appendChild(
    h('div', { class: 'pinbar' }, [
      p.ending
        ? null
        : h('button', {
            type: 'button',
            class: 'btn small',
            text: '+ Choice',
            title: 'Add a choice to this page',
            onclick: () => {
              p.choices.push(makeChoice('', ''));
              refresh();
              focusSoon('#main .clabel', -1);
            }
          }),
      nxt
        ? h('button', {
            type: 'button',
            class: 'btn small',
            text: `Next to write (${unwrittenCount() - (pageEmpty(p) ? 1 : 0)}) ›`,
            onclick: () => openPage(nxt)
          })
        : null,
      h('button', { type: 'button', class: 'btn small primary', text: '▶ Play', title: 'Play the story from this page', onclick: () => playFrom(p.id) })
    ])
  );
  autosizeAll(wrap.querySelectorAll('textarea'));
  renderPageNotes();
}

/** Whether the folded "things to look at" line is open; kept while you move between pages. */
let pageNotesOpen = false;

/**
 * The checker's notes for this page, shown under the page bar so there is no trip to the Check tab.
 * Problems (red) always show. Warnings and Good to know notes fold into one line, "⚠ 7 things to look at",
 * so a page with many of them (often the first page) is still easy to work on; a single one just shows.
 * Uses the last check (it re-runs half a second after you stop typing and then refreshes just this box).
 */
function renderPageNotes() {
  const box = $('#pagenotes');
  if (!box || !analysis) return;
  const mine = list => list.filter(it => it.pid === selId);
  const probs = mine(analysis.problems);
  const rest = [...mine(analysis.warnings).map(it => ['warn', it]), ...mine(analysis.notes || []).map(it => ['note', it])];
  box.textContent = '';
  box.hidden = !(probs.length || rest.length);
  probs.forEach(it => box.appendChild(h('div', { class: 'pn bad', text: it.msg })));
  const lines = rest.map(([kind, it]) => h('div', { class: `pn ${kind}`, text: it.msg }));
  if (lines.length === 1) box.appendChild(lines[0]);
  else if (lines.length) {
    const fold = h('details', { class: 'pnfold', open: pageNotesOpen || null }, [
      h('summary', {
        title: 'Things the checker noticed on this page. Not mistakes, but worth a look. Click to show or hide.',
        text: `⚠ ${lines.length} things to look at`
      }),
      ...lines
    ]);
    fold.addEventListener('toggle', () => (pageNotesOpen = fold.open));
    box.appendChild(fold);
  }
}

/** Row 1: name, heading, first-page star, play, more-actions menu. Stays visible while you scroll. (The page type sits on row 2.) */
function pageBar(p) {
  const isStart = p.id === project.start;
  const name = h('input', {
    id: 'pname',
    class: 'in namein',
    value: p.name,
    placeholder: 'Page name',
    maxlength: 120,
    'aria-label': 'Page name',
    title: 'Page name. Only you see this; players never do.',
    oninput: function (e) {
      p.name = e.target.value;
      commit(`n:${p.id}`);
      renderSide.list && renderSide.list();
    },
    onchange: function () {
      refresh();
    }
  });
  const heading = h('input', {
    id: 'pheading',
    class: 'in',
    value: p.heading,
    maxlength: 120,
    'aria-label': p.ending ? 'Ending title' : 'Heading',
    placeholder: p.ending ? 'Ending title, shown big (optional)' : 'Big heading shown to the player (optional)',
    title: 'A title shown large at the top of the page when players read it. Leave empty for none.',
    oninput: function (e) {
      p.heading = e.target.value;
      commit(`h:${p.id}`);
    }
  });
  const cur = !p.ending ? 'page' : p.valence || '';
  const seg = h(
    'div',
    {
      class: 'seg',
      role: 'radiogroup',
      'aria-label': 'Page type',
      title: 'Page: the story goes on. Ending: the story stops here and shows “Play again”. Good / bad endings are color-coded on the map.'
    },
    [
      ['page', 'Page', 'page'],
      ['', 'Ending', 'neutral'],
      ['good', 'Good ending', 'good'],
      ['bad', 'Bad ending', 'bad']
    ].map(o =>
      h('label', { class: o[2] + (cur === o[0] ? ' on' : '') }, [
        h('input', {
          type: 'radio',
          name: 'ptype',
          checked: cur === o[0] ? 'checked' : null,
          disabled: isStart && o[0] !== 'page' ? true : null,
          title: isStart && o[0] !== 'page' ? 'The first page of a story cannot be an ending.' : null,
          onchange: function () {
            setPageType(p, o[0]);
          }
        }),
        o[0] === 'good' ? icon('smile', 13) : o[0] === 'bad' ? icon('frown', 13) : null,
        o[1]
      ])
    )
  );
  const star = h(
    'button',
    {
      class: `iconbtn star${isStart ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': isStart ? 'true' : 'false',
      title: isStart ? 'This page starts the story' : 'Make this the first page of the story',
      'aria-label': isStart ? 'First page' : 'Make this the first page',
      onclick: function () {
        if (!isStart) makeStart(p);
      }
    },
    [icon('flag', 17)]
  );
  const todo = h(
    'button',
    {
      class: `iconbtn${p.todo ? ' on' : ''}`,
      type: 'button',
      'aria-pressed': p.todo ? 'true' : 'false',
      title: p.todo ? 'Marked unfinished (click to clear). Listed on the Check tab; never shown to players.' : 'Mark this page as unfinished. It will be listed on the Check tab; players never see the flag.',
      'aria-label': p.todo ? 'Unfinished: clear the flag' : 'Mark as unfinished',
      onclick: function () {
        toggleTodo(p);
      }
    },
    [icon('todo', 17)]
  );
  const mark = h(
    'button',
    {
      class: `iconbtn${p.color || p.note ? ' on' : ''}`,
      type: 'button',
      title: 'Your own color mark and private note for this page. Shown on the map; never in the game.',
      'aria-label': 'Color and note',
      onclick: () => pageMarkDialog(p)
    },
    [p.color ? h('span', { class: 'pcdot', style: `--c:var(--pc-${p.color})` }) : icon(p.note ? 'note' : 'pcolor', 17)]
  );
  const play = iconBtn('▶', 'Play from this page (starts with empty pockets)', () => {
    playFrom(p.id);
  });
  const more = h(
    'button',
    {
      class: 'iconbtn',
      type: 'button',
      title: 'More actions: duplicate, move, delete',
      'aria-label': 'More actions',
      'aria-haspopup': 'menu',
      onclick: function (e) {
        const r = e.currentTarget.getBoundingClientRect();
        ctxMenu(Math.max(4, r.right - 220), r.bottom + 4, pageMenu(p, true), viaKeys);
      }
    },
    ['⋯']
  );
  pageBar.seg = seg; // drawn at the start of the effects row (see renderWrite)
  /* Back and Forward through the pages visited (the list is kept while the editor is open) */
  const bk = histTarget(-1),
    fw = histTarget(1);
  const histBtn = (d, j, glyph) =>
    h(
      'button',
      {
        type: 'button',
        class: 'iconbtn histbtn',
        disabled: j < 0 ? true : null,
        'aria-label': d < 0 ? 'Back to the page before' : 'Forward',
        title: j < 0 ? (d < 0 ? 'Back: no earlier page' : 'Forward: no later page') : `${d < 0 ? 'Back to' : 'Forward to'} “${pname(byId(hist.list[j]))}”`,
        onclick: () => {
          hist.i = j;
          hist.nav = true;
          selId = hist.list[j];
          renderAll();
          const m = $('#main');
          if (m) m.scrollTop = 0;
        }
      },
      [glyph]
    );
  const incoming = project.passages.filter(q => q.id !== p.id && q.choices.some(c => c.to === p.id || c.check?.fail === p.id));
  const nxt = nextUnwritten();
  const nextBtn = nxt
    ? h('button', {
        type: 'button',
        class: 'btn small nextbtn',
        text: `Next to write (${unwrittenCount() - (pageEmpty(p) ? 1 : 0)}) ›`,
        title: `Open “${pname(nxt)}”, the next page with nothing written yet, in story order`,
        onclick: () => openPage(nxt)
      })
    : null;
  const from = incoming.length || nextBtn
    ? h('div', { class: 'fromrow' }, [
        incoming.length ? h('span', { class: 'sl', text: 'From' }) : null,
        ...incoming.slice(0, 5).map(q =>
          h('button', {
            type: 'button',
            class: 'fromlink',
            text: pname(q),
            title: `Open “${pname(q)}”, a page with a choice that leads here`,
            onclick: () => openPage(q)
          })
        ),
        incoming.length > 5
          ? h('button', {
              type: 'button',
              class: 'fromlink',
              text: `+${incoming.length - 5} more`,
              onclick: e => {
                const r = e.currentTarget.getBoundingClientRect();
                ctxMenu(r.left, r.bottom + 2, incoming.slice(5).map(q => ({ label: pname(q), fn: () => openPage(q) })), viaKeys);
              }
            })
          : null,
        nextBtn
      ])
    : null;
  return h('div', { class: 'pagebar' }, [
    h('div', { class: 'pbrow' }, [
      prefs.pagesOpen ? null : sideReveal('pages'),
      histBtn(-1, bk, '‹'),
      histBtn(1, fw, '›'),
      name,
      heading,
      star,
      todo,
      mark,
      play,
      more,
      prefs.itemsOpen ? null : sideReveal('items')
    ]),
    from,
    h('div', { id: 'pagenotes', class: 'pagenotes', hidden: true })
  ]);
}

/** Row 2: the page type, then the three effect boxes. */
function effectsRow(p) {
  /* The whole box accepts drops, not just the small chip area inside it. */
  function box(key, label, tip, content) {
    const el = h('div', { class: `eff ${key}`, 'data-box': key, title: tip }, [h('div', { class: 'efl', text: label }), content]);
    dropZone(el, content._drop, DRAGI);
    return el;
  }
  return h('div', { class: 'effects' }, [
    box(
      'gets',
      '＋ Gets',
      'When the player arrives here they get these. An object is picked up; a state is taken on (sick, brave …).',
      chips(
        p.gives,
        () => {
          refresh();
        },
        { noMoved: true, noGivens: true }
      )
    ),
    box(
      'loses',
      '− Loses',
      'They lose these. An object is gone for good; a state ends.',
      chips(
        p.takes,
        () => {
          refresh();
        },
        {
          noMoved: true,
          noGivens: true,
          skip: function (id) {
            return HANDS_OVER && !!p.sends[id];
          }
        }
      )
    ),
    numbersShown() && (adv('items') || Object.keys(p.adds || {}).length)
      ? box(
          'nums',
          '± Numbers',
          'Raise or lower a number such as Courage when the player arrives. It always stays inside its range.',
          numbersBox((p.adds = p.adds || {}), () => {
            refresh();
          })
        )
      : null,
    HANDS_OVER &&
      box(
        'hands',
        '⇄ Hands over',
        'An object they give to someone or leave on this page. The game remembers where it went, so later text and choices can depend on it.',
        handBox(p)
      )
  ]);
}

/** Row 3: paragraphs. */
/** Where the cursor was last in a paragraph (kept when the box loses focus, so a menu can still split there). */
let lastCaret = null;
/** Where the last paragraph box that lost focus has its cursor: the paragraph itself (not its place in the list, which changes) and the position in it. */
function caretIndex(p) {
  return lastCaret && lastCaret.pid === p.id ? p.blocks.indexOf(lastCaret.b) : -1;
}

function wordsOnPage(p) {
  return p.blocks.reduce((n, b) => n + ((b.text || '').match(/\S+/g) || []).length, 0);
}
function wordCountText(p) {
  const w = wordsOnPage(p);
  if (!w) return '';
  const m = w / (prefs.wpm || 230);
  return `${w} word${w === 1 ? '' : 's'} · ${m < 0.75 ? 'under a minute' : `about ${Math.round(m)} min`} to read`;
}
function showWordCount(p) {
  const el = $('#wcount');
  if (el) el.textContent = wordCountText(p);
}

/**
 * Splits a page in two at the cursor: what follows the cursor, the paragraphs below and all the choices move to a new page, and
 * this page ends with one choice, "Continue", that leads there. One step to undo.
 */
function splitPage(p, bi, pos) {
  if (p.ending) {
    toast('An ending has no choices, so there is nothing to carry on to. Change the page type first.');
    return;
  }
  const b = p.blocks[bi];
  if (!b) return;
  const text = b.text || '';
  pos = Math.max(0, Math.min(pos, text.length));
  let base = `${pname(p)} (2)`;
  for (let n = 3; project.passages.some(q => q.name === base); n++) base = `${pname(p)} (${n})`;
  const np = newPage(base, true);
  const first = makeBlock(text.slice(pos).replace(/^\s+/, ''));
  first.needs = b.needs.slice();
  first.forbid = b.forbid.slice();
  np.blocks = [first].concat(p.blocks.slice(bi + 1));
  np.choices = p.choices;
  b.text = text.slice(0, pos).replace(/\s+$/, '');
  p.blocks = p.blocks.slice(0, bi + 1);
  p.choices = [makeChoice('Continue', np.id)];
  selId = np.id;
  refresh();
  const m = $('#main');
  if (m) m.scrollTop = 0;
  toast(`Split. The rest is on “${pname(np)}”; the old page now ends with “Continue”.`, 'Undo', undo);
}

/**
 * Pasting a scene: lines that start with "- ", "• " or "> " become choices and the other lines become paragraphs (a blank line
 * starts a new one). Anything else pastes as usual.
 */
function pasteScene(e, p, bi, b) {
  const text = e.clipboardData && e.clipboardData.getData('text');
  if (!text || p.ending) return;
  const paras = [];
  const labels = [];
  let run = [];
  const flush = () => {
    if (run.length) paras.push(run.join(' ').trim());
    run = [];
  };
  text.replace(/\r\n?/g, '\n').split('\n').forEach(line => {
    const m = /^\s*[-•>]\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      labels.push(m[1]);
    } else if (!line.trim()) flush();
    else run.push(line.trim());
  });
  flush();
  if (!labels.length || (labels.length < 2 && !paras.length)) return;
  e.preventDefault();
  const at = e.target.selectionStart,
    to = e.target.selectionEnd;
  let rest = paras.slice();
  if (rest.length) {
    if (!b.text.trim()) b.text = rest.shift();
    else {
      const head = b.text.slice(0, at),
        tail = b.text.slice(to);
      b.text = head + (at && !/\s$/.test(head) ? ' ' : '') + rest.shift() + (tail && !/^\s/.test(tail) ? ' ' : '') + tail;
    }
  }
  /* new paragraphs go after this one and the "Otherwise" paragraphs that belong to it, never between them */
  let ins = bi + 1;
  while (p.blocks[ins] && p.blocks[ins].orPrev) ins++;
  p.blocks.splice(ins, 0, ...rest.map(t => makeBlock(t)));
  const start = p.choices.length;
  labels.forEach(l => p.choices.push(makeChoice(l.slice(0, 200), '')));
  refresh();
  focusSoon('#main .crow>.cdest', start);
  toast(`Pasted ${paras.length} paragraph${paras.length === 1 ? '' : 's'} and ${labels.length} choice${labels.length === 1 ? '' : 's'}. Pick where each leads.`, 'Undo', undo);
}

function textSection(p) {
  const sec = h('section', { class: 'sect' });
  sec.appendChild(
    sectionHead('Text', 'What the player reads. Drag an item onto a paragraph to show it only when the player has it.', [
      h('button', {
        class: 'btn small ghost',
        type: 'button',
        text: '+ Paragraph',
        title: 'Add another paragraph',
        onclick: function () {
          p.blocks.push(makeBlock(''));
          refresh();
          focusSoon('#main .block textarea', -1);
        }
      }),
      h('button', {
        class: 'btn small ghost',
        type: 'button',
        text: '+ Alternative',
        title: 'Add text that is used instead when the paragraph above is not shown',
        onclick: function () {
          const b = makeBlock('');
          b.orPrev = true;
          p.blocks.push(b);
          refresh();
          focusSoon('#main .block textarea', -1);
        }
      }),
      h('span', { class: 'hint wcount', id: 'wcount', text: wordCountText(p) })
    ])
  );
  p.blocks.forEach((b, i) => {
    const keysB = rowKeys(() => p.blocks, i, j => focusSoon('#main .block textarea', j));
    const ta = h('textarea', {
      class: 'in',
      'aria-label': `Paragraph ${i + 1}`,
      placeholder:
        p.blocks.length === 1 && pageEmpty(p)
          ? 'A new page. Write what the player sees here (a blank line starts a new paragraph), then add choices below.'
          : 'Write here. A blank line starts a new paragraph.',
      value: b.text,
      rows: 2,
      oninput: function (e) {
        b.text = e.target.value;
        autosize(e.target);
        commit(`b:${p.id}${i}`);
        showWordCount(p);
      },
      onblur: function (e) {
        lastCaret = { pid: p.id, b, pos: e.target.selectionStart };
      },
      onkeydown: function (e) {
        keysB(e);
        if (e.key === 'Enter' && e.ctrlKey && e.shiftKey) {
          e.preventDefault();
          splitPage(p, i, e.target.selectionStart);
        }
      },
      onpaste: function (e) {
        pasteScene(e, p, i, b);
      }
    });
    const row = h('div', { class: `block${b.orPrev ? ' alt' : ''}` });
    const tools = h('div', { class: 'rowtools' }, [
      condToggle(b, 'paragraph'),
      p.blocks.length > 1 ? rowGrip(row, 'block', () => p.blocks, i) : null,
      iconBtn(
        '✕',
        'Delete this paragraph',
        () => {
          p.blocks.splice(i, 1);
          refresh();
        },
        p.blocks.length === 1,
        'danger'
      )
    ]);
    [ta, tools, condLine(b, { chain: i > 0 })].forEach(x => x && row.appendChild(x));
    dropZone(
      row,
      id => {
        id = condIdFor(id);
        if (!b.needs.includes(id)) b.needs.push(id);
        refresh();
        toast(`Now only shown if the player ${wording(id)}.`);
      },
      DRAGI
    );
    sec.appendChild(row);
  });
  return sec;
}

/**
 * The button that shows where a choice leads and opens the page picker. o = { label, cur (page id), here (id of the page
 * the choice is on), newLabel, onPick(page), onNew(name) }. Hovering shows the first words of the page it leads to.
 */
function destButton(o) {
  const cur = byId(o.cur);
  const name = cur ? (cur.id === o.here ? `${pname(cur)} (stay on this page)` : pname(cur)) : '→ choose a page…';
  const open = () => {
    pagePicker({
      anchor: btn,
      title: 'Where does this lead? Type to find a page…',
      current: o.cur,
      newLabel: o.newLabel,
      newFirst: true,
      allowNew: true,
      onPick: o.onPick,
      onNew: o.onNew
    });
  };
  const btn = h(
    'button',
    {
      type: 'button',
      class: `in cdest${cur ? '' : ' none'}`,
      'aria-haspopup': 'listbox',
      'aria-label': `${o.label}: ${cur ? pname(cur) : 'not chosen yet'}`,
      title: cur
        ? `${pname(cur)}${pageSnippet(cur, 110) ? `: ${pageSnippet(cur, 110)}` : ' (no text yet)'}\nClick to choose another page.`
        : 'The page this choice leads to. Click, type a few letters of its name, press Enter. You can also drag a page from the list onto this row.',
      onclick: open,
      onkeydown: e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          open();
        }
      }
    },
    [h('span', { class: 'cd-nm', text: name }), h('span', { class: 'cd-car', 'aria-hidden': 'true', text: '▾' })]
  );
  return btn;
}

/** Row 4: choices, one line each. Drop a page anywhere here to add a choice that leads to it. */
function choicesSection(p) {
  const sec = h('section', { class: 'sect' });
  sec.appendChild(
    sectionHead('Choices', 'The buttons players press to move on. Drop a page here to add a choice that leads to it.', [
      p.ending
        ? null
        : h('button', {
            class: 'btn small ghost',
            type: 'button',
            text: '+ Choice',
            title: 'Add a choice',
            onclick: function () {
              p.choices.push(makeChoice('', ''));
              refresh();
              focusSoon('#main .clabel', -1);
            }
          }),
      p.ending ? null : h('span', { class: 'hint tip', text: 'or drop a page here' })
    ])
  );
  if (p.ending)
    sec.appendChild(
      h('div', {
        class: 'hint',
        text: 'This page is an ending, so players see “Play again” instead of choices. Set the page type to “Page” to add choices.'
      })
    );
  p.choices.forEach((c, i) => {
    const keysC = rowKeys(() => p.choices, i, j => focusSoon('#main .clabel', j));
    const label = h('input', {
      class: 'in clabel',
      value: c.label,
      placeholder: 'What the player does…',
      maxlength: 200,
      'aria-label': `Choice ${i + 1} text`,
      title: 'The words on the button. Enter adds another choice; Ctrl+Enter (Cmd+Enter on a Mac) opens the page it leads to, creating it if needed.',
      oninput: function (e) {
        c.label = e.target.value;
        commit(`c:${p.id}${i}`);
      },
      onkeydown: function (e) {
        keysC(e);
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Ctrl/Cmd+Enter: go where this choice leads, making that page first if needed
          let dest = byId(c.to);
          if (!dest) {
            dest = newPage(c.label ? c.label.replace(/[.!?]+$/, '') : 'New page', true);
            c.to = dest.id;
            toast(`Created “${pname(dest)}”.`);
          }
          selId = dest.id;
          refresh();
          const m = $('#main');
          if (m) m.scrollTop = 0;
          return;
        }
        p.choices.splice(i + 1, 0, makeChoice('', ''));
        refresh();
        focusSoon('#main .clabel', i + 1);
      }
    });
    const makeNew = name => {
      const np = newPage(name || (c.label ? c.label.replace(/[.!?]+$/, '') : 'New page'), true);
      c.to = np.id;
      refresh();
      focusSoon('#main .crow>.cdest', i);
      toast(`Created “${pname(np)}”. Press Go › to write it.`);
    };
    const dest = destButton({
      label: `Where choice ${i + 1} leads`,
      cur: c.to,
      here: p.id,
      newLabel: c.label ? c.label.replace(/[.!?]+$/, '') : '',
      onPick: q => {
        c.to = q.id;
        refresh();
        focusSoon('#main .crow>.cdest', i);
      },
      onNew: makeNew
    });
    const row = h('div', { class: 'choice' });
    const tools = h('div', { class: 'rowtools h' }, [
      p.choices.length > 1 ? rowGrip(row, 'choice', () => p.choices, i) : null,
      c.to && byId(c.to)
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn small gobtn',
              title: `Open “${pname(byId(c.to))}”, the page this choice leads to (Ctrl+Enter in the choice’s words does the same). Back (‹) brings you home.`,
              onclick: () => openPage(byId(c.to))
            },
            ['Go ›']
          )
        : h(
            'button',
            {
              type: 'button',
              class: 'btn small gobtn',
              title: 'Make a new page named after this choice and open it (Ctrl+Enter in the choice’s words does the same). Back (‹) brings you home.',
              onclick: () => {
                const dest = newPage(c.label ? c.label.replace(/[.!?]+$/, '') : 'New page', true);
                c.to = dest.id;
                toast(`Created “${pname(dest)}”.`);
                selId = dest.id;
                refresh();
                const m = $('#main');
                if (m) m.scrollTop = 0;
              }
            },
            ['Write ›']
          ),
      condToggle(c, 'choice'),
      adv('write') ? fxToggle(c) : null,
      adv('write') && (statItems().length || adv('items') || c.check) ? checkToggle(c) : null,
      iconBtn(
        '✕',
        'Delete this choice',
        () => {
          p.choices.splice(i, 1);
          refresh();
        },
        false,
        'danger'
      )
    ]);
    [h('div', { class: 'crow' }, [label, dest, tools]), condLine(c, { lock: true }), checkLine(p, c), fxLine(c)].forEach(x => x && row.appendChild(x));
    dropZone(row, id => {
      c.to = id;
      refresh();
      toast(`Linked to “${pname(byId(id))}”.`);
    });
    dropZone(
      row,
      id => {
        id = condIdFor(id);
        if (!c.needs.includes(id)) c.needs.push(id);
        refresh();
        toast(`Now only shown if the player ${wording(id)}.`);
      },
      DRAGI
    );
    sec.appendChild(row);
  });
  if (!p.ending)
    dropZone(sec, id => {
      p.choices.push(makeChoice('', id));
      refresh();
      focusSoon('#main .clabel', -1);
    });
  return sec;
}

/** Footer: which pages lead here, as quick links. Drop a page here to make that page lead to this one:
    it gets a new choice with no words yet, which the checker reminds you to fill in.
    The first page has no drop target: nothing is "before" it (a page that loops back to it is added from that page). */
function reachedFrom(p) {
  const incoming = project.passages.filter(q => q.id !== p.id && q.choices.some(c => c.to === p.id || c.check?.fail === p.id));
  const isStart = p.id === project.start;
  const kids = [h('span', { class: 'sl', text: 'Reached from' })];
  incoming.forEach(q => {
    kids.push(
      h('button', {
        class: 'btn small',
        type: 'button',
        text: pname(q),
        title: `Open “${pname(q)}”`,
        onclick: function () {
          openPage(q);
        }
      })
    );
  });
  kids.push(
    h('span', {
      class: 'hint',
      text: isStart
        ? incoming.length
          ? 'and this is where the story begins.'
          : 'Nothing: this is where the story begins.'
        : incoming.length
          ? 'drop a page here to add another'
          : 'No page leads here yet. Drop a page here to link it.'
    })
  );
  const el = h(
    'div',
    {
      class: 'reached',
      title: isStart ? 'The first page of the story' : 'Pages that have a choice leading here. Drag a page from the list onto this strip to add one.'
    },
    kids
  );
  if (isStart) return el;
  dropZone(el, id => {
    const q = byId(id);
    if (!q || q.id === p.id) return;
    if (q.ending) {
      toast(`“${pname(q)}” is an ending, so it cannot have choices. Change its type first.`);
      return;
    }
    if (q.choices.some(c => c.to === p.id || c.check?.fail === p.id)) {
      toast(`“${pname(q)}” already leads here.`);
      return;
    }
    q.choices.push(makeChoice('', p.id));
    refresh();
    toast(`“${pname(q)}” now has a choice leading here. Open it to write the choice’s words.`);
  });
  return el;
}
