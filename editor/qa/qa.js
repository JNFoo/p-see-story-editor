#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   qa.js - runs the Story Editor's checks. Firefox is the main browser; Chromium runs only in the full tier.

     node qa.js quick     the fast suites that catch most breakage (about 1 minute)
     node qa.js smart     quick, plus every suite whose watched source files changed since the last all-green run
     node qa.js full      everything on Firefox, then everything again on Chromium (the check before a file goes out)
     node qa.js <tier> --only lite      run only suites whose name contains "lite"
     node qa.js <tier> --verbose        print each suite's own output as well (it is always saved in logs/)

   What it prints: one line per suite (pass / pass* / FAIL, seconds, name), the failing lines of any failure, and a
   summary with the slowest suites. Each suite's full output is kept in logs/<name>.log, so nothing has to be pasted
   into a chat to read it. A failing suite is run once more: a pass on the second try prints "pass*" (look at it, it is
   flaky) and two failures print FAIL.
   If a source file is newer than story-editor.html the editor is rebuilt first, because the suites open the built file.
   The stamp of the last all-green run is the file .stamp (it decides what "smart" re-runs).
   --------------------------------------------------------------------------- */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const { failLines, passCount } = require('./lines');
const HERE = __dirname + '/';
const ED = require('path').join(__dirname, '..') + '/';
const LOGS = HERE + 'logs/';
fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(HERE + 'work/shots', { recursive: true });

const SOURCES = ['core.js', 'player.js', 'maplayout.js', 'game.css', 'ui.css', 'ui1-state.js', 'ui2-widgets.js', 'ui3-write.js', 'ui4-map.js', 'ui4-views.js', 'ui4-speed.js', 'ui5-app.js', 'build.py', 'build-game.mjs', 'minify.mjs', 'contract.mjs'];
const EDITOR = SOURCES.filter(f => f !== 'contract.mjs');
const GAME = ['core.js', 'player.js', 'game.css', 'build-game.mjs'];

/* name, command, files that make it worth re-running ("watch"), quick?, and the engines it runs on */
const S = (name, file, watch, quick, engines = ['firefox', 'chromium']) => ({ name, file, watch, quick, engines });
const SUITES = [
  S('top5-safe', 'top5-safe.js', ['ui1-state.js', 'player.js', 'ui5-app.js', 'ui4-speed.js', 'ui2-widgets.js'], true),
  S('top5-new', 'top5-new.js', ['core.js', 'player.js', 'ui4-map.js', 'ui4-speed.js', 'ui5-app.js', 'game.css'], true),
  S('tools8', 'tools8.js', EDITOR, true),
  S('ffsmoke', 'ffsmoke.js', EDITOR, true, ['firefox']),
  S('packed', 'packed-check.js', ['build.py', 'lzma/lzma_pack.py', 'lzma/lzma-decode.js'], true),
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
];
const FUZZ3 = { name: 'fuzz3', cmd: ['node', HERE + 'fuzz3.mjs', '1500', '1'], watch: ['core.js', 'player.js', 'maplayout.js'], quick: false, engine: '' };
const CONTRACT = { name: 'contract', cmd: ['node', ED + 'contract.mjs', '400', '1'], watch: ['core.js', 'player.js', 'contract.mjs'], quick: true, engine: '' };

const args = process.argv.slice(2);
const tier = args.find(a => ['quick', 'smart', 'full'].includes(a)) || 'quick';
const verbose = args.includes('--verbose');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const stampFile = HERE + '.stamp';
const stamp = fs.existsSync(stampFile) ? fs.statSync(stampFile).mtimeMs : 0;
const mtime = f => (fs.existsSync(ED + f) ? fs.statSync(ED + f).mtimeMs : 0);
const changed = SOURCES.filter(f => mtime(f) > stamp);

/* rebuild if the built file is older than its sources */
const builtAt = mtime('story-editor.html');
if (SOURCES.some(f => mtime(f) > builtAt)) {
  const b = spawnSync('python3', [ED + 'build.py'], { cwd: ED, encoding: 'utf8' });
  if (b.status !== 0) { console.log('BUILD FAILED\n' + (b.stdout + b.stderr).split('\n').slice(-12).join('\n')); process.exit(1); }
  console.log('rebuilt story-editor.html (sources were newer)');
}

/* the one suite that needs a web page to talk to: a small local server on the work folder */
const PORT = String(20000 + Math.floor(Math.random() * 20000)); /* a port of its own each run: a server left over from an earlier run (it may serve a folder that no longer exists) can never be mistaken for this one */
process.env.QA_PORT = PORT;
const server = spawn('python3', ['-m', 'http.server', PORT, '--bind', '127.0.0.1'], { cwd: HERE + 'work', stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

/* the jobs for this tier */
const jobs = [];
const want = s => (tier === 'full') || s.quick || (tier === 'smart' && s.watch.some(w => changed.includes(w)));
if (!only || 'contract'.includes(only)) if (want(CONTRACT)) jobs.push({ label: 'contract', cmd: CONTRACT.cmd, lane: 'firefox' });
if (tier === 'full' && (!only || 'fuzz3'.includes(only))) jobs.push({ label: 'fuzz3', cmd: FUZZ3.cmd, lane: 'firefox' });
if (!only) jobs.push({ label: 'lines-selftest', cmd: ['node', 'lines.js'], lane: 'firefox' });
const lane = engine => SUITES.forEach(s => {
  if (!s.engines.includes(engine) || !want(s)) return;
  if (engine === 'chromium' && tier !== 'full') return; /* Chromium only in the full check */
  if (only && !s.name.includes(only)) return;
  jobs.push({ label: `${s.name} ${engine}`, cmd: ['node', s.file, engine], lane: engine });
});
lane('firefox');
lane('chromium');

if (tier === 'smart') console.log('changed since the last all-green run:', changed.join(', ') || 'nothing');
/* Runs one job in the background (so two browsers can work at once) and resolves with its result. */
const run = job => new Promise(done => {
  const t = Date.now();
  let out = '';
  const kid = spawn(job.cmd[0], job.cmd.slice(1), { cwd: HERE, env: { ...process.env, FORCE_COLOR: '0' } });
  const timer = setTimeout(() => { out += '\nSTOPPED: took longer than 20 minutes'; kid.kill('SIGKILL'); }, 1200000);
  kid.stdout.on('data', d => { out += d; });
  kid.stderr.on('data', d => { out += d; });
  kid.on('close', code => {
    clearTimeout(timer);
    /* a line counts as a failure only if the suite itself says so; the patterns are listed in qa/README.md */
    const fails = failLines(out);
    const passes = passCount(out);
    /* fewer checks than the last all-green run means some were skipped, which is a failure too */
    const had = COUNTS[job.label];
    if (had && passes < had) fails.push(`only ${passes} checks ran; the last all-green run had ${had} (qa.js --reset-counts accepts a smaller number on purpose)`);
    done({ ok: code === 0 && !fails.length, out, fails, passes, sec: (Date.now() - t) / 1000 });
  });
});
const countsFile = HERE + 'counts.json';
const COUNTS = !args.includes('--reset-counts') && fs.existsSync(countsFile) ? JSON.parse(fs.readFileSync(countsFile, 'utf8')) : {};
const rows = [];
let bad = 0;
const T0 = Date.now();
/* two lanes (Firefox, Chromium) run side by side; inside a lane the suites run one after another, so a lane's printed lines stay in order */
const lanes = {};
for (const job of jobs) (lanes[job.lane || 'other'] = lanes[job.lane || 'other'] || []).push(job);
/* without a Chromium lane (every tier but "full"), the single Firefox lane is split in two so both processor cores work */
if (!lanes.chromium && lanes.firefox && lanes.firefox.length > 3) {
  const all = lanes.firefox;
  lanes.firefox = all.filter((_, i) => i % 2 === 0);
  lanes.firefox2 = all.filter((_, i) => i % 2 === 1);
}
const report = (job, mark, r) => {
  fs.writeFileSync(LOGS + job.label.replace(/\W+/g, '-') + '.log', r.out);
  rows.push({ mark, sec: r.sec, label: job.label, passes: r.passes });
  console.log(`${mark.padEnd(5)} ${r.sec.toFixed(1).padStart(6)} s  ${job.label}`);
  if (verbose) console.log(r.out.split('\n').map(l => '        ' + l).join('\n'));
  if (mark === 'FAIL') console.log(r.fails.slice(0, 8).map(l => '        ' + l.slice(0, 200)).join('\n') + `\n        (full output: qa/logs/${job.label.replace(/\W+/g, '-')}.log)`);
};
const runLane = async list => {
  for (const job of list) {
    let r = await run(job);
    let mark = 'pass';
    if (!r.ok) {
      fs.writeFileSync(LOGS + job.label.replace(/\W+/g, '-') + '.first-try.log', r.out); /* kept, so a flaky pass* can be looked into */
      const r2 = await run(job);
      r2.sec += r.sec;
      if (r2.ok) mark = 'pass*';
      else { mark = 'FAIL'; bad++; }
      r = r2;
    }
    report(job, mark, r);
  }
};
(async () => {
await Promise.all(Object.values(lanes).map(runLane));
const slow = rows.slice().sort((a, b) => b.sec - a.sec).slice(0, 3).map(r => `${r.label} ${r.sec.toFixed(0)} s`).join(', ');
console.log(`\n${tier}: ${rows.length} suites, ${rows.filter(r => r.mark === 'pass').length} pass, ${rows.filter(r => r.mark === 'pass*').length} pass* (flaky), ${bad} FAIL, ${((Date.now() - T0) / 1000).toFixed(0)} s in all. Slowest: ${slow}`);
if (!bad && tier === 'full' && !only) { /* the check counts of this all-green full run are what later runs are held to */
  const counts = {};
  rows.forEach(r => { if (r.passes) counts[r.label] = r.passes; });
  fs.writeFileSync(countsFile, JSON.stringify(counts, null, 1));
}
if (!bad && tier !== 'quick' && !only) fs.writeFileSync(stampFile, new Date().toISOString());
process.exit(bad ? 1 : 0);
})();
