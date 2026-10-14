/* ============================================================================
   TRANSLATIONS (editor only): the spreadsheet round trip and the Translations window
   ----------------------------------------------------------------------------
   File → Translations… saves every text a player can read as a CSV sheet (where it is used, the original, one empty column per language) for
   a translator to fill in a spreadsheet program, and reads the filled sheet back. A row is matched by its original text, so a sheet stays
   usable while the story is edited: a row whose original no longer exists is reported and skipped. The translation tables themselves live
   in project.langs (core.js, "Translations"); an exported game carries them and lets the reader pick a language.
   Copyright (c) 2026 JNFoo. MIT License.
   ============================================================================ */

function csvCell(s) {
  s = String(s === undefined || s === null ? '' : s);
  return /[",;\n\r\t]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text. A byte-order mark first, so Excel opens accented and non-Latin letters correctly. */
function csvWrite(rows) {
  return `﻿${rows.map(r => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** CSV text to rows of cells. Reads quoted cells with line breaks and "" for a quote; the separator is a comma, semicolon or tab (spreadsheet programs differ by country). */
function csvParse(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const count = c => first.split(c).length - 1;
  const sep = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++;
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) (row.push(cell), (cell = ''));
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some(c => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
}

/** "Español (es)" -> { name: 'Español', code: 'es' }. */
function langFromHeader(h) {
  const m = /^(.*?)\s*\(([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)\)\s*$/.exec(String(h).trim());
  return m ? { name: m[1].trim() || m[2], code: m[2] } : { name: String(h).trim(), code: '' };
}

/** The sheet for translators: columns "Where first used", the original, then one per language (an empty "New language" column if there is none yet). */
function translationSheet(proj) {
  const langs = proj.langs || [];
  const head = ['Where first used', `Original (${proj.lang0 || 'English'})`].concat(langs.length ? langs.map(L => (L.code ? `${L.name} (${L.code})` : L.name)) : ['New language (name it here, like Español (es))']);
  const rows = [head];
  xlStrings(proj).forEach(s => rows.push([s.more ? `${s.where} (and ${s.more} more place${s.more === 1 ? '' : 's'})` : s.where, s.text].concat(langs.length ? langs.map(L => L.t[s.text] || '') : [''])));
  return csvWrite(rows);
}

/**
 * Reads a filled sheet into `proj.langs`. A column whose heading matches a language (by name or code) updates it; any other filled column
 * adds a language. Empty cells change nothing. Returns plain-words lines for the report.
 */
function translationImport(proj, text) {
  const rows = csvParse(text);
  if (rows.length < 2 || rows[0].length < 3) throw new Error('That does not look like a translation sheet. It needs a heading row with the original text in the second column and one column for each language after it. Use “Save text for translation” to get a sheet.');
  const want = {};
  xlStrings(proj).forEach(s => (want[s.text] = true));
  const langs = (proj.langs = proj.langs || []);
  const lines = [];
  const unknown = [];
  const cols = rows[0].slice(2).map((h, k) => {
    const hd = langFromHeader(h);
    if (!hd.name || /^New language\b/i.test(hd.name)) return null;
    let L = langs.find(x => x.name.toLowerCase() === hd.name.toLowerCase() || (hd.code && x.code && x.code.toLowerCase() === hd.code.toLowerCase()));
    return { k, hd, L, added: 0, changed: 0 };
  });
  rows.slice(1).forEach(r => {
    const src = xlNorm(r[1]);
    if (!src) return;
    if (!want[src]) {
      if (r.slice(2).some(c => c.trim())) unknown.push(src);
      return;
    }
    cols.forEach(c => {
      if (!c) return;
      const v = xlNorm(r[2 + c.k]);
      if (!v) return;
      if (!c.L) {
        if (langs.length >= LANG_MAX) return;
        c.L = { id: `lg${langs.length + 1}`, name: c.hd.name.slice(0, LANG_NAME_MAX), code: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(c.hd.code) ? c.hd.code : '', t: {} };
        langs.push(c.L);
      }
      const old = c.L.t[src];
      c.L.t[src] = v.slice(0, LANG_TEXT_MAX);
      if (old === undefined) c.added++;
      else if (old !== v) c.changed++;
    });
  });
  proj.langs = cleanLangs(langs);
  if (!proj.langs.length) delete proj.langs;
  cols.forEach(c => {
    if (!c) return;
    const L = (proj.langs || []).find(x => x.name === c.hd.name.slice(0, LANG_NAME_MAX) || (c.hd.code && x.code === c.hd.code));
    if (!L) lines.push(`${c.hd.name}: the column had no translations in it, so no language was added.`);
    else {
      const cov = xlCoverage(proj, L);
      lines.push(`${L.name}: ${c.added} new and ${c.changed} changed translation${c.added + c.changed === 1 ? '' : 's'}. ${cov.done} of ${cov.total} texts are translated now.`);
    }
  });
  if (unknown.length) lines.push(`${unknown.length} row${unknown.length === 1 ? '' : 's'} with a translation did not match any text in the story as it is now (the original may have been edited, or the first two columns changed): “${unknown[0].slice(0, 60)}${unknown[0].length > 60 ? '…' : ''}”${unknown.length > 1 ? ' and others' : ''}. Those were skipped.`);
  if (!cols.some(Boolean)) lines.push('No language columns were found after the “Original” column.');
  return lines;
}

/** How many saved translations no longer match any text in the story (the text was edited or removed). */
function unusedTranslations(proj) {
  const want = {};
  xlStrings(proj).forEach(s => (want[s.text] = true));
  let n = 0;
  (proj.langs || []).forEach(L => Object.keys(L.t).forEach(k => !want[k] && n++));
  return n;
}

/** File → Save text for translation: the CSV sheet. */
async function saveTranslationSheet() {
  const name = `${slug(project.title)}-translation.csv`;
  try {
    const ok = await saveFile(name, translationSheet(project), 'text/csv', 'Translation sheet (CSV)', 'translations');
    if (ok) toast(`Saved ${name}. Fill a language column, then use Import translations.`);
  } catch (e) {
    logError('save translation sheet', e);
    info('The sheet could not be saved', [e?.message || String(e), 'Try again, or choose another folder.']);
  }
}

/** File → Import translations: reads a filled sheet and reports what it changed. */
function importTranslationSheet() {
  readPicked('.csv,.tsv,.txt,text/csv,text/plain', (text, name) => {
    try {
      const before = JSON.stringify(project.langs || []);
      const lines = translationImport(project, text);
      if (JSON.stringify(project.langs || []) !== before) refresh();
      info(`Read ${name}`, lines);
    } catch (e) {
      info('That sheet could not be read', [e?.message || String(e)]);
    }
  });
}

/** File → Translations…: the languages of this story, how complete each is, and the sheet buttons. */
function translationsDialog() {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Translations' }));
    d.appendChild(
      h('div', {
        class: 'hint',
        text: 'Save the story’s words as a sheet, have it translated in a spreadsheet program, and bring it back. The finished game then offers a language menu. Anything not translated stays as you wrote it. Translations are matched by the exact words, so moving pages around never mixes them up, and a sentence you edit simply shows as not translated yet.'
      })
    );
    const base = h('input', { class: 'in', type: 'text', maxlength: String(LANG_NAME_MAX), 'aria-label': 'What the story’s own language is called', value: project.lang0 || 'English' });
    base.addEventListener('change', () => {
      const v = base.value.trim().slice(0, LANG_NAME_MAX);
      if (v && v !== 'English') project.lang0 = v;
      else delete project.lang0;
      refresh();
    });
    d.appendChild(h('label', { class: 'field' }, [h('span', { class: 'sl', text: 'The story’s own language is called' }), base]));
    const list = h('div', { class: 'langlist' });
    (project.langs || []).forEach((L, n) => {
      const cov = xlCoverage(project, L);
      const pctDone = cov.total ? Math.round((100 * cov.done) / cov.total) : 0;
      const nm = h('input', { class: 'in', type: 'text', maxlength: String(LANG_NAME_MAX), 'aria-label': 'Language name', value: L.name });
      const code = h('input', { class: 'in chipnum', type: 'text', maxlength: '12', 'aria-label': 'Language code, like es or fr-CA (lets the game pick it for readers whose browser uses it)', placeholder: 'es', value: L.code });
      nm.addEventListener('change', () => {
        L.name = nm.value.trim().slice(0, LANG_NAME_MAX) || 'Language';
        refresh();
      });
      code.addEventListener('change', () => {
        const v = code.value.trim();
        L.code = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(v) ? v : '';
        code.value = L.code;
        refresh();
      });
      list.appendChild(
        h('div', { class: 'issue' }, [
          h('div', { class: 't' }, [
            h('div', { class: 'row' }, [nm, code]),
            h('div', { class: 'hint', text: `${cov.done} of ${cov.total} texts translated (${pctDone}%)${cov.missing.length ? `. Next: “${cov.missing[0].text.slice(0, 50)}${cov.missing[0].text.length > 50 ? '…' : ''}”` : ''}` })
          ]),
          h('button', {
            class: 'btn small',
            type: 'button',
            text: 'Remove',
            onclick: () => {
              ask(`Remove ${L.name}?`, `${Object.keys(L.t).length} translation${Object.keys(L.t).length === 1 ? '' : 's'} will be removed. You can undo this.`, 'Remove it', true).then(ok => {
                if (!ok) return;
                project.langs.splice(n, 1);
                if (!project.langs.length) delete project.langs;
                refresh();
                translationsDialog();
              });
            }
          })
        ])
      );
    });
    if (!(project.langs || []).length) list.appendChild(h('div', { class: 'hint', text: 'No languages yet. Add one, or save the sheet and name a language in its empty column.' }));
    d.appendChild(list);
    const row = h('div', { class: 'row' }, [
      h('button', {
        class: 'btn',
        type: 'button',
        text: 'Add a language',
        disabled: (project.langs || []).length >= LANG_MAX ? true : null,
        onclick: () => {
          close();
          dialog((e, close2) => {
            e.appendChild(h('h3', { text: 'Add a language' }));
            const nm = h('input', { class: 'in', type: 'text', maxlength: String(LANG_NAME_MAX), 'aria-label': 'Language name', placeholder: 'Español' });
            const code = h('input', { class: 'in chipnum', type: 'text', maxlength: '12', 'aria-label': 'Language code (optional)', placeholder: 'es' });
            e.appendChild(h('div', { class: 'row' }, [nm, code]));
            e.appendChild(h('div', { class: 'hint', text: 'The code is optional. With it, readers whose browser uses that language see it first.' }));
            const go = () => {
              const name = nm.value.trim();
              if (!name) return;
              const c = code.value.trim();
              (project.langs = project.langs || []).push(...cleanLangs([{ id: `lg${project.langs.length + 1}`, name, code: c, t: {} }]));
              refresh();
              close2();
              translationsDialog();
            };
            nm.addEventListener('keydown', ev => ev.key === 'Enter' && go());
            e.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => (close2(), translationsDialog()) }), h('button', { class: 'btn primary', type: 'button', text: 'Add', onclick: go })]));
            setTimeout(() => nm.focus(), 0);
          });
        }
      }),
      h('button', { class: 'btn', type: 'button', text: 'Save text for translation (.csv)…', onclick: saveTranslationSheet }),
      h('button', { class: 'btn', type: 'button', text: 'Import translations (.csv)…', onclick: () => (close(), importTranslationSheet()) })
    ]);
    d.appendChild(row);
    const stale = unusedTranslations(project);
    if (stale)
      d.appendChild(
        h('div', { class: 'row' }, [
          h('span', { class: 'hint', text: `${stale} saved translation${stale === 1 ? '' : 's'} no longer match any text in the story.` }),
          h('button', {
            class: 'btn small',
            type: 'button',
            text: 'Remove them',
            onclick: () => {
              const want = {};
              xlStrings(project).forEach(s => (want[s.text] = true));
              project.langs.forEach(L => Object.keys(L.t).forEach(k => !want[k] && delete L.t[k]));
              refresh();
              translationsDialog();
            }
          })
        ])
      );
    d.appendChild(h('div', { class: 'hint', text: 'To see a language, open the Play tab and use the language menu under the page.' }));
    d.appendChild(h('div', { class: 'row end' }, [h('button', { class: 'btn primary', type: 'button', text: 'Done', onclick: close })]));
  });
}
