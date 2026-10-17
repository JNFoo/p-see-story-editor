# Notices

**Story Editor and the packages in this repository**: Copyright (c) 2026 LFC Foundry, MIT License (see [LICENSE](LICENSE)). The software is forged by LFC Foundry (https://github.com/lfcfoundry).

**Branding notice.** While the code is open under the MIT License, the name "LFC Foundry" and associated project identities are reserved. If you fork, significantly modify, or commercially redistribute this software, you must change the external public product name and branding.

**Exported games.** Every game exported from the editor starts with the same header comment. It covers the game program (the player code); the story's words and art belong to the story's author.

**Provenance.** The code was written for the Story Editor by JNFoo with AI assistance (Claude, by Anthropic). The packages under `packages/` are cut from the editor's own sources by `tools/extract-packages.mjs`; they contain no third-party source code.

**Font.** The Inter Tight typeface in `editor/fonts/` is © 2016 The Inter Project Authors (https://github.com/rsms/inter), used under the SIL Open Font License 1.1 (text in `editor/fonts/InterTight-OFL.txt`). The font files are not covered by the MIT License; they keep the OFL. The built editor (`index.html`) and games exported with the font embedded carry subsets of it.

**Sample story.** `editor/keepers-light.project.json` ("The Keeper's Light") is an original story by JNFoo that ships as the editor's built-in example. It is included under the same MIT License as the code, and is used by the tests as a sample.

**Not included.** Tools you install yourself keep their own licenses and are not part of this repository: esbuild and Prettier (build and format), Zopfli (optional, smaller output), Puppeteer, Playwright and a browser (the test suites).

**Twine, its story formats and the import feature.** File → Import Twine… and `importTwine` read the *file formats* of Twine (Twine 2 HTML, Twee 3 text, Twine 1 HTML). They contain **no source code, text or data copied from Twine or any story format**; the readers were written from the formats' behavior, and the test files in `editor/qa/fixtures/twine/` and `packages/twine-import/test/fixtures/` are original, written for these tests. A game exported from this editor contains only this project's code, not Twine's.

Licenses of the projects involved, as stated on their own pages when checked on 2026-10-14 (a project's license applies to *its* code; it does not decide who owns a story written with it):

| Project | License stated | Where read | Notes |
|---|---|---|---|
| Twine 2 (klembot/twinejs) | GPL-3.0 | https://github.com/klembot/twinejs (license link); https://blog.iftechfoundation.org/2019-10-10-twine-trademark.html | "Twine" is a registered trademark of the Interactive Fiction Technology Foundation. Saying a story was made with Twine, or that this editor imports Twine files, is descriptive use. This project is not Twine and is not made or endorsed by Twine or IFTF. |
| Twine 1 | GPL v3 per the Twine wiki page (Chris Klimas's 2015 post says GPLv2: the two sources disagree); Copyright Chris Klimas and other contributors; its published stories embed a TiddlyWiki-based runtime under the New BSD license, plus bundled MIT, WTFPL and Apache-2.0 parts | https://unbox.ifarchive.org/01tgumzr75/twinery-wiki-pages/twine1/license_information.txt | That page states no license for the story text a person writes. |
| SugarCube 2 (tmedwards/sugarcube-2) | BSD-2-Clause | https://github.com/tmedwards/sugarcube-2 | Copyright holder not shown on the page I read. A note supplied by the owner says Artistic License 2.0; the repository's own license link says BSD-2-Clause, which is what is recorded. Older releases may differ. |
| Chapbook (klembot/chapbook) | MIT | https://github.com/klembot/chapbook | Page credits Chris Klimas; copyright line not shown on the page I read. |
| Snowman (videlais/snowman) | MIT, "Copyright (c) 2019 Chris Klimas, 2022 Dan Cox" | https://github.com/videlais/snowman/blob/main/LICENSE | |
| Tweego (tmedwards/tweego) | BSD 2-Clause "Simplified", "Copyright (c) 2014-2020, Thomas Michael Edwards" | https://github.com/tmedwards/tweego/blob/master/LICENSE | Not used by this project; named in documentation only. A note supplied by the owner says MIT; the LICENSE file read says BSD 2-Clause, which is what is recorded. |
| Harlowe | **MIT, reported but not read from Harlowe's own repository.** The owner's research (secondary sources: Wikipedia, the Twine site, a Reddit thread) says MIT; Chris Klimas's 2015 post (https://chrisklimas.com/blog/2015-12-19-twine-is-free-software) says the formats use permissive licenses that mostly require credit. Harlowe's repository host (foss.heptapod.net) blocked automated access, so the exact notice was not seen. | https://chrisklimas.com/blog/2015-12-19-twine-is-free-software | Nothing from Harlowe is used; only the syntax of Harlowe code in a story is read. Confirm against Harlowe's own LICENSE before relying on this. |
| Twine specifications and Twee 3 spec (iftechfoundation/twine-specs) | **None stated** on the repository page or in the Twee 3 document I read (a note supplied by the owner calls it public domain; I could not find that stated) | https://github.com/iftechfoundation/twine-specs | No spec text is copied into this project. |
| esbuild, Prettier | MIT (read from the installed packages) | `node_modules/*/package.json` | Build and format tools only; not shipped. |

**Authorship of imported stories.** A Twine story belongs to whoever wrote it (Twine's author states that works made with Twine are not governed by the GPL; a Reddit comment the owner passed along, which I could not open myself, says the same about selling games made with Twine). None of this removes the need for permission to use someone else's story. The importer copies the author named in the Twine file (its `StoryAuthor` page) word for word and never replaces it, shortens it, or adds the name of this project, its owner or any AI helper. If the file names no author the Author box stays empty and the import report says so. Converting a story does not change who wrote it and does not grant anyone a license to it: editing, converting for publication or republishing a story that is not yours needs its author's permission (or a license they have given). The code of this project is MIT; that license covers this project's code, not the stories people bring to it.
