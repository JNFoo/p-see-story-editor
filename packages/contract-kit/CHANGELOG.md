# contract-kit changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers.

## 1.0.0 · 2026-10-17
**New:** a written guide, plus a helper of 101 lines, for keeping two versions of the same rules from drifting apart. The helper has five tools: repeatable random numbers (`seeded`), a side-by-side comparison on hundreds of random inputs that reports the first difference with the seed to replay it (`agree`), a recorder of which fields were read (`watchReads`), a check that every field is classified and every rule field is read (`checkFieldTable`), and a time limit for a check that never finishes (`guarded`). The Story Editor's own test of this kind plays 400 random stories in about 2 seconds.

**Tested in:** Node 22.22.0 package tests, no browser.
