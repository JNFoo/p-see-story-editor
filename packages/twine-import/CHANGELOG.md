# twine-import changelog

What changed in each version, newest first, in plain words. Each entry says what is new or how much better it got, with numbers where there are numbers.

## 1.0.0 · 2026-10-17
**New:** a package that reads a Twine story and turns it into a story for this format. It opens Twine 2 pages and library archives, Twee 3 files and Twine 1 pages, and it turns SugarCube and Harlowe code (flags, numbers, if/else) into real rules, so a converted story keeps its logic, not only its links. It lists in plain words everything it could not carry over, and it never invents an author. The `twine-to-story` command comes with it (read a file, write a story file, list or pick one story from an archive).

**Size:** 53.5 KB minified, 20.6 KB gzipped. It used to travel inside story-format; moving it out is what makes story-format smaller (see its changelog).

**Tested in:** Node 22.22.0 package tests, no browser. (The editor is unchanged by this package; the same pull request's editor build ran on Firefox 157.0.1, quick tier 28 of 28.)
