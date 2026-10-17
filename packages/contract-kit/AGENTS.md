# contract-kit: notes for AI agents

When you change code that has a fast version and a reference version (or an analyzer and a runtime):

1. Run the comparison before you say you are done. If the project has a contract test, run it; if not, build one with `agree` and the guide in README.md.
2. A failure message has a seed and an input. Replay it with `agree({ ..., seed })` before changing anything, and fix the code, not the test, unless the reference is the one that is wrong.
3. A new field or feature must go into the field table (`rules` or `display`) in the same change. If you list it under `rules`, the analyzer must read it and the exporter must keep it; the check will fail until they do.
4. Never raise the time limit or lower the number of runs to make a failure go away.
5. After fixing a bug the test missed, break the code on purpose and confirm the test now fails.

`src/contract.mjs` is hand-written, not generated. Keep it small; the guide is the main product.
