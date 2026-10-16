# Story Editor

Write interactive "choose your own path" stories without touching code. Add pages and choices, let the editor check that every path
works, see your story as a map, and turn each story into one small game file that anyone can play in a browser, online or offline.

**Open the editor:** https://jnfoo.github.io/p-see-story-editor/
(or download `index.html` from this page and double-click it; nothing needs installing).

MIT License · Copyright (c) 2026 LFC Foundry (see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md)). This is a beta.

## Code you can reuse

Everything is MIT-licensed and has no dependencies. The editor's logic was cut out into small packages, **generated from the editor's own sources** (so there is one copy to maintain, and a test fails if they drift apart). Each folder has a README (what it does, how it differs from what already exists, its limits), an `AGENTS.md` for AI helpers, TypeScript types, an example you can run, and tests that require **identical answers to the editor** on hundreds of random stories.

| Package | One line |
|---|---|
| [story-format](packages/story-format/README.md) | The data model for branching stories as plain JSON, with a JSON Schema, a safe sanitizer for any input, a plain-text story syntax, find/replace, Markdown manuscript. |
| [story-check](packages/story-check/README.md) | An exact checker: explores every combination of items, numbers and dice to find dead ends and endings no player can reach, and says why. |
| [story-player](packages/story-player/README.md) | One story in, one small offline HTML game out; plus a "play it from code" session and a terminal player. |
| [story-map](packages/story-map/README.md) | Layered, arc, matrix and shape drawings of a story graph, choke points, simulated players, drawing metrics, SVG output. |
| [zip-page](packages/zip-page/README.md) | Shrinks one HTML page into a self-unzipping page, with a small readable inflater as fallback. |
| [qa-kit](packages/qa-kit/README.md) | A tiered test runner and a Playwright-style call surface over Puppeteer's WebDriver BiDi, so suites also run on stock Firefox; a seeded random-story generator. |
| [ai-collab-kit](packages/ai-collab-kit/README.md) | A written process for a person and an AI assistant building software together: ten habits, test and speed recipes, pitfalls, templates. |
| [editor/](editor/README.md) | The full editor sources, its build, and its browser test suites ([editor/qa](editor/qa/README.md)). |

Only pieces that are not already well covered by open source were split out; each README names the closest existing projects and says honestly how this one differs. Small pieces for browser games (curtains, saves, frame pacing and more) live in the sibling repository [JS-modules](https://github.com/lfcfoundry/JS-modules).

## Build and test from source

```
npm install                 # esbuild and prettier, for the package build
npm run build               # regenerate packages/*/src/generated.js and dist/ from editor/*.js
npm test                    # packages up to date, README samples, every package's tests, the editor's contract test (no browser needed)
npm run editor              # build the editor: editor/story-editor.html (needs Python 3 and one npm install)
```

The browser suites (Firefox and Chromium) are in `editor/qa`; see its README. For people and AI helpers: [AGENTS.md](AGENTS.md), [llms.txt](llms.txt), [CONTRIBUTING.md](CONTRIBUTING.md). History and measurements: [docs/](docs/README.md).

## Your stories stay yours

- The editor works offline and sends nothing anywhere. Your stories are kept in your own browser as you type.
- **Save** (Ctrl+S) also writes a `.story.json` file you can keep, back up or move to another device, and **Open** brings it back.
  In Chrome and Edge, Save writes straight back to the same file; Firefox and Safari download a copy each time.
- If the latest autosave can't be read, the editor opens the spare copy it keeps and tells you.

## The quick tour

The first time you open the editor it offers a short spotlight tour of the main areas; replay it any time from **Options → Take the tour**.

1. **Write:** add a page, type its text, add choices and point each choice at another page. Mark a page as an ending (good, bad or neutral).
   Press **Ctrl+K** to jump to any page by typing part of its name; the same type-to-find box picks where a choice leads. ‹ › step back and forward,
   the panel buttons hide the side lists, click an item to give it, paste a scene with `-` lines as choices, and Ctrl+Shift+Enter splits a page at the cursor. Drag the ⋮⋮ grip to reorder choices and paragraphs. The first page can never be an ending.
2. **Check:** the Check tab tells you about pages nobody can reach, choices that lead nowhere, endings players can't get to, and traps.
3. **Map:** see the whole story as a picture. Several views, from a plain flow to a bird's-eye "story shape". Click a page to open it.
4. **Items:** objects and states players can get or lose, numbers (with bars), dice skill checks, and locked choices. Turn on
   **Options → Advanced** to show more tools.
5. **Play:** try the story right inside the editor, or start from any page with "Test from here".
6. **Share:** **Export game** makes one small HTML file (about 25-50 KB for a typical story). Send it to anyone; it opens in any
   modern browser, online or off. **Options → Quick guide** inside the editor explains each part in plain words.

## Handy while writing

- **Find and replace** (Ctrl+Shift+F, or **Find...** above the page list) searches every page name, heading, paragraph and choice.
- **Unfinished flag:** the bookmark button on a page marks it as unfinished; the Check tab lists them.
- **Why can't players reach this page?** is in a page's ... menu, and the Check tab lists pages no simulated player reached.
- **Game tab:** turn on **Options, Advanced, Game** and a Game tab appears between Check and Play. It holds the options for your exported
  games and a live preview of your own story; hover over or arrow through the colors to try each one.
- **Save manuscript (.md)** in the File menu writes all the words of your story as one text file for proofreading.

## What players of your game get

Saves their place automatically, a Back button (if you turn it on), a reader comfort button (Aa) for text size, spacing and colors,
an "endings found" count, and optional place codes to continue on another device. Games are accessible to screen readers and work on
phones, tablets and computers.

## Works in

Current Firefox, Chrome, Edge and Safari on computers, Android and iPhone/iPad. Exported games work in somewhat older browsers than the
editor does (roughly Chrome/Edge 80, Firefox 74, iOS 13.4 for games; Chrome/Edge 98, Firefox 98, iOS 15.4 for the editor).

## Fonts

The Inter Tight typeface is used under the SIL Open Font License (it is not covered by the MIT License; see NOTICE.md).

## More from LFC Foundry

- [Apple Press](https://github.com/JNFoo/apple-press): a clicker game for kids ([play](https://jnfoo.github.io/apple-press/))
- [Fancy, the Banana](https://github.com/JNFoo/fancy-banana): a one-tap flying-banana arcade game ([play](https://jnfoo.github.io/fancy-banana/))
- [Pineapple Defense](https://github.com/JNFoo/pineapple-defense): a flick-to-throw pineapples-at-penguins game ([play](https://jnfoo.github.io/pineapple-defense/))
- [JS-modules](https://github.com/lfcfoundry/JS-modules): small dependency-free pieces for single-file browser games ([demos](https://lfcfoundry.github.io/JS-modules/))
