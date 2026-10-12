import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProject, layoutStory, toSvg, mapGraph, layered, arcLayout, matrixLayout, shapeLayout, playtest, mapMetrics, MAP_W, MAP_H } from '../dist/story-map.mjs';
import { STARTERS } from '../../story-format/dist/story-format.mjs';
import { makeGenStory } from '../../qa-kit/src/genstory.mjs';
import { loadEditor } from '../../qa-kit/src/editor-vm.mjs';

const ed = loadEditor(['mapGraph', 'layered', 'arcLayout', 'matrixLayout', 'shapeLayout', 'playtest', 'MAP_W', 'MAP_H']);
const genStory = makeGenStory(normalizeProject);
/* layouts hold a few back-references (an arrow's chain points at the arrow), so cycles are written as "[cycle]" */
const J = x => {
  const seen = [];
  return JSON.stringify(x, function (k, v) {
    if (v && typeof v === 'object') {
      if (seen.includes(v)) return '[cycle]';
      seen.push(v);
    }
    return v;
  });
};
const boxes = G => G.nodes.forEach(n => ((n.w = MAP_W), (n.h = MAP_H)));

test('every starter story draws, and the SVG is well formed', () => {
  for (const st of STARTERS) {
    const p = normalizeProject(st.make());
    for (const view of ['flow', 'down', 'spine']) {
      const svg = toSvg(layoutStory(p, { view }), p);
      assert.match(svg, /^<svg [^>]*>[\s\S]*<\/svg>$/);
      assert.equal((svg.match(/<rect /g) || []).length, layoutStory(p, { view }).nodes.length);
      assert.ok(!/NaN|undefined/.test(svg), `${st.name} ${view}`);
    }
  }
});

test('page names are escaped in the SVG', () => {
  const p = normalizeProject({ passages: [{ id: 'a', name: '<script>"&', blocks: [{ text: 'x' }], choices: [] }], start: 'a' });
  assert.ok(!toSvg(layoutStory(p), p).includes('<script>'));
});

test('layouts and simulated players are identical to the editor on 60 random stories', () => {
  assert.equal(MAP_W, ed.MAP_W);
  for (let seed = 1; seed <= 60; seed++) {
    const p = genStory(seed);
    const [g1, g2] = [mapGraph(p, { fold: true, merge: seed % 2 === 0 }), ed.mapGraph(p, { fold: true, merge: seed % 2 === 0 })];
    assert.equal(J(g1), J(g2), `graph ${seed}`);
    boxes(g1);
    boxes(g2);
    const root = g1.groupOf[p.start];
    const dir = seed % 3 ? 'LR' : 'TB';
    const [L1, L2] = [layered(g1, { dir, root, spine: seed % 5 === 0 }), ed.layered(g2, { dir, root, spine: seed % 5 === 0 })];
    assert.equal(J(L1), J(L2), `layered ${seed}`);
    assert.equal(J(arcLayout(g1, L1)), J(ed.arcLayout(g2, L2)), `arc ${seed}`);
    assert.equal(J(matrixLayout(g1, L1)), J(ed.matrixLayout(g2, L2)), `matrix ${seed}`);
    assert.equal(J(shapeLayout(p, g1)), J(ed.shapeLayout(p, g2)), `shape ${seed}`);
    assert.equal(J(playtest(p, { runs: 300 })), J(ed.playtest(p, { runs: 300 })), `playtest ${seed}`);
  }
});

test('the simulated players use the game rules: every path ends on an ending or is counted stuck', () => {
  const p = normalizeProject(STARTERS[0].make());
  const r = playtest(p, { runs: 500 });
  const total = Object.values(r.outcome).reduce((a, b) => a + b, 0);
  assert.equal(total, 500);
});

test('mapMetrics scores stay between 0 and 1', () => {
  const p = normalizeProject(STARTERS[2].make());
  const m = mapMetrics(layoutStory(p), 0, {}, null, false);
  for (const [k, v] of Object.entries(m.scores)) if (v !== null && k !== 'crossings') assert.ok(v >= 0 && v <= 1, k);
});
