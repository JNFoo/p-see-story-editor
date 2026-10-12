/* Builds the pieces that exported games are made from, minified, for build.py. Prints JSON to standard output:
     { js: { head, feats: { <feature>: code } }, css: { base, <feature>: styles } }
   A game does not carry all of this. buildGameHtml (core.js) picks only the features a story uses (klFeatures), so a story
   with no dice, locks, bars, Back button, endings count, Aa button or Given questions gets none of that code or those styles.

   head   the game's rules (the very functions the editor's Play tab runs, copied from core.js with Function.prototype.toString)
          and the core player (klPlayer in player.js)
   feats  one piece per feature module (klFeat<Name> in player.js), each ending by registering itself in KL_FEATS
   css    game.css cut at its "@part" lines; the colors are added per story when it is exported (paletteCss in core.js)
   Minifying is done by esbuild, which only shortens names and spacing. Each piece is minified on its own, so the names the pieces
   share (the rules, KL_FEATS, klPlayer) are kept as they are; that costs a few bytes and is what makes the pieces independent. */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { transformSync } from 'esbuild';

const here = new URL('.', import.meta.url);
const read = f => readFileSync(new URL(f, here), 'utf8');

const ctx = createContext({});
runInContext(
  `${read('core.js')}\n${read('player.js')}
   this.order = KL_FEATURE_ORDER;
   this.head = 'const KL_FEATS={};\\n' + KL_RULES.map(n => eval(n)).concat(klPlayer).map(f => f.toString()).join('\\n');
   this.feats = {};
   KL_FEATURE_ORDER.forEach(n => { const f = eval('klFeat' + n[0].toUpperCase() + n.slice(1)); this.feats[n] = f.toString() + '\\nKL_FEATS.' + n + '=' + f.name + ';'; });`,
  ctx
);
const mini = code => transformSync(code, { minify: true, target: 'es2020', legalComments: 'none' }).code.trim();
const js = { head: mini(ctx.head), feats: {} };
ctx.order.forEach(n => {
  js.feats[n] = mini(ctx.feats[n]);
});

/* game.css, cut at its "@part name" lines */
const css = {};
let part = 'base';
const chunks = { base: [] };
read('game.css')
  .split('\n')
  .forEach(line => {
    const m = /^\/\*@part (\w+)\*\/$/.exec(line.trim());
    if (m) {
      part = m[1];
      chunks[part] = chunks[part] || [];
    } else chunks[part].push(line);
  });
Object.keys(chunks).forEach(k => {
  css[k] = transformSync(chunks[k].join('\n'), { loader: 'css', minify: true, target: ['chrome100', 'safari15', 'firefox100'] }).code.trim();
});
process.stdout.write(JSON.stringify({ js, css }));
