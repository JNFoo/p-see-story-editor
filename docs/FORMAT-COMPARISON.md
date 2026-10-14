# Story formats and their editors compared

Written 2026-10-14. Each cell comes from the project's own documentation pages (listed at the end) or from this repository. A dash (—) means "not on the pages I read", not "it cannot do this". This is a comparison of design, not a benchmark, and the other tools do much that this one does not.

The comparison covers five formats, each with the editor people most often write it in. For ChoiceScript there is no official editor, and I could not confirm which of the unofficial ones is the most common, so both well-known ones are named.

| Format | Editor compared | Who makes the editor |
|---|---|---|
| This format (`story-editor` JSON) | Story Editor (this repository) | JNFoo |
| Twine 2 (HTML or Twee 3) | Twine 2.6 editor | Chris Klimas and contributors; the name is a trademark of the Interactive Fiction Technology Foundation |
| Ink | Inky | inkle |
| Yarn Spinner | Yarn Spinner Editor (a Visual Studio Code extension) | Yarn Spinner |
| ChoiceScript | CSIDE, and the ChoiceScript extension for Visual Studio Code | Unofficial; CSIDE says it is not endorsed by Choice of Games |

## 1. The editor (what you see and do)

| | Story Editor | Twine 2 | Inky | Yarn Spinner Editor | CSIDE / VS Code extension |
|---|---|---|---|---|---|
| Runs on | Any modern browser, online or offline (one file); phones too | Desktop app and browser | Mac, Windows, Linux | Windows, macOS, Linux (inside VS Code) | CSIDE: desktop app and a web version that needs a Dropbox account |
| Main way of writing | A form per page: text, then choices pointing at other pages | Passage cards on a map; type in a dialog | Type the script; the story plays beside it | Type the script (VS Code) | Type the script |
| Live preview | Play tab; "Test from here" starts at any page | Play and Test from here | Replays as you type and returns to your last spot | Preview with the real Yarn Spinner runtime; choose options | CSIDE runs the game in the app (changes need a re-run); the extension runs it in the browser |
| Map or graph | Several views, from a flow to a "story shape"; click a page to open it | Cards with arrows; broken links in red; empty pages dotted; start page marked | — | Graph of nodes, drag and auto-layout, colors, clusters, sticky notes | The extension has a scene outline |
| Finds problems | Check tab: unreachable pages, dead ends, unreachable endings, traps, many writing slips; explains why | Story Details counts passages, links and broken links | Issues list of errors, warnings and TODOs that jumps to the line | Error checking with quick fixes | Error highlighting; CSIDE has Autotest and Randomtest built in, the extension runs Randomtest and Quicktest |
| Finding things | Ctrl+K type-to-find, Find and replace | Go To with fuzzy match, Find and replace | (text search) | Go to definition, references, spell checking | Go to definition, highlight usage, project-wide variable rename |
| Helps while typing | Plain boxes; no code to complete | — | — | Autocomplete, hover help | Autocomplete, snippets in Choice of Games style |
| Numbers about the story | Pages, choices, words, items, ending balance; "Roads not taken" recap | Characters, words, passages, links | — | — | Word count of player-visible text; stats about stats |
| What you export | One small game file (about 25–50 KB), JSON, Markdown manuscript, a tick-box test script | Published HTML, Twee 3 | Compiled JSON for other runtimes (such as inkjs on the web) | Interactive HTML, recording spreadsheets (Excel, CSV), Markdown, DOT or Mermaid graphs | A playable HTML file |
| Editor license | MIT | GPL-3.0 | MIT | A free extension (license not checked) | CSIDE: not stated; extension: not checked |
| Language of the editor | American English | Many translations (for example Ukrainian, Chinese, German, Turkish, Dutch) | — | — | — |

## 2. The format (what a story can be)

| | This format | Twine 2 | Ink | Yarn Spinner | ChoiceScript |
|---|---|---|---|---|---|
| File | JSON, with a JSON Schema | HTML page with the story inside, or plain-text Twee 3 | Text, compiled to JSON | Text | Plain-text scene files |
| Logic | None to write: items, numbers, conditions and dice checks are data you fill in | Whatever the chosen story format offers (Harlowe, SugarCube, Chapbook, Snowman, others) | Ink's own logic | Variables, commands, functions | ChoiceScript's own commands |
| Can the tool prove "this ending can (not) happen"? | Yes, exhaustively over items, numbers and dice (`story-check`) | — (shows links, counts broken ones) | — | — | Quicktest tries every option and both sides of every `*if`; Randomtest plays at random; the authors say neither is guaranteed and neither replaces manual testing |
| Works in a game engine | Exports its own HTML game; the player and story packages are plain JavaScript | Published web page | Other ink runtimes (inkjs on the web, others) | Unity, Godot, Unreal | — |
| Reads Twine files | Yes (File → Import Twine…) | Is the source; imports and exports Twee 3 | No | No | No |

## 3. Where this one is behind

- No scripting at all, by design. A story that needs arrays, random values in text or computed values cannot be written in this format; importing such a Twine story flags those parts.
- Much smaller community, no add-ons, and it is a beta.
- No team editing, no translation workflow, no game-engine integration.
- Twine has years of tutorials and many story formats; Yarn Spinner has engine integration and localization; Ink has a mature runtime ecosystem.

## 4. Where this one is ahead

- Nothing to write in code, so a first story and its game take minutes, and an AI helper can write a valid story file.
- The checker explains in plain words why a page or ending cannot be reached, and it is exact for the story's own rules.
- One offline file for the editor and one small file per finished game.
- It can read Twine stories and convert their code to rules where the rules can say it.

## Sources (read 2026-10-14)

- Twine 2.6 release notes: https://twinery.org/reference/en/release-notes/2-6.html
- Twine story map: https://twinery.org/reference/en/editing-stories/navigating.html
- Twine story statistics: https://twinery.org/reference/en/editing-stories/stats.html
- Inky: https://github.com/inkle/inky
- Yarn Spinner Editor: https://yarnspinner.dev/editor/ and https://docs.yarnspinner.dev/next/write-yarn-scripts/editing-with-vs-code/yarn-spinner-editor
- ChoiceScript automatic testing: https://choiceofgames.com/make-your-own-games/testing-choicescript-games-automatically
- CSIDE: https://forum.choiceofgames.com/t/cside-the-choicescript-ide/27622
- ChoiceScript extension for VS Code: https://github.com/sgranade/choicescript_vscode
- Licenses of Twine and its story formats: [NOTICE.md](../NOTICE.md)
