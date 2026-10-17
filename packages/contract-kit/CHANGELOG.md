# contract-kit changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers.

## 1.1.0 · 2026-10-17
**Fixed (tests that passed when they should have failed):**
- Two async functions that disagreed on every one of 20 runs used to pass. A promise answer is now a difference, and the new `agreeAsync` compares what the promises say.
- A function that threw an error with an empty message, or threw a plain string, could look like it had returned nothing and pass; throwing `null` crashed the comparison. Every kind of throw is now a difference.
- `rnd()` could in theory return exactly 1, which made `int(1, 6)` give 7 and `pick` give nothing. It now stays below 1. In 10,000,000 draws of `int(0, 99)` across five seeds, 0 numbers changed against the old version, so saved seeds still replay.
- `watchReads` gave a new stand-in on every read, so `page === page` was false and a Set of pages never matched. It now gives the same stand-in for the same page. It also no longer crashes on frozen (read-only) data, counts `field in obj` and `hasOwnProperty` as reads, and no longer records borrowed methods such as `hasOwnProperty` as fields.
- `checkFieldTable` crashed when a kind had no `display` list; it now accepts that, and reports a field listed under both `rules` and `display`.
- `guarded` now kills a script outright after the limit, so one that ignores polite stop requests cannot hang the build; it also reports the stop `signal`.
- Found by running it in a browser: the default copier broke in Chromium 155 ("Illegal invocation") while working in Node. Fixed; a package test now guards it.

**New:**
- `shrink: true` on `agree` cuts a failing input down to the smallest one that still fails in the same way. On a planted bug in the Story Editor's checker, a failing story of 4,096 bytes, 9 pages and 10 choices became 685 bytes, 1 page and 3 choices in 126 tries, which added 27 ms (14 ms to 41 ms). `shrink` and `shrinkAsync` also work on their own.
- `agreeAsync`: the same comparison for functions that return promises.
- `tags` and `expect`: name the features the random inputs have, get a count of each, and fail the run when an expected feature never appeared, so a generator cannot quietly miss one.
- `seconds` stops a run early when time is up; `errors: 'compare'` lets two throws with the same message count as agreeing.
- `checkKept` finds a rules field that an exporter or copier dropped or changed (the guide described this check, but the helper did not have it).
- `deepEqual` replaces `node:util`'s comparison as the default. It was checked against `node:util` on 25,000 random nested values (Map, Set, Date, RegExp, Error, typed arrays, NaN, 0 and -0) with 0 differences, and two promises are never equal.
- The core works in browsers, Deno and Bun: import `contract-kit/core`, which has no Node imports (only `guarded` needs Node). It gives the same answers in Firefox, Chromium and WebKitGTK as in Node on a fixed set of checks.

**Faster:** `clone: false` skips the copy of each input for functions that do not change their input. For 200 runs of the Story Editor's checker on both sides (stories of about 3 KB), 126 ms went down to 72 ms, about 1.7 times faster; with trivial functions the copying was nearly all of the time and 32 ms went down to 0.2 ms. Default behavior is unchanged.

**Slower and bigger, plainly:** walking a story through `watchReads` takes about 59 ms per 2,000 walks against 47 ms before (about 26% more), the price of the stable stand-ins. The code grew from 101 to 308 lines. Minified, the whole helper went from 1.9 KB (1.0 KB gzipped) to 7.2 KB (2.9 KB gzipped); using only `seeded` and `agree` in a bundle went from about 0.6 KB to 3.8 KB (1.8 KB gzipped), because `agree` now carries the comparison and the cutting-down.

**Tested in:** Node 22.22.0 package tests (22 tests, all pass, about 3 seconds). The core, bundled into one script, returned the same answer as Node on a fixed set of checks in Firefox 158.0 (21 s including start), ungoogled Chromium 155.0.8059.39-1 (0.8 s) and WebKitGTK 2.52.6 (7.8 s through WebDriver), run one at a time. GNOME Web 46.5 not run.

## 1.0.0 · 2026-10-17
**New:** a written guide, plus a helper of 101 lines, for keeping two versions of the same rules from drifting apart. The helper has five tools: repeatable random numbers (`seeded`), a side-by-side comparison on hundreds of random inputs that reports the first difference with the seed to replay it (`agree`), a recorder of which fields were read (`watchReads`), a check that every field is classified and every rule field is read (`checkFieldTable`), and a time limit for a check that never finishes (`guarded`). The Story Editor's own test of this kind plays 400 random stories in about 2 seconds.

**Tested in:** Node 22.22.0 package tests, no browser.
