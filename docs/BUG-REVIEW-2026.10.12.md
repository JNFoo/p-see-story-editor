# Bug review, 2026.10.12

You asked for a review of every combination of clicks, upgrades and stages that could hurt stability or a player's enjoyment, with the policy
"fix clear bugs, report the rest", across four areas: exported games, the editor (lost work, crashes), old files and upgrades, and the checker.

**How it was done.** Three read-only code reviews (player, editor, files and checker) produced reproduced findings. Then four fuzzers were written
(random clicks in the editor, random stories played as real games, thousands of damaged story files, damaged saved game places), and a regression test was
added for every fix (`qa/bugs12.js`). All of it runs in Firefox 158 and Chromium.

## Fixed (each has a check)

### In exported games
| # | What could happen | Fix |
|---|---|---|
| 1 | Back, then choosing the same dice check again, could hand back a roll remembered from a different moment. | A remembered roll is kept only for the same step in the story. |
| 2 | A Place code with a roll digit that is not a roll (for example `z`) was accepted as a roll of 37. | Refused. |
| 3 | A refused Place code closed the box and showed no message at all. | The page is no longer redrawn on a refusal, so the message shows. |
| 4 | A page where no choice can be taken (a locked choice nobody can unlock) had no way out before the first choice was made. | Start over shows there too. |
| 5 | "Test from here" kept numbers the tester had not listed at their starting values. | They are 0, as documented. |
| 6 | The reading-settings (Aa) panel could not be closed with Esc, and on a short page with Larger text its top rows (Text size, the way back) were above the top of the page and out of reach. | Esc and a click elsewhere close it; it opens downward when there is no room above, and never wider than the screen. |

### Editor: lost work
| # | What could happen | Fix |
|---|---|---|
| 7 | Pressing Ctrl+S twice started two writes; an edit made during a write was marked as saved. | One write at a time; what was written is what is marked saved. |
| 8 | After a reload the remembered file was shown as "saved" even if the autosave held newer edits. | The file record carries a fingerprint; "saved" only if it matches. |
| 9 | New story, Example, Open or Import overwrote the autosave, and the spare copy might be up to ten minutes old. | The story being left is stored first and kept as the spare at once. |
| 10 | A full disk made autosave fail while the spare copy sat there taking room; the warning then never cleared. | The spare gives up its room and the save is retried; the warning clears when saving works. |
| 11 | With a browser that keeps nothing (private window), closing the tab lost everything silently. | The browser asks before closing while nothing is being kept. |
| 12 | A damaged autosave with no spare silently showed the example. | A message says so and that the unreadable copy is kept aside. |
| 13 | "Extra large" writing text was saved under a name it was not loaded by, so it reverted after a reload. | Fixed. |

### Editor: crashes and odd results
| # | What could happen | Fix |
|---|---|---|
| 14 | A story file with a list where a number or text was expected (or the reverse), or a page that is not an object, could stop the editor from loading it. | Loading is tolerant of all of those; 13,500 damaged copies now load. |
| 15 | Ctrl+Z / Ctrl+Y with a dialog, menu or picker open changed the story behind it. | Ignored while any of those are open. |
| 16 | Deleting or duplicating a page twice quickly could act on the wrong page or leave nothing selected. | Guarded. |
| 17 | Leaving a box (change event) redrew the screen before focus moved on, so the next keystrokes went nowhere. | The redraw waits one turn and focus is put back where it was. |
| 18 | On a phone the on-screen keyboard (a resize) closed menus and the page picker. | They close only when the width changes. |
| 19 | A drag whose pointer was lost (a keyboard Undo mid-drag) left the page scrolling by itself. | The drag ends cleanly. |
| 20 | The first-time tour could start over someone typing, broke when the phone was rotated, and let Ctrl+S open the browser's Save box. | It waits for typing to stop, follows the window, and holds back Ctrl+S / Ctrl+P. |
| 21 | The map key stayed where it was when the window was resized. | It follows, or returns to its corner when narrow. |
| 22 | "Start page was an ending" notes could repeat on the next New story. | Said once. |

### Speed
| # | What could happen | Fix |
|---|---|---|
| 23 | A dense story (300 pages with 6 to 8 choices each) took 26 to 56 seconds to draw its map. | 0.4 seconds, with identical drawings (198 layouts compared before and after). The map cache also no longer stores whole stories as keys. |

## Reported, not changed (your call)

* **The Place code fingerprint ignores choices.** Edit only a choice (label, target, requirement) and old codes still pass the version check, then may land on a different page. A fix would change every code already handed out.
* **The same story open in two tabs** can overwrite each other's autosave; there is no warning. A small "open in another tab" banner would fix it.
* The Back recap lists at most 400 steps while Back itself can go further.
* `m:` conditions (where a thing was sent) are not renamed if a file's page ids are replaced on loading.
* The checker's "stuck" message names the page but not which Given answer led there.
* In the Play tab, changing the Given list restarts and forgets test items chosen earlier.
* Split page when an "Otherwise" paragraph sits right at the cut: reviewed but not exhaustively tested.

## What was tried and found clean

* 20 random editor sessions of 500 steps in each browser (about 20% of steps changed the story): no errors, story always whole, Undo all / Redo all returns the identical story, autosave always equal to the story.
* 12 random stories (every feature, all four Back modes, Place code on and off) played for 150 steps each, Firefox and Chromium, including Place code copy, clear the device, paste: always the same place.
* 13,500 damaged story files and 320 damaged saved game places: always loaded or started, never thrown.
* The contract test (300 random stories against the checker) and both browsers' full suites.
