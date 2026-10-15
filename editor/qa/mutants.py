#!/usr/bin/env python3
"""Does the contract test notice a deliberate bug in the game rules?  (Copyright (c) 2026 LFC Foundry. MIT License)

Puts one small bug at a time into a COPY of core.js, runs contract.mjs on the copy, and reports whether it failed (caught) or passed (survived).
Nothing in the real editor folder is changed. A "survived" line is either an equivalent change (the game behaves the same) or a gap in
the contract test. Needs esbuild reachable from the editor folder (node_modules at the repo root, or NODE_PATH).

    python3 editor/qa/mutants.py          (about 20 seconds; the one bug that never lets the play-out finish takes about 7)

Last result, 2026-10-14: 12 of 14 caught; the 2 survivors are equivalent changes (see MUTANTS below).
"""
import os, shutil, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
ED = os.path.dirname(HERE)
# (name, exact text in core.js, replacement, True if the change does not alter how the game behaves)
MUTANTS = [
 ("klHas: number test >= to >", "return (flags[`v:${id.slice(2, j)}`] || 0) >= +id.slice(j + 1);", "return (flags[`v:${id.slice(2, j)}`] || 0) > +id.slice(j + 1);", False),
 ("klHas: plain item test inverted", "return !!flags[id];\n}", "return !flags[id];\n}", False),
 ("klCondOk: ignores 'forbid'", "for (i = 0; i < f.length; i++) if (klHas(flags, f[i])) return false;", "", False),
 ("klVisibleBlocks: 'otherwise' chain never closes", "      show = ok;\n      chainDone = ok;\n", "      show = ok;\n      chainDone = false;\n", False),
 ("klAdd: no upper limit on a number", "v = Math.max(b[0], Math.min(b[1], v));", "v = Math.max(b[0], v);", False),
 ("klChoose: a choice never takes items", "for (i = 0; i < t.length; i++) delete next[t[i]];\n  if (c.adds)", "if (c.adds)", False),
 ("klArrive: hand-over not recorded", "next[`m:${id}:${to}`] = true;", "", False),
 ("klArrive: page's number changes skipped", "if (p.adds) klAdd(next, p.adds, st);\n  return next;\n}\n\n/**\n * The page choice", "return next;\n}\n\n/**\n * The page choice", False),
 ("klTarget: dice must beat the target, not reach it", ">= k.target ? c.to", "> k.target ? c.to", False),
 ("klOdds: 100% from need <= 1 (same answer at 2)", "if (need <= 2) return 100;", "if (need <= 1) return 100;", True),
 ("klShown: locked choices not shown", "filter(c => c.lock || klCondOk(c, flags))", "filter(c => klCondOk(c, flags))", False),
 ("klInit: starting values ignored", "if (st[id][2]) flags[`v:${id}`] = st[id][2];", "", False),
 ("klStatMap: default top limit 10 to 9 (the loader always fills it)", "i.hi === undefined ? 10 : i.hi", "i.hi === undefined ? 9 : i.hi", True),
 ("klChoose: gives keep the old 'where it went' record", "for (k in next) if (k.indexOf(`m:${g[i]}:`) === 0) delete next[k];", "", False),
]

def main():
    src = open(os.path.join(ED, "core.js"), encoding="utf8").read()
    tmp = tempfile.mkdtemp(prefix="mutants-")
    for f in os.listdir(ED):  # the sources and styles the contract test reads (not the built pages)
        if f.endswith((".js", ".mjs", ".css", ".json")) and os.path.isfile(os.path.join(ED, f)):
            shutil.copy(os.path.join(ED, f), tmp)
    env = dict(os.environ, CONTRACT_TIMEOUT_S="20")
    if "NODE_PATH" not in env:
        env["NODE_PATH"] = os.path.join(os.path.dirname(ED), "node_modules")
    os.symlink(os.path.join(os.path.dirname(ED), "node_modules"), os.path.join(tmp, "node_modules"))
    caught = survived_real = ran = 0
    try:
        # the unchanged rules must pass first, or every "caught" below would only mean the copy is broken
        open(os.path.join(tmp, "core.js"), "w", encoding="utf8").write(src)
        base = subprocess.run(["node", "contract.mjs"], cwd=tmp, capture_output=True, text=True, env=env, timeout=60)
        if base.returncode != 0:
            print("The unchanged copy fails the contract test, so nothing below could be trusted:\n" + (base.stdout + base.stderr)[:600]); return 2
        for name, a, b, equivalent in MUTANTS:
            if src.count(a) != 1:
                print("SKIP (text found %d times, the rule was probably rewritten): %s" % (src.count(a), name)); continue
            open(os.path.join(tmp, "core.js"), "w", encoding="utf8").write(src.replace(a, b))
            t = time.time(); ran += 1
            r = subprocess.run(["node", "contract.mjs"], cwd=tmp, capture_output=True, text=True, env=env, timeout=60)
            ok = r.returncode != 0
            caught += ok
            if not ok and not equivalent: survived_real += 1
            print("%s | %-66s | %4.1fs" % ("caught  " if ok else ("survived (equivalent)" if equivalent else "SURVIVED"), name, time.time() - t), flush=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("caught %d of %d; %d real gap(s)" % (caught, ran, survived_real))
    return 1 if survived_real else 0

if __name__ == "__main__":
    sys.exit(main())
