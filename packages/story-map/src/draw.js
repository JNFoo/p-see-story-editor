/* Two helpers on top of the layout functions, so a story becomes a picture in a few lines:

     const layout = layoutStory(project, { view: 'flow' });     // 'flow' (left to right) | 'down' | 'spine'
     const svg = toSvg(layout, project);                         // an SVG string: save it as map.svg, or put it in a page

   layoutStory returns what the editor's Map tab draws (boxes with x, y, w, h; arrows with waypoints). toSvg is a plain, dependency-free
   renderer for those three views; the Map tab draws more (folding, colors by Given, river, arc, matrix) and you can use the other
   layout functions (arcLayout, matrixLayout, shapeLayout) directly if you want to draw those yourself.

   Copyright (c) 2026 LFC Foundry. MIT License. */
import { mapGraph, layered, MAP_W, MAP_H } from './generated.js';

export function layoutStory(project, opts = {}) {
  const view = opts.view || 'flow';
  const G = mapGraph(project, { as: opts.as || {}, fold: opts.fold !== false, open: opts.open || {}, merge: !!opts.merge });
  G.nodes.forEach(n => {
    n.w = MAP_W;
    n.h = MAP_H;
  });
  const root = G.groupOf[project.start];
  const L = layered(G, { dir: view === 'down' ? 'TB' : 'LR', root, spine: view === 'spine' });
  L.view = view;
  L.G = G;
  return L;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function toSvg(L, project, opts = {}) {
  const name = Object.fromEntries(project.passages.map(p => [p.id, p]));
  const dir = L.dir || 'LR';
  const pad = 24;
  const node = Object.fromEntries(L.nodes.map(n => [n.id, n]));
  const fill = { good: '#d7efd9', bad: '#f6d8d4', '': '#ffffff' };
  const edgePath = e => {
    const a = node[e.from];
    const b = node[e.to];
    if (!a || !b) return '';
    if (e.from === e.to) return `M${a.x + a.w} ${a.y + a.h / 2} c 40 -30 40 -50 0 -50 h-${a.w / 2}`;
    const start = dir === 'TB' ? [a.x + a.w / 2, a.y + a.h] : [a.x + a.w, a.y + a.h / 2];
    const end = dir === 'TB' ? [b.x + b.w / 2, b.y] : [b.x, b.y + b.h / 2];
    const pts = [start, ...(e.pts || []).map(p => (Array.isArray(p) ? p : [p.x, p.y])), end];
    let d = `M${start[0]} ${start[1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const k = dir === 'TB' ? Math.abs(y1 - y0) / 2 : Math.abs(x1 - x0) / 2 + 12;
      d += dir === 'TB' ? ` C${x0} ${y0 + k} ${x1} ${y1 - k} ${x1} ${y1}` : ` C${x0 + k} ${y0} ${x1 - k} ${y1} ${x1} ${y1}`;
    }
    return d;
  };
  const w = L.width + pad * 2;
  const h = L.height + pad * 2;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w} ${h}" width="${w}" height="${h}" font-family="system-ui, sans-serif" font-size="13">`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#667"/></marker></defs>`
  ];
  L.edges.forEach(e => {
    const d = edgePath(e);
    if (d) out.push(`<path d="${d}" fill="none" stroke="#667" stroke-width="1.4"${e.gated ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#arrow)"/>`);
  });
  L.nodes.forEach(n => {
    const p = name[n.pages[0]] || {};
    const label = n.run ? `${n.pages.length} pages in a row` : clip(p.name || 'Untitled page', 24);
    const start = n.pages.includes(project.start);
    out.push(
      `<g><title>${esc(p.name || '')}</title><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" fill="${p.ending ? fill[p.valence] || '#e8e8ee' : fill['']}" stroke="${start ? '#2b6cb0' : '#667'}" stroke-width="${start ? 2.4 : 1.2}"/>` +
        `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 4}" text-anchor="middle" fill="#223">${esc(label)}</text></g>`
    );
  });
  out.push('</svg>');
  return out.join('\n');
}
