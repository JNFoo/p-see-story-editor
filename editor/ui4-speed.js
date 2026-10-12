/* ---------------------------------------------------------------------------
   3d2. Speed report ("It stuttered!")
   ---------------------------------------------------------------------------
   Smoothness can only be judged on the device and browser the editor runs on: a test machine cannot see how a screen
   paints on yours. This part lets you do the judging and send back numbers.

   Also lists the last few errors the editor noted (errorLog in ui1-state.js: where, what it said, which functions it was in).
   Always on (costs almost nothing): how long each tab switch, each run of the checker and each map zoom took, kept as a short
   list in memory. Never written anywhere, never sent anywhere, and no story text is in it.
   On request (Options -> Speed report, or add #report to the address): a frame recorder. It notes the time between screen
   updates; a gap over about 34 ms is a visible hitch (a smooth screen updates every 17 ms at 60 Hz). While it records, a small
   bar offers "It stuttered!" (marks that moment with the recent frame times) and "Stop".
   "Copy report" puts a plain-text summary on the clipboard to paste back into the chat.
   --------------------------------------------------------------------------- */

const SPEED_KEEP = 400; // timings kept
const SPEED_HITCH = 34; // a frame gap over this many ms is a hitch
const SPEED_STALL = 100; // and over this many, a stall
const speedLog = []; // { at: ms since the page opened, kind, ms, note }
const speedMarks = []; // moments you pressed "It stuttered!"
const speedFrame = { on: false, raf: 0, last: 0, since: 0, n: 0, sum: 0, worst: 0, hitches: 0, stalls: 0, recent: [] };
let speedBar = null;
let speedLongTasks = null;

/** Records that something called `kind` took `ms`, with a short note (the view, the size). */
function speedNote(kind, ms, note) {
  speedLog.push({ at: Math.round(performance.now()), kind, ms: Math.round(ms * 10) / 10, note: note || '' });
  if (speedLog.length > SPEED_KEEP) speedLog.shift();
}
/** Runs `fn`, records how long it took under `kind`, and returns what it returned. `note` may be text or a function giving text. */
function speedTime(kind, fn, note) {
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    speedNote(kind, performance.now() - t0, typeof note === 'function' ? note() : note);
  }
}
/** Records how long it took from `t0` until the screen was next drawn (measured after the next frame). */
function speedPaint(kind, t0, note) {
  requestAnimationFrame(() => {
    setTimeout(() => speedNote(kind, performance.now() - t0, note), 0);
  });
}

/* ----- the frame recorder ----- */

function speedTick(ts) {
  const f = speedFrame;
  if (!f.on) return;
  if (f.last) {
    const g = ts - f.last;
    f.n++;
    f.sum += g;
    if (g > f.worst) f.worst = g;
    if (g > SPEED_HITCH) f.hitches++;
    if (g > SPEED_STALL) f.stalls++;
    f.recent.push(Math.round(g));
    if (f.recent.length > 90) f.recent.shift();
  }
  f.last = ts;
  f.raf = requestAnimationFrame(speedTick);
}
function speedStart() {
  const f = speedFrame;
  if (f.on) return;
  Object.assign(f, { on: true, last: 0, since: performance.now(), n: 0, sum: 0, worst: 0, hitches: 0, stalls: 0, recent: [] });
  speedMarks.length = 0;
  f.raf = requestAnimationFrame(speedTick);
  /* Chromium can also say which stretches of script ran long; Firefox cannot, so the frame gaps are the common measure */
  try {
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      speedLongTasks = new PerformanceObserver(list =>
        list.getEntries().forEach(e => speedNote('long task', e.duration, `started at ${Math.round(e.startTime)} ms`))
      );
      speedLongTasks.observe({ type: 'longtask' });
    }
  } catch {
    speedLongTasks = null;
  }
  speedShowBar();
}
function speedStop() {
  const f = speedFrame;
  f.on = false;
  cancelAnimationFrame(f.raf);
  speedLongTasks?.disconnect();
  speedLongTasks = null;
  speedBar?.remove();
  speedBar = null;
}
/** The small bar shown while recording. */
function speedShowBar() {
  speedBar?.remove();
  speedBar = h('div', { id: 'speedbar', role: 'region', 'aria-label': 'Speed recording' }, [
    h('span', { text: 'Recording' }),
    h('button', { class: 'btn small primary', type: 'button', text: 'It stuttered!', onclick: speedMark }),
    h('button', { class: 'btn small', type: 'button', text: 'Stop', onclick: () => (speedStop(), showSpeedReport()) })
  ]);
  document.body.appendChild(speedBar);
}
/** "It stuttered!": keeps the last frame times and the latest timings, with where you were. */
function speedMark() {
  const f = speedFrame;
  const now = performance.now();
  const rec = f.recent.slice(-60);
  speedMarks.push({
    at: Math.round(now - f.since),
    view,
    worst: rec.length ? Math.max(...rec) : 0,
    hitches: rec.filter(g => g > SPEED_HITCH).length,
    frames: rec.length,
    events: speedLog.filter(e => e.at > now - 3000).map(e => `${e.kind} ${e.ms} ms${e.note ? ` (${e.note})` : ''}`)
  });
  toast(`Marked (${speedMarks.length}). Keep going, then press Stop.`);
}

/* ----- the report ----- */

const speedPct = (list, p) => {
  const a = list.slice().sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
};
/** The report as plain text. */
function speedReportText() {
  const L = [];
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = {};
  performance.getEntriesByType('paint').forEach(e => (paint[e.name] = Math.round(e.startTime)));
  L.push('Story Editor speed report', `Version: ${BUILT}`, `Browser: ${navigator.userAgent}`);
  L.push(
    `Screen: ${screen.width}x${screen.height} at ${window.devicePixelRatio}x; window ${innerWidth}x${innerHeight}; ` +
      `cores ${navigator.hardwareConcurrency || '?'}; memory ${navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '?'}; ` +
      `reduced motion ${matchMedia('(prefers-reduced-motion: reduce)').matches ? 'on' : 'off'}; theme ${document.documentElement.dataset.theme || 'light'}`
  );
  const choices = project.passages.reduce((n, p) => n + p.choices.length, 0);
  L.push(`Story: ${project.passages.length} pages, ${choices} choices, ${project.items.length} items; tab ${view}`);
  L.push(
    `Start-up: DOM ready ${nav ? Math.round(nav.domContentLoadedEventEnd) : '?'} ms, first paint ${paint['first-paint'] ?? '?'} ms, ` +
      `first content ${paint['first-contentful-paint'] ?? '?'} ms, loaded ${nav ? Math.round(nav.loadEventEnd) : '?'} ms`
  );
  const f = speedFrame;
  if (f.n) {
    L.push(
      '',
      `Frames while recording (${f.on ? 'still recording' : 'stopped'}): ${f.n} frames over ${((performance.now() - f.since) / 1000).toFixed(1)} s; ` +
        `average gap ${(f.sum / f.n).toFixed(1)} ms; worst ${Math.round(f.worst)} ms; over ${SPEED_HITCH} ms: ${f.hitches}; over ${SPEED_STALL} ms: ${f.stalls}`
    );
  } else L.push('', 'No frames recorded (press Start recording, use the editor, then Stop).');
  if (speedMarks.length) {
    L.push('', `You marked ${speedMarks.length} stutter${speedMarks.length === 1 ? '' : 's'}:`);
    speedMarks.forEach((m, i) => {
      L.push(
        `  ${i + 1}. at ${(m.at / 1000).toFixed(1)} s on the ${m.view} tab: worst frame ${m.worst} ms, ${m.hitches} of the last ${m.frames} frames over ${SPEED_HITCH} ms` +
          (m.events.length ? `; just before: ${m.events.join('; ')}` : '')
      );
    });
  }
  L.push('', errorLog.length ? `Recent errors (last ${ERROR_KEEP}):` : 'No errors since the page opened.');
  errorLog.forEach(e => L.push(`  ${(e.at / 1000).toFixed(1)} s  ${e.where}: ${e.msg}${e.frames.length ? `  [in ${e.frames.join(' < ')}]` : ''}`));
  const kinds = [...new Set(speedLog.map(e => e.kind))];
  if (kinds.length) {
    L.push('', 'Timings (count, median, 95th percentile, worst; milliseconds):');
    kinds.forEach(k => {
      const ms = speedLog.filter(e => e.kind === k).map(e => e.ms);
      L.push(`  ${k}: ${ms.length}, ${speedPct(ms, 0.5)}, ${speedPct(ms, 0.95)}, ${Math.max(...ms)}`);
    });
    L.push('', 'Latest events:');
    speedLog.slice(-20).forEach(e => L.push(`  ${(e.at / 1000).toFixed(1)} s  ${e.kind}  ${e.ms} ms${e.note ? `  (${e.note})` : ''}`));
  }
  return L.join('\n');
}
/** Options -> Speed report: how to use it, the report so far, and the buttons. */
function showSpeedReport() {
  dialog((d, close) => {
    d.appendChild(h('h3', { text: 'Speed report' }));
    d.appendChild(
      h('div', {
        class: 'hint',
        text:
          'For when something feels slow or choppy. Press Start recording, use the editor the way that stutters (zoom the map, switch tabs), ' +
          'press “It stuttered!” each time it happens, then Stop. Copy the report and paste it into the chat. It holds timings and your device’s details, never your story’s words, and nothing is sent anywhere.'
      })
    );
    const ta = h('textarea', { class: 'in mono', readonly: true, rows: 14, 'aria-label': 'Speed report', value: speedReportText() });
    d.appendChild(ta);
    d.appendChild(
      h('div', { class: 'row end' }, [
        h('button', {
          class: 'btn',
          type: 'button',
          text: speedFrame.on ? 'Keep recording' : 'Start recording',
          onclick: () => {
            close();
            speedStart();
          }
        }),
        h('button', { class: 'btn primary', type: 'button', text: 'Copy report', onclick: () => copyText(ta.value, ta) }),
        h('button', { class: 'btn', type: 'button', text: 'Close', onclick: close })
      ])
    );
  });
}
