/* The editor's suites, for packages/qa-kit/src/runner.js. Run:  node qa.js quick|smart|full   (see README.md)
   Suites run on Firefox first; the full tier runs them again on Chromium. */
const path = require('path');

const SOURCES = ['core.js', 'player.js', 'maplayout.js', 'game.css', 'ui.css', 'ui1-state.js', 'ui2-widgets.js', 'ui3-write.js', 'ui4-map.js', 'ui4-views.js', 'ui4-speed.js', 'ui5-app.js', 'twine.js', 'routes.js', 'changes.js', 'helpers.js', 'ui4-status.js', 'ui4-helpers.js', 'ui4-phone.js', 'translate.js', 'build.py', 'build-game.mjs', 'minify.mjs', 'contract.mjs'];
const EDITOR = SOURCES.filter(f => f !== 'contract.mjs');
const GAME = ['core.js', 'player.js', 'game.css', 'build-game.mjs'];

/* name, file, files that make it worth re-running ("watch"), in the quick tier?, and the engines it runs on */
const S = (name, file, watch, quick, engines = ['firefox', 'chromium']) => ({ name, file, watch, quick, engines });

module.exports = {
  root: '..',                       /* editor/: the sources and the built story-editor.html live here */
  sources: SOURCES,
  serve: 'work',                    /* top5-safe needs a real http page; the runner serves editor/qa/work and sets QA_PORT */
  build: { cmd: ['python3', 'build.py'], output: 'story-editor.html' },
  engines: ['firefox', 'chromium'],
  suites: [
    S('top5-safe', 'top5-safe.js', ['ui1-state.js', 'player.js', 'ui5-app.js', 'ui4-speed.js', 'ui2-widgets.js'], true),
    S('top5-new', 'top5-new.js', ['core.js', 'player.js', 'ui4-map.js', 'ui4-speed.js', 'ui5-app.js', 'game.css'], true),
    S('tools8', 'tools8.js', EDITOR, true),
    S('ffsmoke', 'ffsmoke.js', EDITOR, true, ['firefox']),
    S('packed', 'packed-check.js', ['build.py', 'lzma/lzma_pack.py', 'lzma/lzma-decode.js'], true),
    S('nosave', 'nosave.js', ['player.js', 'game.css', 'core.js'], true),
    S('twowin', 'twowin.js', ['ui1-state.js', 'ui5-app.js', 'ui2-widgets.js'], true),
    S('safety', 'safety.js', ['ui5-app.js', 'ui1-state.js', 'ui2-widgets.js', 'core.js'], true),
    S('twine', 'twine.js', ['twine.js', 'ui5-app.js', 'ui2-widgets.js', 'core.js'], true),
    S('marks', 'marks.js', ['ui3-write.js', 'ui4-map.js', 'ui2-widgets.js', 'ui.css', 'core.js'], true),
    S('routes', 'routes.js', ['routes.js', 'ui4-views.js', 'player.js', 'core.js'], true),
    S('translate', 'translate.js', ['translate.js', 'player.js', 'game.css', 'ui5-app.js', 'core.js'], true),
    S('gamefeel', 'gamefeel.js', ['player.js', 'game.css', 'core.js'], true),
    S('textstress', 'textstress.js', ['player.js', 'game.css', 'core.js'], false),
    S('motion', 'motion.js', ['ui5-app.js', 'ui2-widgets.js', 'ui.css'], true),
    S('touch1', 'touch1.js', EDITOR, true, ['chromium']),
    S('top10-export', 'top10-export.js', ['core.js', 'player.js', 'game.css', 'ui5-app.js'], true),
    S('top10-player', 'top10-player.js', ['core.js', 'player.js', 'game.css'], true),
    S('top10-editor', 'top10-editor.js', EDITOR, true),
    S('write1', 'write1.js', EDITOR, true),
    S('write2', 'write2.js', EDITOR, true),
    S('round3', 'round3.js', EDITOR, true),
    S('bugs12', 'bugs12.js', EDITOR, true),
    S('fuzz1', 'fuzz1.js', EDITOR, false),
    S('fuzz2', 'fuzz2.js', EDITOR, false),
    S('top10-lite', 'top10-lite.js', GAME, false),
    S('real', 'real.js', EDITOR, false),
    S('opts', 'opts.js', EDITOR, false),
    S('last', 'last.js', EDITOR, false),
    S('fix2', 'fix2.js', EDITOR, false),
    S('dlg', 'dlg.js', EDITOR, false),
    S('inter', 'inter.js', EDITOR, false)
  ],
  /* commands that are not browser suites (run once, on the first engine's lane) */
  extra: [
    { name: 'fuzz3', cmd: ['node', 'fuzz3.mjs', '1500', '1'], watch: ['core.js', 'player.js', 'maplayout.js'], quick: false },
    { name: 'twine-diff', cmd: ['node', 'twine-diff.mjs', '120', '1'], watch: ['core.js', 'player.js', 'twine.js'], quick: true },
    { name: 'contract', cmd: ['node', path.join(__dirname, '../contract.mjs'), '400', '1'], watch: ['core.js', 'player.js', 'contract.mjs'], quick: true }
  ]
};
