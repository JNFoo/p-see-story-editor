#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   qa.js - runs the Story Editor's checks. Firefox is the main browser; Chromium and WebKitGTK run in the full tier (one browser at a time).

     node qa.js quick     the fast suites that catch most breakage (about 1 minute)
     node qa.js smart     quick, plus every suite whose watched source files changed since the last all-green run
     node qa.js full      everything on Firefox, then again on Chromium, then again on WebKitGTK (the check before a file goes out; --no-webkit leaves WebKit out)
     node qa.js quick --webkit    the quick suites on Firefox, then the same ones on WebKitGTK;  --webkit-only runs just the WebKitGTK lane
     node qa.js sample    contract plus a rotating quarter of the quick suites (and any whose files changed): a cheap look between edits,
                          never the check before delivery
     node qa.js <tier> --only lite      run only suites whose name contains "lite"
     node qa.js <tier> --verbose        print each suite's own output as well (it is always saved in logs/)
     node qa.js <tier> --against <rev> [--expect-fail]
                          run the browser suites against the editor as built from git revision <rev> (the build from before a fix).
                          A suite that FAILS there notices the bug the fix removed; with --expect-fail the exit code is 0 only when every
                          selected suite fails (the fail-first proof for a new regression check). Game suites still use packages/story-player
                          from the working tree. Nothing is written to .stamp, counts.json or times.json.
     node qa.js --history               how each suite has done over the recorded runs (runs, failures, flaky, average time)

   First line of a run: how many jobs and about how long they take (from the last all-green run). On a failure, a "next:" line says which log
   to read and the command that runs only that suite. Every suite result is appended to ledger.jsonl (kept out of git): that is the flake
   ledger, and "smart" uses it: a suite is skipped for a changed file it has never failed on in 5 or more runs (a full check still runs it).

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

const SOURCES = ['core.js', 'player.js', 'maplayout.js', 'game.css', 'ui.css', 'ui1-state.js', 'ui2-widgets.js', 'ui3-write.js', 'ui4-map.js', 'ui4-views.js', 'ui4-speed.js', 'ui5-app.js', 'twine.js', 'routes.js', 'changes.js', 'helpers.js', 'ui4-status.js', 'ui4-helpers.js', 'ui4-phone.js', 'translate.js', 'build.py', 'build-game.mjs', 'minify.mjs', 'contract.mjs'];
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
  S('nosave', 'nosave.js', ['player.js', 'game.css', 'core.js'], true),
  S('twowin', 'twowin.js', ['ui1-state.js', 'ui5-app.js', 'ui2-widgets.js'], true),
  S('safety', 'safety.js', ['ui5-app.js', 'ui1-state.js', 'ui2-widgets.js', 'core.js'], true),
  S('twine', 'twine.js', ['twine.js', 'ui5-app.js', 'ui2-widgets.js', 'core.js'], true),
  S('marks', 'marks.js', ['ui3-write.js', 'ui4-map.js', 'ui2-widgets.js', 'ui.css', 'core.js'], true),
  S('routes', 'routes.js', ['routes.js', 'ui4-views.js', 'player.js', 'core.js'], true),
  S('helpers', 'helpers.js', ['helpers.js', 'ui4-helpers.js', 'ui4-views.js', 'ui1-state.js', 'ui5-app.js', 'core.js'], true),
  S('undohist', 'undohist.js', ['changes.js', 'ui4-status.js', 'ui1-state.js', 'ui.css', 'player.js', 'core.js'], true),
  S('phone', 'phone.js', ['ui4-phone.js', 'ui5-app.js', 'ui3-write.js', 'ui4-status.js', 'ui1-state.js', 'ui.css', 'core.js'], true),
  S('csp', 'csp.js', ['build.py', 'core.js'], true),
  S('foundry', 'foundry.js', ['foundry-header.txt', 'build.py', 'core.js', 'ui5-app.js', 'ui.css', 'ui4-phone.js'], true),
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
];
const FUZZ3 = { name: 'fuzz3', cmd: ['node', HERE + 'fuzz3.mjs', '1500', '1'], watch: ['core.js', 'player.js', 'maplayout.js'], quick: false, engine: '' };
const TWINE_DIFF = { name: 'twine-diff', cmd: ['node', HERE + 'twine-diff.mjs', '120', '1'], watch: ['core.js', 'player.js', 'twine.js'], quick: true, engine: '' };
const CONTRACT = { name: 'contract', cmd: ['node', ED + 'contract.mjs', '400', '1'], watch: ['core.js', 'player.js', 'contract.mjs'], quick: true, engine: '' };

const args = process.argv.slice(2);
const tier = args.find(a => ['quick', 'smart', 'full', 'sample'].includes(a)) || 'quick';
const verbose = args.includes('--verbose');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const against = args.includes('--against') ? args[args.indexOf('--against') + 1] : '';
const expectFail = args.includes('--expect-fail');
const WEBKIT_ONLY = args.includes('--webkit-only'); /* run just the WebKitGTK lane (no Firefox, no Node-only checks): for looking at that browser alone */
/* WebKitGTK (the third approved browser) runs after Firefox, and after Chromium in the full check, one browser at a time. The full check includes it;
   the quick, smart and sample tiers add it with --webkit; --no-webkit leaves it out of the full check. */
const WEBKIT = WEBKIT_ONLY || args.includes('--webkit') || (tier === 'full' && !args.includes('--no-webkit') && !against);
/* suites that do not run in WebKitGTK, and why (everything else that runs in Firefox does) */
/* two WebKitGTK windows in one browser hang about half the time when other suites load the machine (30 s alone, 3 of 3 runs) */
const SOLO = { 'twowin webkit': 'two windows in one WebKitGTK', 'csp gnome-web': 'one browser at a time', 'epismoke gnome-web': 'one browser at a time' };
const NOT_IN_WEBKIT = { ffsmoke: 'it checks the Firefox stand-in itself', touch1: 'WebKitGTK 2.52.6 has no touch events' };
/* GNOME Web 46.5 (Epiphany) is the fourth approved test browser. It refuses WebDriver clicks, so it gets a short lane of its own, after WebKitGTK and also one at a time:
   the policy check (csp) and a smoke check with script clicks (epismoke). The full check includes it; --epiphany adds it to any tier; --no-webkit leaves it out with WebKitGTK. */
const EPIPHANY = !WEBKIT_ONLY && (args.includes('--epiphany') || (tier === 'full' && WEBKIT)) && !args.includes('--no-webkit');
const EPI_JOBS = [['csp gnome-web', 'csp.js'], ['epismoke gnome-web', 'epismoke.js']];
const RUN = new Date().toISOString();

/* ---- the ledger: one JSON line per suite per run ---- */
const LEDGER = HERE + 'ledger.jsonl';
const readLedger = () => {
  if (!fs.existsSync(LEDGER)) return [];
  return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
};
const ledger = readLedger();
if (args.includes('--history')) {
  const by = {};
  ledger.filter(e => !e.only && !e.against).forEach(e => {
    const b = (by[e.label] = by[e.label] || { runs: 0, fail: 0, flaky: 0, sec: 0 });
    b.runs++; b.sec += e.sec; if (e.mark === 'FAIL') b.fail++; if (e.mark === 'pass*') b.flaky++;
  });
  const names = Object.keys(by).sort((a, b) => (by[b].fail + by[b].flaky) - (by[a].fail + by[a].flaky) || a.localeCompare(b));
  console.log(`${ledger.length} recorded results (ledger.jsonl)\n` + 'suite'.padEnd(26) + 'runs  FAIL  flaky  avg s');
  names.forEach(n => console.log(n.padEnd(26) + String(by[n].runs).padStart(4) + String(by[n].fail).padStart(6) + String(by[n].flaky).padStart(7) + (by[n].sec / by[n].runs).toFixed(1).padStart(7)));
  process.exit(0);
}
/* for a suite and a changed file: how many recorded runs had that file changed, and how many of them were not a clean pass */
const pairStat = (label, file) => {
  let n = 0, f = 0;
  ledger.forEach(e => { if (e.label === label && !e.only && !e.against && (e.changed || []).includes(file)) { n++; if (e.mark !== 'pass') f++; } });
  return { n, f };
};
const stampFile = HERE + '.stamp';
const stamp = fs.existsSync(stampFile) ? fs.statSync(stampFile).mtimeMs : 0;
const mtime = f => (fs.existsSync(ED + f) ? fs.statSync(ED + f).mtimeMs : 0);
const changed = SOURCES.filter(f => mtime(f) > stamp);

/* --against <rev>: build the editor as it was at that revision, in a temporary copy of the repository, and point the suites at it */
let worktree = '';
if (against) {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ED, encoding: 'utf8' }).stdout.trim();
  worktree = require('fs').mkdtempSync(require('os').tmpdir() + '/qa-against-');
  const add = spawnSync('git', ['worktree', 'add', '--detach', worktree + '/wt', against], { cwd: top, encoding: 'utf8' });
  if (add.status !== 0) { console.log('--against: git could not check out ' + against + '\n' + add.stderr); process.exit(1); }
  fs.symlinkSync(top + '/node_modules', worktree + '/wt/node_modules');
  const b = spawnSync('python3', [worktree + '/wt/editor/build.py'], { cwd: worktree + '/wt/editor', encoding: 'utf8', env: { ...process.env, ESBUILD: process.env.ESBUILD || top + '/node_modules/.bin/esbuild' } });
  if (b.status !== 0) { console.log('--against: the old build failed\n' + (b.stdout + b.stderr).split('\n').slice(-12).join('\n')); process.exit(1); }
  process.env.QA_EDITOR = worktree + '/wt/editor/story-editor.html';
  console.log(`running against the editor built from ${against} (${process.env.QA_EDITOR})`);
  process.on('exit', () => { spawnSync('git', ['worktree', 'remove', '--force', worktree + '/wt'], { cwd: top }); try { fs.rmSync(worktree, { recursive: true, force: true }); } catch (e) { /* gone */ } });
}

/* rebuild if the built file is older than its sources */
const builtAt = mtime('story-editor.html');
if (!against && SOURCES.some(f => mtime(f) > builtAt)) {
  const b = spawnSync('python3', [ED + 'build.py'], { cwd: ED, encoding: 'utf8' });
  if (b.status !== 0) { console.log('BUILD FAILED\n' + (b.stdout + b.stderr).split('\n').slice(-12).join('\n')); process.exit(1); }
  console.log('rebuilt story-editor.html (sources were newer)');
}

/* the one suite that needs a web page to talk to: a small local server on the work folder */
const PORT = String(20000 + Math.floor(Math.random() * 20000)); /* a port of its own each run: a server left over from an earlier run (it may serve a folder that no longer exists) can never be mistaken for this one */
process.env.QA_PORT = PORT;
const server = spawn('python3', ['-m', 'http.server', PORT, '--bind', '127.0.0.1'], { cwd: HERE + 'work', stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });
/* the first suite to need the server must not start before it is listening (it used to fail once, then pass on the retry) */
const waitForServer = async () => {
  for (let i = 0; i < 100; i++) {
    if (await new Promise(ok => { const c = require('net').connect(+PORT, '127.0.0.1'); c.on('connect', () => { c.destroy(); ok(true); }); c.on('error', () => ok(false)); })) return;
    await new Promise(r => setTimeout(r, 100));
  }
};

/* First line of every run: the browsers this run really drives, read from the programs themselves (never from a label), so a run cannot be
   reported under the wrong browser. Chromium is only used by the full check, --against and the phone/touch suites. */
{
  const ver = exe => { try { return (spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 20000 }).stdout || '').trim().split('\n')[0] || 'version not readable'; } catch (e) { return 'version not readable'; } };
  const ff = process.env.FIREFOX_PATH || process.env.FIREFOX_158 || '';
  let cr = process.env.CHROMIUM_PATH || '', stock = false;
  if (!cr) { try { cr = require('./engine').chromiumPath(); stock = true; } catch (e) { cr = ''; } }
  const usesCr = tier === 'full' || against || args.includes('--chromium');
  console.log(`browsers: Firefox = ${ff ? ver(ff) + ' (' + ff + ')' : 'FIREFOX_PATH not set'}; Chromium = ${usesCr ? (cr ? ver(cr) + ' (' + cr + ')' + (stock ? ' STOCK Playwright build, not the approved ungoogled one; set CHROMIUM_PATH' : '') : 'not found') : 'not used in this tier'}; WebKitGTK = ${WEBKIT ? require('../../packages/qa-kit/src/webkit.js').version() : 'not used in this tier'}; GNOME Web = ${EPIPHANY ? (() => { const e = spawnSync('dpkg-query', ['-W', '-f', '${Version}', 'epiphany-browser'], { encoding: 'utf8' }); return e.status === 0 ? 'GNOME Web (Epiphany) ' + e.stdout.trim().replace(/-.*$/, '') : 'GNOME Web (version not found)'; })() : 'not used in this tier'}`);
}
/* the jobs for this tier */
const jobs = [];
const skipped = []; /* suites "smart" left out because their history says the changed files never broke them */
const quickNames = SUITES.filter(x => x.quick).map(x => x.name).sort();
const sampleTurn = new Set(ledger.filter(e => e.tier === 'sample').map(e => e.run)).size % 4;
const watched = s => {
  const hit = s.watch.filter(w => changed.includes(w));
  if (!hit.length) return false;
  const live = hit.some(w => { const p = pairStat(`${s.name} firefox`, w); return p.n < 5 || p.f > 0; });
  if (!live) skipped.push(s.name);
  return live;
};
const want = s => against ? true : tier === 'full' ? true : tier === 'sample' ? (s.quick ? quickNames.indexOf(s.name) % 4 === sampleTurn || watched(s) : watched(s)) : s.quick || (tier === 'smart' && watched(s));
if (!against && !WEBKIT_ONLY && (!only || 'contract'.includes(only))) if (want(CONTRACT) || tier === 'sample') jobs.push({ label: 'contract', cmd: CONTRACT.cmd, lane: 'firefox' });
if (!against && !WEBKIT_ONLY && (!only || 'twine-diff'.includes(only))) if (want(TWINE_DIFF) || tier === 'sample') jobs.push({ label: 'twine-diff', cmd: TWINE_DIFF.cmd, lane: 'firefox' });
if (!against && !WEBKIT_ONLY && tier === 'full' && (!only || 'fuzz3'.includes(only))) jobs.push({ label: 'fuzz3', cmd: FUZZ3.cmd, lane: 'firefox' });
if (!only && !against && !WEBKIT_ONLY) jobs.push({ label: 'lines-selftest', cmd: ['node', 'lines.js'], lane: 'firefox' });
const lane = engine => SUITES.forEach(s => {
  if (WEBKIT_ONLY && engine !== 'webkit') return;
  if (!(s.engines.includes(engine) || (engine === 'webkit' && s.engines.includes('firefox') && !NOT_IN_WEBKIT[s.name])) || !want(s)) return;
  if (engine === 'chromium' && tier !== 'full' && !against) return; /* Chromium only in the full check */
  if (engine === 'webkit' && !WEBKIT) return; /* WebKitGTK only when asked for (--webkit) or in the full check */
  if (only && !s.name.includes(only)) return;
  jobs.push({ label: `${s.name} ${engine}`, cmd: ['node', s.file, engine], lane: engine });
});
lane('firefox');
lane('chromium');
lane('webkit');
if (EPIPHANY) EPI_JOBS.forEach(([label, file]) => { if (!only || label.includes(only) || file.includes(only)) jobs.push({ label, cmd: ['env', 'WEBKIT=epiphany', 'node', file, 'webkit'], lane: 'epiphany' }); });

if (tier === 'smart' || tier === 'sample') console.log('changed since the last all-green run:', changed.join(', ') || 'nothing');
if (skipped.length) console.log('left out because their history shows the changed files never broke them (5 or more runs): ' + [...new Set(skipped)].join(', ') + ' (a full check still runs them)');
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
/* A pool of workers (one lane per browser, run one after the other) takes the longest suites first (by how long each took last time, in times.json), so no worker is left with one long suite at
   the end. Suites spend most of their time waiting for the page (about 40% of the two cores were busy with two lanes), so three run at once;
   QA_JOBS=n changes that. Each worker prints a line when its suite ends. */
const timesFile = HERE + 'times.json';
const TIMES = fs.existsSync(timesFile) ? JSON.parse(fs.readFileSync(timesFile, 'utf8')) : {};
/* One browser at a time (the owner's rule, Oct 17): all Firefox jobs finish before the first Chromium job starts. The Node-only jobs ride in the first group. */
const byTime = (x, y) => (TIMES[y.label] ?? 40) - (TIMES[x.label] ?? 40);
let queue = [];
const WORKERS = Math.max(1, +process.env.QA_JOBS || Math.min(7, Math.max(3, require('os').cpus().length + 3))); /* measured Oct 17 on 4 cores: 3 at a time 150 s, 5 at a time 112 s (old start-up); with the warm profile quick took 5: 64 s, 7: 57 s, 10: 78 s and a flaky pass, 29 of 29 pass at 5 and 7 */
{
  const known = jobs.filter(j => TIMES[j.label] !== undefined);
  const secs = jobs.reduce((t, j) => t + (TIMES[j.label] ?? 40), 0) / WORKERS;
  console.log(`expected: ${jobs.length} jobs, about ${Math.round(secs)} s with ${WORKERS} at a time (${known.length} of them have a time from the last all-green run; the rest are guessed at 40 s)`);
}
const report = (job, mark, r) => {
  fs.writeFileSync(LOGS + job.label.replace(/\W+/g, '-') + '.log', r.out);
  rows.push({ mark, sec: r.sec, label: job.label, passes: r.passes });
  try { fs.appendFileSync(LEDGER, JSON.stringify({ run: RUN, t: new Date().toISOString(), tier, label: job.label, mark, sec: Math.round(r.sec), changed, only: !!only, against: !!against }) + '\n'); } catch (e) { /* the ledger is a convenience */ }
  const slug = job.label.replace(/\W+/g, '-');
  const suite = job.label.split(' ')[0];
  console.log(`${mark.padEnd(5)} ${r.sec.toFixed(1).padStart(6)} s  ${job.label}`);
  if (verbose) console.log(r.out.split('\n').map(l => '        ' + l).join('\n'));
  if (mark === 'FAIL') console.log(r.fails.slice(0, 8).map(l => '        ' + l.slice(0, 200)).join('\n') + `\n        (full output: qa/logs/${slug}.log)` + (against ? '' : `\n        next: read the failing lines above in qa/logs/${slug}.log; run only this suite with: node qa.js ${tier === 'sample' ? 'quick' : tier} --only ${suite}`));
  if (mark === 'pass*') console.log(`        next: flaky (failed once, passed on the second try); the first try is in qa/logs/${slug}.first-try.log; node qa.js history shows how often`.replace('node qa.js history', 'node qa.js --history'));
};
const runOne = async job => {
  let r = await run(job);
  let mark = 'pass';
  if (!r.ok && against) { mark = 'FAIL'; bad++; } /* against an old build a failure is the answer, not something to retry */
  else if (!r.ok) {
    fs.writeFileSync(LOGS + job.label.replace(/\W+/g, '-') + '.first-try.log', r.out); /* kept, so a flaky pass* can be looked into */
    const r2 = await run(job);
    r2.sec += r.sec;
    if (r2.ok) mark = 'pass*';
    else { mark = 'FAIL'; bad++; }
    r = r2;
  }
  report(job, mark, r);
};
const worker = async () => { for (let job; (job = queue.shift()); ) await runOne(job); };
(async () => {
await waitForServer();
for (const lane of ['firefox', 'chromium', 'webkit', 'epiphany']) {
  queue = jobs.filter(j => j.lane === lane && !SOLO[j.label]).sort(byTime);
  await Promise.all(Array.from({ length: lane === 'webkit' && !process.env.QA_JOBS ? Math.min(WORKERS, 5) : WORKERS }, worker)); /* WebKitGTK: 5 at a time (lane alone, 35 suites: 5 -> 187 s and 0 flaky, 7 -> 241 s and 4 flaky) */
  /* suites that need the machine to themselves run last, one at a time */
  for (const j of jobs.filter(j => j.lane === lane && SOLO[j.label])) { queue = [j]; await worker(); }
}
if (!bad && !against) { rows.forEach(r => { TIMES[r.label] = Math.round(r.sec); }); fs.writeFileSync(timesFile, JSON.stringify(TIMES, null, 1)); }
const slow = rows.slice().sort((a, b) => b.sec - a.sec).slice(0, 3).map(r => `${r.label} ${r.sec.toFixed(0)} s`).join(', ');
console.log(`\n${tier}: ${rows.length} suites, ${rows.filter(r => r.mark === 'pass').length} pass, ${rows.filter(r => r.mark === 'pass*').length} pass* (flaky), ${bad} FAIL, ${((Date.now() - T0) / 1000).toFixed(0)} s in all. Slowest: ${slow}`);
if (bad && !against) console.log(`Next: fix the first failure above, then run only that suite (the "next:" line under it); finish with: node qa.js ${tier === 'sample' ? 'quick' : tier}`);
if (against) {
  const noticed = rows.filter(r => r.mark === 'FAIL').length;
  console.log(`against ${against}: ${noticed} of ${rows.length} suites FAIL on the old build (they notice the bug); ${rows.length - noticed} pass there (they do not notice it)`);
  process.exit(expectFail ? (noticed === rows.length && rows.length ? 0 : 1) : 0);
}
if (!bad && tier === 'full' && !only && !WEBKIT_ONLY) { /* the check counts of this all-green full run are what later runs are held to */
  const counts = {};
  rows.forEach(r => { if (r.passes) counts[r.label] = r.passes; });
  fs.writeFileSync(countsFile, JSON.stringify(counts, null, 1));
}
if (!bad && tier !== 'quick' && tier !== 'sample' && !only && !WEBKIT_ONLY) fs.writeFileSync(stampFile, new Date().toISOString());
process.exit(bad ? 1 : 0);
})();
