// Measures the finished editor and a few exported games, for the size budget in build.py.
// Usage: node budget.mjs story-editor.html   ->  prints JSON { editor: {bytes, gzip}, games: [{name, bytes, gzip}] }
// The games are made with the real buildGameHtml() from the pieces inside the built editor, so the numbers are what players get.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

const here = new URL('.', import.meta.url);
const read = f => readFileSync(new URL(f, here), 'utf8');
const built = readFileSync(process.argv[2], 'utf8');
const between = (open, close) => built.slice(built.indexOf(open) + open.length, built.indexOf(close, built.indexOf(open)));
const parts = JSON.parse(between('<script type="application/json" id="game-parts">', '</script>'));
const fonts = between('<style id="font-ui">', '</style>');
const fontsLite = between('<script type="text/plain" id="font-lite">', '</script>');

const ctx = createContext({ console });
/* Page and choice ids are random (and sometimes a character shorter), which made the measured size wobble by a byte or two between builds.
   A fixed random sequence and a fixed clock make every measurement repeatable. */
runInContext(`(() => { let a = 12345; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; Date.now = () => 1790000000000; })();`, ctx);
runInContext(
  `${read('core.js')}\n${read('player.js')}\nthis.C = { STARTERS, normalizeProject, buildGameHtml, makeProject, makePassage, makeChoice, makeBlock, makeItem };`,
  ctx
);
const C = ctx.C;
const assets = { parts, fonts, fontsLite };
const size = html => ({ bytes: Buffer.byteLength(html), gzip: gzipSync(html).length });

/* the example story that ships inside the editor */
const keepers = C.normalizeProject(JSON.parse(read('keepers-light.project.json')));

/* A standard game: 25 pages of about 70 words, two or three choices each, a few things to carry, one number and one dice check.
   Made the same way every time, so the budget only moves when the code does. */
function standard() {
  const P = C.makeProject();
  P.title = 'Standard twenty-five';
  const key = C.makeItem('Brass key', 'object');
  const lamp = C.makeItem('Lantern', 'object');
  const wits = C.makeItem('Wits', 'stat');
  wits.lo = 0; wits.hi = 6; wits.start = 3; wits.show = true;
  P.items = [key, lamp, wits];
  const words = 'the old house stood quiet at the edge of the field and the wind moved through the long grass while a light burned in one window'.split(' ');
  const text = i => Array.from({ length: 70 }, (_, k) => words[(i * 7 + k * 3) % words.length]).join(' ') + '.';
  P.passages = Array.from({ length: 25 }, (_, i) => {
    const p = C.makePassage(`Page ${i + 1}`);
    p.blocks = [C.makeBlock(text(i))];
    return p;
  });
  P.passages.forEach((p, i) => {
    const to = k => P.passages[Math.min(24, i * 2 + k)].id;
    if (i >= 12) { p.ending = true; return; }
    p.choices = [C.makeChoice('Go on', to(1)), C.makeChoice('Look around', to(2))];
    if (i === 2) p.gives = [key.id];
    if (i === 3) p.gives = [lamp.id];
    if (i === 4) p.choices[0].needs = [key.id];
    if (i === 5) p.choices[1].check = { stat: wits.id, target: 8, fail: P.passages[i + 1].id };
  });
  P.start = P.passages[0].id;
  return C.normalizeProject(JSON.parse(JSON.stringify(P)));
}

const out = {
  editor: size(built),
  games: [
    { name: 'The Keeper’s Light (the built-in example)', ...size(C.buildGameHtml(keepers, assets)) },
    { name: 'Standard 25-page game', ...size(C.buildGameHtml(standard(), assets)) },
    { name: 'Standard 25-page game, Place code on', ...size(C.buildGameHtml(Object.assign(standard(), { game: C.normalizeProject({ ...standard(), game: { place: true } }).game }), assets)) }
  ]
};
console.log(JSON.stringify(out));
