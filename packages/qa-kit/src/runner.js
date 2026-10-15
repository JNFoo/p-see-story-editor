#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   runner.js - a small tiered test runner. It runs your suites (each one a node script that prints "PASS name" / "FAIL name"
   lines), retries a failure once, and prints one short summary.

     node runner.js [config.cjs] quick|smart|full [--only text] [--verbose] [--reset-counts] [--help]

   Copyright (c) 2026 LFC Foundry. MIT License.
   --------------------------------------------------------------------------- */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { failLines, passCount } = require('./lines.js');

const HELP = `qa-kit runner: run a project's test suites in tiers.

Usage: node runner.js [config.cjs] [quick|smart|full] [options]

  quick           the suites marked quick, on the first engine (default tier)
  smart           quick, plus every suite whose watched source files changed since the last all-green run
  full            every suite on every engine (the others run side by side with the first)

  --only <text>   only suites whose name contains <text>
  --verbose       also print each suite's own output (it is always saved in logs/)
  --reset-counts  accept a smaller number of PASS lines than the last all-green full run
  --help          this text

The config is a CommonJS module (default ./qa.config.cjs) that exports:
  root     folder the sources and the built file are relative to
  dir      folder suites run in and where logs/, .stamp and counts.json go (default: the config file's folder)
  sources  files under root; a suite is re-run by "smart" when a file in its watch list is newer than the stamp
  suites   [{ name, file, watch, quick, engines }]  run as: node <file> <engine>
  extra    [{ name, cmd: [...], watch, quick }]     any other command (runs on the first engine's lane)
  engines  default ['firefox', 'chromium']; the first runs in every tier, the others only in "full"
  build    optional { cmd: [...], output } rebuilds first when a source is newer than root/<output>
  serve    optional folder (under dir) to serve over http on 127.0.0.1; its port is passed to every suite as QA_PORT
  timeoutMin  per-run limit, default 20

A suite fails if it exits non-zero, prints a failing line (see lines.js), or prints fewer PASS lines than the last all-green
full run. A failing suite runs once more: pass on the retry is shown as "pass*" (flaky), two failures as FAIL.
Exit code 0 when nothing failed, 1 otherwise.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(HELP); process.exit(0); }

const only = args.includes('--only') ? args[args.indexOf('--only') + 1] || '' : '';
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');
const tier = positional.find(a => ['quick', 'smart', 'full'].includes(a)) || 'quick';
const configArg = positional.find(a => /\.(c?js|json)$/.test(a)) || 'qa.config.cjs';
const verbose = args.includes('--verbose');

const configPath = path.resolve(configArg);
if (!fs.existsSync(configPath)) { console.error(`No config file at ${configPath}\n\n${HELP}`); process.exit(2); }
const cfg = require(configPath);
const DIR = path.resolve(cfg.dir || path.dirname(configPath));
const ROOT = path.resolve(DIR, cfg.root || '.');
const ENGINES = cfg.engines || ['firefox', 'chromium'];
const SOURCES = cfg.sources || [];
const LOGS = path.join(DIR, 'logs');
fs.mkdirSync(LOGS, { recursive: true });

/* ---- what changed since the last all-green run, and a rebuild if the built file is stale ---- */
const stampFile = path.join(DIR, '.stamp');
const stamp = fs.existsSync(stampFile) ? fs.statSync(stampFile).mtimeMs : 0;
const mtime = f => (fs.existsSync(path.join(ROOT, f)) ? fs.statSync(path.join(ROOT, f)).mtimeMs : 0);
const changed = SOURCES.filter(f => mtime(f) > stamp);

if (cfg.build) {
  const builtAt = mtime(cfg.build.output);
  if (SOURCES.some(f => mtime(f) > builtAt)) {
    const [cmd, ...rest] = cfg.build.cmd;
    const b = spawnSync(cmd, rest, { cwd: path.resolve(ROOT, cfg.build.cwd || '.'), encoding: 'utf8' });
    if (b.status !== 0) { console.log('BUILD FAILED\n' + (b.stdout + b.stderr).split('\n').slice(-12).join('\n')); process.exit(1); }
    console.log(`rebuilt ${cfg.build.output} (sources were newer)`);
  }
}

/* ---- the jobs for this tier ---- */
const want = s => tier === 'full' || s.quick || (tier === 'smart' && (s.watch || []).some(w => changed.includes(w)));
/* optional: a small static server for suites that need a real http page (not file://); a fresh random port each run */
if (cfg.serve) {
  const http = require('http');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
  const base = path.resolve(DIR, cfg.serve);
  const srv = http.createServer((req, res) => {
    const f = path.join(base, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  const port = 20000 + Math.floor(Math.random() * 20000);
  srv.listen(port, '127.0.0.1');
  srv.unref();
  process.env.QA_PORT = String(port);
}
const jobs = [];
for (const x of cfg.extra || []) if ((!only || x.name.includes(only)) && want(x)) jobs.push({ label: x.name, cmd: x.cmd, lane: ENGINES[0] });
if (!only) jobs.push({ label: 'lines-selftest', cmd: [process.execPath, path.join(__dirname, 'lines.js')], lane: ENGINES[0] });
ENGINES.forEach((engine, i) => {
  if (i > 0 && tier !== 'full') return; /* the other engines only in the full check */
  for (const s of cfg.suites || []) {
    if (!(s.engines || ENGINES).includes(engine) || !want(s)) continue;
    if (only && !s.name.includes(only)) continue;
    jobs.push({ label: `${s.name} ${engine}`, cmd: [process.execPath, s.file, engine], lane: engine });
  }
});

const countsFile = path.join(DIR, 'counts.json');
const COUNTS = !args.includes('--reset-counts') && fs.existsSync(countsFile) ? JSON.parse(fs.readFileSync(countsFile, 'utf8')) : {};
const logName = job => job.label.replace(/\W+/g, '-');

/* Runs one job and resolves with its result (the whole output, failing lines, number of PASS lines, seconds). */
const run = job => new Promise(done => {
  const t = Date.now();
  let out = '';
  const kid = spawn(job.cmd[0], job.cmd.slice(1), { cwd: DIR, env: { ...process.env, FORCE_COLOR: '0', ...(cfg.env || {}) } });
  const limit = (cfg.timeoutMin || 20) * 60000;
  const timer = setTimeout(() => { out += `\nSTOPPED: took longer than ${cfg.timeoutMin || 20} minutes`; kid.kill('SIGKILL'); }, limit);
  kid.stdout.on('data', d => { out += d; });
  kid.stderr.on('data', d => { out += d; });
  kid.on('error', e => { out += `\nSCRIPT ERROR could not start: ${e.message}`; });
  kid.on('close', code => {
    clearTimeout(timer);
    const fails = failLines(out);
    const passes = passCount(out);
    const had = COUNTS[job.label]; /* fewer checks than the last all-green full run means some were skipped, which is a failure too */
    if (had && passes < had) fails.push(`only ${passes} checks ran; the last all-green run had ${had} (--reset-counts accepts a smaller number on purpose)`);
    done({ ok: code === 0 && !fails.length, out, fails, passes, sec: (Date.now() - t) / 1000 });
  });
});

const rows = [];
let bad = 0;
const T0 = Date.now();

/* One lane per engine, side by side; inside a lane the suites run one after another so the printed lines stay in order.
   Without a second engine (every tier but "full") the single lane is split in two when the machine has two cores or more. */
const lanes = {};
for (const job of jobs) (lanes[job.lane] = lanes[job.lane] || []).push(job);
const first = lanes[ENGINES[0]];
if (first && Object.keys(lanes).length === 1 && first.length > 3 && os.cpus().length > 1) {
  lanes[ENGINES[0]] = first.filter((_, i) => i % 2 === 0);
  lanes[ENGINES[0] + '#2'] = first.filter((_, i) => i % 2 === 1);
}

const report = (job, mark, r) => {
  fs.writeFileSync(path.join(LOGS, logName(job) + '.log'), r.out);
  rows.push({ mark, sec: r.sec, label: job.label, passes: r.passes });
  console.log(`${mark.padEnd(5)} ${r.sec.toFixed(1).padStart(6)} s  ${job.label}`);
  if (verbose) console.log(r.out.split('\n').map(l => '        ' + l).join('\n'));
  if (mark === 'FAIL') console.log(r.fails.slice(0, 8).map(l => '        ' + l.slice(0, 200)).join('\n') + `\n        (full output: ${path.relative(process.cwd(), path.join(LOGS, logName(job) + '.log'))})`);
};

const runLane = async list => {
  for (const job of list) {
    let r = await run(job);
    let mark = 'pass';
    if (!r.ok) {
      fs.writeFileSync(path.join(LOGS, logName(job) + '.first-try.log'), r.out); /* kept, so a flaky pass* can be looked into */
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
  if (tier === 'smart') console.log('changed since the last all-green run:', changed.join(', ') || 'nothing');
  await Promise.all(Object.values(lanes).map(runLane));
  const slow = rows.slice().sort((a, b) => b.sec - a.sec).slice(0, 3).map(r => `${r.label} ${r.sec.toFixed(0)} s`).join(', ');
  const n = m => rows.filter(r => r.mark === m).length;
  console.log(`\n${tier}: ${rows.length} suites, ${n('pass')} pass, ${n('pass*')} pass* (flaky), ${bad} FAIL, ${((Date.now() - T0) / 1000).toFixed(0)} s in all. Slowest: ${slow}`);
  if (!bad && tier === 'full' && !only) { /* the check counts of this all-green full run are what later runs are held to */
    const counts = {};
    rows.forEach(r => { if (r.passes) counts[r.label] = r.passes; });
    fs.writeFileSync(countsFile, JSON.stringify(counts, null, 1));
  }
  if (!bad && tier !== 'quick' && !only) fs.writeFileSync(stampFile, new Date().toISOString());
  process.exit(bad ? 1 : 0);
})();
