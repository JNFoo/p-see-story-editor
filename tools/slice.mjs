/* Cuts top-level declarations out of the editor's source files and follows what they use, so a package can be made of exactly the
   code it needs and nothing else. The editor's files are formatted by Prettier, so a top-level declaration starts at column 0 and ends
   where the next one starts; each cut piece is checked to be valid JavaScript by esbuild. */
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const START = /^(?:async\s+function\s*\*?|function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
const COMMENT = /^(?:\/\*|\/\/)/;

/** Scans one line and says whether it ends inside a template literal or a block comment (carried over from the line before). */
function scanLine(line, st) {
  // st: { tpl: number of open template literals (with their ${ } depths), block: bool, depth: [] }
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (st.block) {
      if (c === '*' && line[i + 1] === '/') ((st.block = false), i++);
      i++;
      continue;
    }
    const top = st.stack[st.stack.length - 1];
    if (top && top.t === 'tpl') {
      if (c === '\\') i += 2;
      else if (c === '`') (st.stack.pop(), i++);
      else if (c === '$' && line[i + 1] === '{') (st.stack.push({ t: 'expr', d: 0 }), (i += 2));
      else i++;
      continue;
    }
    // normal code (or inside ${ })
    if (c === '/' && line[i + 1] === '/') break;
    if (c === '/' && line[i + 1] === '*') {
      st.block = true;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
      i = j + 1;
      continue;
    }
    if (c === '`') (st.stack.push({ t: 'tpl' }), i++);
    else if (c === '/' && /[=(,:;!&|?{}\[]\s*$/.test(line.slice(0, i)) || (c === '/' && line.slice(0, i).trim() === '')) {
      // a regular-expression literal: skip to its closing slash (not one inside a [class])
      let j = i + 1,
        cls = false;
      while (j < line.length && (cls || line[j] !== '/')) {
        if (line[j] === '\\') j++;
        else if (line[j] === '[') cls = true;
        else if (line[j] === ']') cls = false;
        j++;
      }
      i = j + 1;
    } else {
      if (top && top.t === 'expr') {
        if (c === '{') top.d++;
        else if (c === '}') {
          if (top.d === 0) st.stack.pop();
          else top.d--;
        }
      }
      i++;
    }
  }
  return st;
}

/** Splits source text into pieces: { names: [declared names], text, kind: 'decl' | 'stmt' }. */
export function pieces(src) {
  const lines = src.split('\n');
  const out = [];
  let cur = null;
  let lead = []; // comment lines waiting for the declaration they describe
  const st = { block: false, stack: [] };
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (const line of lines) {
    const inside = st.block || st.stack.length > 0; // the line starts inside a comment or a template literal
    scanLine(line, st);
    if (inside) {
      (cur || { text: '' }) && cur ? (cur.text += '\n' + line) : lead.push(line);
      continue;
    }
    const col0 = line.length > 0 && !/^\s/.test(line);
    const m = col0 && START.exec(line);
    if (m) {
      flush();
      cur = { names: [m[1]], text: [...lead, line].join('\n'), kind: 'decl' };
      lead = [];
    } else if (col0 && COMMENT.test(line)) {
      flush();
      lead.push(line);
    } else if (line.trim() === '') {
      if (cur) cur.text += '\n' + line;
      else if (lead.length) lead.push(line);
    } else if (col0 && !(cur && /^[}\])]/.test(line))) {
      flush();
      cur = { names: [], text: [...lead, line].join('\n'), kind: 'stmt' };
      lead = [];
    } else if (cur) cur.text += '\n' + line;
    else lead.push(line);
  }
  flush();
  return out;
}

/** The identifiers a piece mentions (comments and quoted strings are blanked first, so words in them do not count). */
export function mentions(text) {
  /* A small tokenizer: identifiers count only in code, including code inside `${ }` in a template literal, but not in
     comments, strings, regular expressions or the text of a template. */
  const set = new Set();
  const stack = []; // 'tpl' | {d}
  let i = 0;
  let last = ''; // last significant character, to tell a regex from a division
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const top = stack[stack.length - 1];
    if (top === 'tpl') {
      if (c === '\\') i += 2;
      else if (c === '`') (stack.pop(), i++, (last = '`'));
      else if (c === '$' && text[i + 1] === '{') (stack.push({ d: 0 }), (i += 2), (last = '{'));
      else i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      i = i < 0 ? n : i + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      i = j + 1;
      last = c;
      continue;
    }
    if (c === '`') (stack.push('tpl'), i++);
    else if (c === '/' && (last === '' || /[=(,:;!&|?{}\[+\-*%<>~^]/.test(last) || /(?:return|typeof|case)$/.test(text.slice(Math.max(0, i - 7), i).trimEnd()))) {
      let j = i + 1,
        cls = false;
      while (j < n && (cls || text[j] !== '/') && text[j] !== '\n') {
        if (text[j] === '\\') j++;
        else if (text[j] === '[') cls = true;
        else if (text[j] === ']') cls = false;
        j++;
      }
      i = j + 1;
      last = '/';
      continue;
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(text[j])) j++;
      set.add(text.slice(i, j));
      i = j;
      last = 'a';
      continue;
    } else {
      if (top && c === '{') top.d++;
      else if (top && c === '}') {
        if (top.d === 0) (stack.pop(), (last = ''));
        else top.d--;
      }
      if (!/\s/.test(c)) last = c;
      i++;
    }
  }
  return set;
}

export function load(files) {
  const all = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    pieces(src).forEach(p => all.push({ ...p, file: f }));
  }
  return all;
}

/** Pieces needed by `roots` (names), in source order. Statements such as `KL_FEATS.ask = klFeatAsk;` come along when the
 *  name they start with is in the cut. */
export function closure(all, roots) {
  const byName = new Map();
  all.forEach(p => p.names.forEach(n => byName.set(n, p)));
  const need = new Set();
  const stack = [];
  const add = p => {
    if (p && !need.has(p)) {
      need.add(p);
      stack.push(p);
    }
  };
  roots.forEach(r => {
    if (!byName.has(r)) throw new Error(`root "${r}" is not a top-level declaration in the sources`);
    add(byName.get(r));
  });
  const lead = p => (/^([A-Za-z_$][\w$]*)/.exec(p.text.split('\n').filter(l => l && !/^\s*(\/\*|\*|\/\/)/.test(l))[0] || '') || [])[1];
  for (;;) {
    while (stack.length) {
      const p = stack.pop();
      for (const id of mentions(p.text)) if (byName.has(id)) add(byName.get(id));
    }
    let grew = false;
    all.forEach(p => {
      if (p.kind === 'stmt' && !need.has(p) && byName.has(lead(p)) && need.has(byName.get(lead(p)))) (add(p), (grew = true));
    });
    if (!grew) break;
  }
  return all.filter(p => need.has(p));
}

export function check(text, label) {
  try {
    transformSync(text, { loader: 'js', target: 'es2020' });
  } catch (e) {
    throw new Error(`${label}: the cut-out code is not valid JavaScript: ${e.message.split('\n')[0]}`);
  }
}
