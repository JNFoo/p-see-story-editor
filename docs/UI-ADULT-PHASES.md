# Interface ideas for the adult edition: what is built, what is next

Source: the single-file UI research report (in the knowledgebase repo, folder research/2026-10-14-single-file-ui; cards X01–X183) and its notes. That report was written for a children's product. This list keeps what helps adult authors and readers and drops the rest. Card numbers are the report's.

Rules for every phase: no sound, no network, nothing added to the exported game unless it is an optional module, one phase at a time, each phase ends with its tests green and a size note in the CHANGELOG.

## Built (2026.10.14)

| Idea | Card | What the author sees |
|---|---|---|
| Named Undo + History | X119 | Pointing at Undo says what it will undo ("Undo: Delete page “The Cellar”"); the ▾ button lists the last 20 steps; one click goes back to just before a step; a toast offers Redo; the page that changed is shown. |
| Save line + problems strip | X120, X121 | A line at the right of the tab row: checker verdict, "Next problem", saved-in-this-browser time, age of the last file copy. On a phone it sits on its own row. |
| Reader language + direction | X168 (part) | The game's page carries the story's language code (new box in File → Translations) and flips to right-to-left for Arabic, Hebrew, Persian, Urdu and similar; layout uses logical (start/end) edges. |
| Reader follows phone text size | X90 (part) | Text is sized in rem, and the page asks Chrome to follow the phone's text-size setting. |

Already in the program before this list (no work needed): locked choices with a reason, Roomy/Larger text, contrast follows the system, reduced motion, one dialog at a time, two-tab guard, pinch zoom, spellcheck.

## Phase 1: Writing area (editor, Write tab)

- X109 Safe page creation: a page made by typing a link name vanishes again if that link is removed before the page gets any text; Find and replace across the story; import never overwrites silently.
- X121 (rest) A recovery chooser when the saved copy and the last file copy differ; an automatic safety copy before every Play or Export.
- X30 Tap alternative to every drag (move paragraph, reorder choice, reorder page) for touch and keyboard.
- X82 Sticky bar guard: `scroll-padding` so a focused field is never hidden under the page bar.
- X129 Nothing moves under the pointer while editing (counts, chips and menus update in place).
- X10 Danger zone: Delete story and Replace-from-file keep distance from everyday buttons, with the undo window already built.

## Phase 2: Map and Check area

- X107 Map marks: a stop symbol on a choice that leads nowhere, a dotted outline on an empty page, a start marker, selection linked between list, map and editor.
- X105 Story soak test: N seeded random playthroughs with hit counts per page shown on the Map and a replay log (finds pages nobody ever reaches in practice, and dead stretches).
- X112, X113 Check as one button with a fixed layout and plain verdict words (Great, Good, Needs attention, Problem, Could not check); the exact wording of "not fully checked" stays.
- X120 (rest) Find in story from the status line.

## Phase 3: Exported reader, as optional modules

Each is an optional `klFeat` module, so a story that does not use it pays nothing.

- X90 (rest) A text-size control for the reader: Small, Big, Huge.
- X49 Reader settings page: Auto / On / Off for system-linked options, short list of what readers ask for.
- X61 Color-blind-safe palette set for the reader's accent colors.
- X17 Home button (back to the title, Continue first) instead of Quit.
- X18 Keep place and scroll through rotation and resize.
- X35 (check only) unavailable choices stay visible and say why: already built for locked choices; confirm it covers every case.

## Phase 4: Test tools (the Test Lab and qa)

- X04 Reference viewport pack (412×892, 892×412, a small phone) for every layout check.
- X132 One-second phone sweep: one command, per screen state, prints console errors, overflow, tap-target sizes, missing names.
- X139 Overflow stress: five widths, two text sizes, the longest real strings.
- X135 Emoji-only or icon-only buttons must carry a plain-words name.
- X141 A "known generated-code mistakes" grep that grows with each UI bug (`transition: all`, `outline: none` without a focus style, and so on).
- X166 Pseudo-language ("tall German") stress pass.
- X176 The three Firefox 158 checks (seam gaps, slow-slide stutter, clipped pill ends); X87 flash-rate meter.
- Two target-size tiers reported separately: the 24 px floor (X134) and the adult comfort size.

## Phase 5: Helper features (late; no network)

Offline only: a helper reads text the author already has or pastes in, shows a preview where it changes anything, and one Undo reverses it. No AI, no network (chosen Oct 14).

Round 1, built 2026.10.14:

- **File → Paste an outline…** One page per line at the left edge; indented lines under it are choices ("Choice words → Page name", also `->` and `=>`) or, with no arrow, paragraphs; "(ending)", "(good ending)", "(bad ending)" after a page name. Bullets and numbers in front are ignored. A live preview counts pages and choices and lists what could not be used; pages named only in a choice are added empty; a name already in the story gets a number; in a story that has only the empty first page, the outline replaces it and its first page becomes the start.
- **Writing notes in the Check tab** (collapsed section; count in the status line): words typed twice in a row, a word used again and again on one page, a name that may be a typo for a commonly used spelling (one letter off, never written as an everyday word), choices on a page that read almost alike, paragraphs and pages over a size set in the section (150 and 600 words by default). Each note has Open page and Ignore; ignored notes are remembered in this browser only, with a button to show them again.

Later rounds get their own question round.

## Dropped (made for children, or about sound or networks)

Child size ladder and grip rules (X01, X03), age ladder (X29), progress-as-object and ghost hand (X38, X40–X42), no-fail modes (X43, X45), parent gate and stopping points (X92, X95), manipulation and children's-law audits (X96–X98), child playtest methods (X161), canvas and action-game cards (X12, X22, X24, X26, X32–X34, X183), and read aloud, which needs sound.

## Notes for the project rules

- The report's AGENTS block carries kid rules; an adult edition keeps X142 (run the checks, fix what the report shows, two rounds at most), X144–X146 (plan card, product character, short instruction file) and drops the age-band rules.
- The byte numbers quoted in the report are stale: current ceilings are in `editor/build.py` and the CHANGELOG.
