/* contract-kit guarded: run a check script in a child process that is stopped after a time limit. Node only.
   Copyright (c) 2026 LFC Foundry. MIT License. */
import { spawnSync } from 'node:child_process';

/**
 * Runs `node file ...args` in a child process and stops it after `seconds` (killed outright, so a script that ignores polite stop requests cannot hang the build).
 * Returns { ok, timedOut, status, signal }. Use it around a check that explores every situation: a rule that never lets the play-out finish then fails with a message instead of hanging.
 * Programs the child started itself are not stopped.
 */
export function guarded(file, args = [], seconds = 90) {
  const r = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit', timeout: seconds * 1000, killSignal: 'SIGKILL' });
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  return { ok: !timedOut && r.status === 0, timedOut, status: r.status, signal: r.signal };
}
