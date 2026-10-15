# How the Story Editor's screen changes with window size and device

Written October 14, 2026 (build stamp 2026.10.14.2259 and later) for anyone building another **single-file, offline web app** who wants the same behavior. Everything here was learned by building and testing this editor; it says what the editor does, why, what went wrong on the way, and where the code is. Copyright (c) 2026 LFC Foundry. MIT License.

The editor is one HTML file with no network access (its security policy forbids it), so none of this depends on a server, a framework or an image file. All of it is plain CSS media queries, a few small JavaScript checks and two class names on `<body>`.

---

## 1. The short version

The editor looks at three different things and keeps them apart:

| Signal | Question it answers | How it is read | What it changes |
| --- | --- | --- | --- |
| **Window width** | How much room is there? | CSS `max-width` / `min-width`; JavaScript `matchMedia('(max-width: 820px)')` | Where things sit and how many rows they take |
| **Input type** | Is a finger the main pointer, or a mouse and keyboard? | `(hover: none) and (pointer: coarse)` (CSS and JavaScript) | Wording ("tap" vs "click"), target sizes, shortcuts, typing mode, swipe, menu contents |
| **Person's settings** | Reduced motion, light or dark, high contrast | `prefers-reduced-motion`, `prefers-color-scheme`, `forced-colors`, plus the editor's own light/dark switch (`data-theme`) | Animation, colors |

The main rule: **narrow is not the same as touch.** A browser window dragged narrow on a laptop is narrow but has a keyboard and a mouse. A phone is narrow *and* touch. A tablet held sideways is wide *and* touch. The editor treats each combination on purpose (section 4).

There is one narrow-screen layout ("the phone layout", 820 px and under) and one wide layout (821 px and over). A few finer steps exist inside each (sections 3 and 5).

---

## 2. How the editor detects things

### In CSS

- Width steps used: **1360, 1199 and 1200, 1100 (measured on the middle area, not the window), 820 and 821, 700, 640, 600, 560, 520, 360**. Section 3 lists what each one does.
- Touch: `@media (hover: none) and (pointer: coarse)` for rules that must apply only on a real touch device; plain `@media (pointer: coarse)` for the older "bigger targets" block (this one also matches some hybrid laptops with touch screens, which is acceptable: bigger buttons never hurt there).
- `@supports (appearance: base-select)` inside `(pointer: coarse)`: dropdown lists drawn inside the page in the editor's own colors (Chrome 135 and later, including Android). Other browsers keep their normal dropdowns.
- `prefers-color-scheme: dark`, guarded by `:root:not([data-theme="light"])`, plus `:root[data-theme="dark"]`, so the person's explicit choice beats the device's setting in both directions.
- `prefers-reduced-motion: reduce` turns off the opening animation, flashes, toasts' fades, tooltip fades, the tour spotlight's glide and the tab drawers' slide.
- `forced-colors: active` (the exported game only) swaps color-only cues for borders.

### In JavaScript (`editor/ui1-state.js`)

```js
let touchForce = null;                       // a test can force true / false; null = ask the device
function touchOnly()  { return touchForce !== null ? touchForce
                          : matchMedia('(hover: none) and (pointer: coarse)').matches; }
function phoneLayout(){ return matchMedia('(max-width: 820px)').matches; }
```

Two more small pieces live in `editor/ui4-phone.js`:

```js
function typingPossible() { return phoneLayout() && touchOnly(); }   // typing mode needs both
function placeChrome() {                                              // see sections 4 and 8
  const touch = touchOnly();
  const low   = phoneLayout() && !touch;                              // "narrow window on a computer"
  document.body.classList.toggle('touch', touch);
  document.body.classList.toggle('brandlow', low);
  /* move the one logo node: bottom bar when `low`, top bar otherwise */
}
```

`placeChrome` runs at start-up, when either media query changes (a `change` listener on each), and when a test calls the override.

### Classes on `<body>` that the styles rely on

| Class / attribute | Set when | Used for |
| --- | --- | --- |
| `touch` | `touchOnly()` is true | Marks phones and tablets for CSS and tests |
| `brandlow` | narrow window (≤820) **and** not touch | Logo and name at the bottom left; counters on their own line |
| `typing` | a text box has the keyboard (phone layout + touch only) | Folds away top bar, page bar and tabs; shows the slim key row |
| `show-side` / `show-items` | the Pages or Items drawer is open (phone layout) | Slides the drawer in, shows the dimming scrim |
| `hide-pages` / `hide-items` | the person hid a side list (wide layout only) | Gives the writing more room |
| `splashing` | the opening animation is running | Hides the logo in the bar so it does not show twice |
| `data-view="write|map|items|check|game|play"` | always | Per-tab rules (for example, no counters on Play) |
| `wsize-s / -l / -x` | the person's writing text size | Bigger or smaller writing boxes |
| `#main.wide` | the middle area is at least 1100 px wide (a `ResizeObserver`, not a window query) | Text and choices side by side |

### Testing hooks

The editor exposes `window.__editor.touch(true | false | null)` and `__editor.typing(on)`. They exist because **Firefox's test driver cannot pretend to be a coarse-pointer device**; Chromium's mobile emulation can. The tests therefore force touch with the hook in Firefox and also run in Chromium with real touch emulation.

---

## 3. What happens at each width

"Phone layout" means 820 px and under. All numbers are CSS pixels.

| Width | What changes |
| --- | --- |
| **1360 and wider** | Full top bar on one row: logo and name, File, Save, Options, Undo, Redo, History ▾, story title, counters, ?, Export game. Tabs row under it with the status chips at the right end. Pages list (260 px) on the left, items list (210 px) on the right, writing in the middle. |
| **1200 to 1360** | Same, but the title shrinks to a 90 px base and the counters get a smaller font and tighter gaps, so Export does not wrap onto a second row. |
| **821 to 1199** | The counters drop to their own line under the top bar (still on screen, left aligned). |
| **Middle area at least 1100 px** (typically a window of about 1600 or more) | The Write screen sets the text and the choices side by side in two columns (`#main.wide`). Measured on the middle area with a `ResizeObserver`, because the side lists change how much room there really is. |
| **821 and wider** | The two side lists can be hidden with a small toggle in each list's header (`sidetog`). Below 821 the toggles do not exist because the lists are drawers. |
| **820 and under (phone layout)** | The big change; section 4. |
| **700 and under** | Button text labels (Save, Options, Undo, Redo, "game" after Export) and the two-line app name are hidden everywhere; title base shrinks to 80 px. The map's toolbar wraps into rows (section 5.6). The map key starts closed (it starts open above 700). The map's "key beside the start page" placement is skipped. The report panel docks to the bottom. |
| **640 and under** | Check-tab condition lines let their dropdowns use the full width; the strips get 44 px tall. |
| **600 and under** | Page picker becomes a nearly full-width panel at the top; the page heading box gets a 120 px base; the word count line is dropped; and (on touch phones) the counters are not on screen at all. The dropdown-anchored pickers only anchor to their button above 600. |
| **560 and under** | Items-tab lines wrap; the "uses" count is dropped. |
| **520 and under** | The "Pages" word beside the ☰ in the pinned page bar is dropped (icon only). |
| **360 and under** | The slim key row tightens its buttons and gaps. |

Also true at every width: fields use 16 px text on touch devices so iOS does not zoom in when one is focused; `env(safe-area-inset-*)` padding keeps content out from under notches and the home bar; the page uses `viewport-fit=cover`.

---

## 4. Narrow screens, by kind of device

At 820 px and under there are **three cases**. The first and second share most of the layout; they differ only in the few things marked.

### 4.1 Phone or tablet held narrow (touch)

Everything in this list was chosen with the owner as "make the phone UI more useful for a person using thumbs".

- **Tabs along the bottom edge** as an icon bar: six equal columns (Write, Map, Items, Check, Game, Play), each an icon with a tiny label (0.68 rem), 49–50 px tall, with a colored line above the selected one. They never scroll sideways. The problem count on Check is a small badge on the icon. The bar sits above the home-bar inset (`env(safe-area-inset-bottom)`).
- **One-row top bar** (about 56 px): File ▾, Save, Undo, Redo, story title, ⋯. The six-pixel colored strip above it stays. The logo, the counters, Options, History, the ? button and Export are not on this row.
- **The ⋯ menu** holds, in order: the story counters ("34 pages · 58 choices · 3,287 words") and status lines (problems found, saved in this browser, writing notes), then History…, Export game, the Quick guide, the tour and the other options. "Keyboard shortcuts" is left out on touch devices.
- **Write tab, pinned page bar** (about 49 px, the only thing that stays at the top): ☰ Pages · ‹ back · page picker (tap the name to jump to any page by typing) · › forward · ↑ · Items. ‹ › step through the pages already visited. ↑ scrolls to the page's own name, flags and type and opens the folded part. **Swiping the bar** left or right goes to the next or previous page in the list (rules in 4.4).
- **The page's own header scrolls away** with the text. Its type and effects (Page, Ending, Good ending, Bad ending; Gets, Loses, Numbers) fold into one line, "Page type and effects: Page · Gets 2 · Loses 1 · Numbers n", that opens when tapped.
- **Side lists are drawers**: the Pages list slides in from the left (86% of the width, at most 320 px), the Items list from the right; a dimming scrim sits behind; tapping outside closes. Choosing a page closes the drawer.
- **Typing mode** (4.3).
- **The pinned "+ Choice / Play" bar** sits above the tab bar when not typing.
- **Bigger targets**: icon buttons 40 px; small buttons about 34 px tall; map icons 38×36 px; checkboxes and radios 20 px; segmented switch buttons at least 36 px; grips (the ⋮⋮ drag handle) padded to a finger. Menus' items 12 px padding.
- **The small grey hint lines that explain mouse actions** (`.hint.tip`) are hidden; the Items list's own hint says "tap = Gets · press and hold = more" instead.
- **Wording**: the first-time tour, the Quick guide and menus say "tap" and "press and hold", never "click", "Ctrl", "Shift+click", "right-click" or "hover". The guide gains a "Using a phone or tablet" section at the top. Sentences with shortcuts exist in two versions, chosen by `touchOnly()` (the guide's `line()` takes either a string or `[computerText, touchText]`).
- **Press and hold replaces right-click** everywhere a right-click menu exists (pages in the list and on the map, items, choices, the map background). An item's menu has Gets and Loses (or "Add a change" for a number) because Shift+click does not exist.
- **Drag has a menu equivalent** everywhere.

### 4.2 Narrow window on a computer (no touch) — the `brandlow` case

Added last (Oct 14, 22:59). The person has a keyboard and a mouse but little width, for example a half-width window or browser zoom at 200%.

- It gets the **same bottom tab bar and one-row top bar** as 4.1 (the layout is driven by width), but:
  - **The logo and the app name move to the bottom left, beside the tabs** (section 8).
  - **The story counters stay on screen**, on a slim line (about 19 px) directly under the top bar, left aligned, **in the same place on Map, Items, Check, Game and Write**. They are **not** repeated in the ⋯ menu. They are hidden on **Play**.
  - Keyboard shortcuts are listed in the menus and wording uses "click" and shortcuts, because the person has a keyboard.
  - No typing mode (the keyboard is a real one and takes no screen), no swipe tip.

### 4.3 Typing mode (touch phones only)

Purpose: when the on-screen keyboard rises on a phone, almost nothing is left of the screen. So **everything folds away except the text box and one slim row of keys**.

- Turned on when a text box or text input inside the writing area gets focus (`focusin`), but only if `phoneLayout() && touchOnly()`. Off when focus leaves to something that is not a text box (150 ms later, so moving from one box to the next does not flicker) or when **Done** is tapped.
- Hidden while typing: the top bar, the pinned page bar, the tab bar and the "+ Choice / Play" bar.
- The slim row (about 52 px) shows: **+ Paragraph**, **+ Choice** (not on an ending), **↶** Undo, **↷** Redo, a gap, **Done**. The buttons ignore `mousedown` so tapping them does not steal focus from the text box (that would drop the keyboard).
- The row is lifted above the keyboard by a CSS variable `--kb`, computed from `visualViewport` (`innerHeight − visualViewport.height − offsetTop`, and zero when the page is pinch-zoomed). The viewport meta also says `interactive-widget=resizes-content`, which tells Chrome on Android to shrink the page instead of covering it; the variable covers browsers that cover the page (iOS Safari).
- The text box being typed in is scrolled into view when typing mode starts and again 280 ms later, after the keyboard finishes rising.
- Toasts move to just above the key row.

### 4.4 Swipe rules

The pinned page bar listens to pointer events: a horizontal move of at least **56 px**, no more vertical than half the horizontal, in under **800 ms**, left for next, right for previous page **in the order the page list is showing** (so a sorted or filtered list is respected). At the ends it says "last/first page in the list". A one-time tip toast about swiping appears about five seconds after the first page opens on a touch phone and is remembered in the person's preferences. The bar has `touch-action: pan-y` so vertical scrolling still works.

---

## 5. Region by region

### 5.1 Top bar

| | Wide (821+) | Phone layout, touch | Phone layout, computer |
| --- | --- | --- | --- |
| Logo and name | Left end | Not shown | Moved to bottom bar, left |
| File ▾, Save | Yes (Save shows an orange dot when unsaved) | Yes | Yes |
| Options ⚙, History ▾, ? | Yes | In ⋯ | In ⋯ |
| Undo, Redo | Text labels above 700 px | Icons | Icons |
| Title | Flexible | Flexible, 1 rem | Flexible, 1 rem |
| Counters | Right of title (own line below 1200) | In ⋯ menu | Line under the bar |
| Export game | Yes | In ⋯ | In ⋯ |
| ⋯ | Hidden | Yes | Yes |

The top border strip (6 px wide screens, 4 px phone layout) is the brand red.

### 5.2 Tab row and status line

- Wide: tabs at the top under the header, icon plus text label; selected tab has a colored underline. The status chips (checker verdict, "Saved in this browser", writing notes) are at the right end of the same row.
- Phone layout: tabs are the bottom bar; the status line is hidden and its information is in the ⋯ menu.
- The Check tab's badge (problem count; green check when none) sits on the icon in the phone layout so it never overlaps the label.
- Arrow keys move between tabs (computer).

### 5.3 Write tab

- Wide: pages list left, items list right, writing in the middle (single column up to 46 rem; two columns when the middle is 1100 px or more). The page header (name, big heading, start flag, bookmark, link, play, more) is sticky at the top of the middle.
- Phone layout: pinned page bar (4.1), folded effects, drawers.
- Writing text size setting (small, normal, large, extra large) changes the writing boxes in every layout.

### 5.4 Items tab, Check tab

Items: one compact line per item; below 560 px lines wrap. Check: lists wrap; condition lines use the full width at 640 and under.

### 5.5 Game tab (reader options)

Two columns (options, live preview) on wide screens. At 820 and under it becomes one column with the live preview **first and sticky** at the top (at most 34% of the screen height, scrolling inside) so a change can be seen while scrolling the options.

### 5.6 Map

- The toolbar holds icon buttons (views, colors, merge, size) with names given by tooltip. Wide: one row.
- 700 and under: **wraps into rows** instead of scrolling sideways (a scrolling toolbar hides tools): view icons first, zoom at the right, then color icons, then the search box full width. On touch the icons are 38×36 px, on a computer 31×30 px. Chip labels shorten ("6 crossings" etc.).
- The map key starts open only above 700 px.
- Tapping a page once lights up its neighbors; tapping again edits it (computer: hover lights, click edits).

### 5.7 Dialogs, menus, pickers, tooltips, toasts

- Dialogs: at most `calc(100vw − 32px)`; wide ones (Find, Compare, Playtest results) are 74 rem at most.
- Right-click / press-and-hold menus (`ctx`): placed to stay on screen; **closed only when the width changes**, never when only the height changes, because a phone's keyboard changes height and must not close a menu.
- The page picker ("Go to…") anchors under its button above 600 px; at 600 and under it fills the width at the top and is limited to 78% of the height.
- Tooltips: one style, shown after a short pause on hover or keyboard focus (the browser's own tooltip is suppressed so there is one look).
- Toast (message with Undo/Redo): centered at the bottom on wide; on the phone layout it is raised above the tab bar (and the pinned bar) so it never covers the tabs (it did once, and blocked a tab tap in a test); in typing mode it sits above the key row.

### 5.8 Exported game (what players see)

- A column up to 40 rem, with 1.0625 rem text (rem units, so the person's phone text-size setting is honored); a Back button only if the author chose a rule; an "Aa" panel for text size, spacing, contrast, calmer motion, plainer numbers.
- Reduced motion switches the page-in animation off; `forced-colors` adds borders to locked choices; number keys 1–9 pick choices on a computer.
- Language and direction: the page carries `lang`, and `dir="rtl"` for right-to-left languages; CSS uses logical edges.

---

## 6. The logo: what was learned

The logo is a bigger part of the interface than it looks, and moving it taught a lot. Everything below is from the editor's own history, in order.

### 6.1 What it is

- **A heart that holds four small icons in two rows of two**: a checkered flag (top left), a smiling face (top right), a frowning face (bottom left) and a gift (bottom right). Those four icons are the editor's own vocabulary: flag = the first page, smile = a good ending, frown = a bad ending, gift = an object the player carries (a heart on its own, in the item lists, means a state). So the logo doubles as a legend of the interface.
- **Drawn by script**, not from a file. `logo(height)` (in `editor/ui2-widgets.js`) builds an SVG with `viewBox="6 8 52 49"`, so the width is `height × 52 / 49`, and a heart path scaled ×4 with the four icons placed at x 19.5 and 33.5, y 21 and 34, each 11 units wide. No image file ships, so nothing can fail to load offline and nothing needs compressing.
- **Colors come from CSS**, not from the SVG: the heart is only an outline (`stroke: var(--signal)`, width 0.8, no fill) so it follows light and dark mode; the icons use the same `--i-gift`, `--i-smile`, `--i-frown`, `--i-flag` tokens as everywhere else (brighter versions in dark mode); the flag's cloth is always white.
- **Sizes**: 26 px high in the bar; 128 px on the opening ("splash"), where the size is `min(15vw, 128px)` so it shrinks on narrow screens.
- **The name** is two stacked words, "Story" over "Editor", in the brand red (`--signal`), bold, 0.82 rem, tight line spacing, never wrapped (`white-space: nowrap`). It is `.brand` next to the logo inside a `.brandwrap`.

### 6.2 The opening animation (splash)

- On load, a white brush stroke is "painted" across the screen in one continuous movement, scrubbed back and forth, with rough edges, loose bristles, dry streaks (dark) and a frayed end; then the logo and the name fade in from left to right as if following the paint (a sliding soft-edged mask, logo at 1.0 s, name at 1.25 s), with the build stamp under the name. It stays for 3.7 s, then fades for 0.7 s.
- The paint is **always white**, so on the splash the icons and the name use their **light-theme colors in both themes**, and the ground is a warm stone in light mode and near-black in dark mode so the white paint always shows.
- Reduced motion: no animation; a still brush and no masking.
- While it plays, the logo in the bar is hidden (`body.splashing #brandlogo { opacity: 0 }`, fading back in) so the person never sees two.
- Every screenful is built with no mask or long dash arrays inside the paint (browsers draw those unreliably on a stretched drawing); a fixed seed makes it identical every time.

### 6.3 It is a control, not a decoration

- Clicking it (or pressing Enter or Space while it has focus) **plays the opening again** (`showSplash`). It has `role="button"`, `tabindex="0"`, a visible focus ring, and the label "Play the opening again"; the SVG itself is `aria-hidden`.
- The Quick guide tells people: "Click the logo at the top left to see the opening again." On touch devices that sentence says to use the ⋯ menu → Take the tour instead, because the logo is not on the phone's top bar.

### 6.4 Where it has been, and why

1. **Top left of the top bar** (wide screens): the original, and still the place at 821 px and up.
2. **Hidden on the phone layout**: the one-row phone top bar had to hold File, Save, Undo, Redo, the title and ⋯, and the brand was the least useful thing to spend 70–90 px of a 390 px row on. The logo and name were simply set to `display: none` there (and the name is hidden at 700 and under on every device, along with button text labels).
3. **Back, at the bottom left beside the tabs, on narrow windows on a computer** (`brandlow`): the owner asked for the logo and name to come back on non-phone browsers. The bottom bar had spare room, and left-of-tabs is a natural, quiet place for an identity mark: it does not compete with the story title, it stays visible on every tab, and it does not cost any height.

### 6.5 How it was moved, and the traps

- **Move one element; do not draw a second.** `placeChrome()` takes the same `.brandwrap` node and inserts it into `#tabrow` (before `#tabs`) or back into `#top` (as its first child). One element means one `id`, one click handler and one keydown handler (both are attached once at start-up), one splash-hiding rule, and tests that find it by the same selector. A duplicate would have needed all four kept in step.
- **Hide rules were written for the old parent.** The phone CSS hid the brand with `#top .brandwrap`, which matches only while the node is inside the top bar, so after the move that rule stops applying by itself (good), and the bottom bar needs its own rules: `body.brandlow #tabrow .brandwrap { display: inline-flex; flex: 0 0 auto; align-self: center; padding: 0 6px 0 12px }` and `body.brandlow #tabrow .brand { display: flex }`.
- **The 700 px rule that hides `.brand` for every device** had to be beaten on specificity in the bottom bar (the new rule's selector is more specific, so it wins without `!important`).
- **The tabs have to give up room.** The tabs use `flex: 1 1 0` columns; the logo block is `flex: 0 0 auto` (about 89 px with the name); at 390–700 px the six tabs still fit without any sideways scroll (tested).
- **A phone must not get the bottom logo.** The class `brandlow` is on only when the layout is narrow and the device is not touch-only. When the same page goes from touch-forced to not (tests) or a window is resized across 820, the node goes back to where it belongs, because `placeChrome` runs on both media queries' `change` events.
- **Do not set the wrap rule too broadly.** `body.brandlow #top { flex-wrap: wrap }` is what lets the counters take a second line; the normal phone top bar is `nowrap`, and the two must not share a rule.
- **Test-writing trap**: asking the browser driver to return a DOM element from a page script gives back nothing useful (it serializes to null); tests must return a boolean or a measurement instead.

### 6.6 Rules of thumb that came out of this

- Put the brand where height is cheap, not where it is expensive: the phone's top edge is expensive, the bottom bar's left end is free.
- Hide the *name* before the *mark* when room runs out; the mark alone still identifies the app. (At 700 and under, the name is hidden everywhere except in the bottom bar.)
- Use the logo to teach the vocabulary: if the mark contains the same four symbols the interface uses, it earns its space.
- Give the mark a job (replay the opening / open "About") so it is not dead space on a narrow screen.
- Keep one copy; move it.
- Never rely on the mark's colors alone to separate states; it is decoration in `aria-hidden`.

---

## 7. Where the counters live, and why

"Counters" are the story totals: pages, items, choices, words the player reads, and the number of good (smile) and bad (frown) endings. Each has a tooltip explaining what it counts.

| Device and width | Counters are |
| --- | --- |
| Wide (1200+) | In the top bar, right of the title |
| 821–1199 | On their own line under the top bar |
| Narrow window, computer | On a slim line under the top bar, **same place on Write, Map, Items, Check and Game**; hidden on Play; not in the menu |
| Narrow, touch (phone) | Only in the ⋯ menu, first line ("34 pages · 58 choices · 3,287 words", without items and endings) |

Reasoning: on a phone every pixel of height counts (each 20 px line is about 2.4% of an 844 px screen), and the totals are not needed while writing; on a computer window there is room, and being on every tab in the same place lets the writer watch the numbers change. On the Play tab the person is a player, not an author, so they are not shown. The ⋯ menu's counter line is produced by `statusLines()` only when `touchOnly()` is true, so it is not repeated where the numbers are already on screen.

---

## 8. Measured heights (CSS pixels)

| Layout | Fixed top | Pinned page bar | Bottom bar | Where the first paragraph starts |
| --- | --- | --- | --- | --- |
| Before the phone work (390 px) | 252 | 107 sticky | 53 | not measured; with the keyboard up (a 430 px-high window) only about 70 px of text area was left |
| Phone, touch, 390×844 | 56 | 49 | 49 | 292 |
| Phone, touch, typing | none | none | none (one 53 px key row) | text fills the rest |
| Narrow computer window, 700×800 | 75 (includes the 19 px counters line) | 49 | 49 | about the same |
| Wide, 1440 | 62 | n/a | n/a (tab row 45 at the top) | n/a |

---

## 9. How it was tested

- **Two engines**: Firefox (the stress test, run first) and Chromium. Firefox cannot emulate a coarse pointer, so tests there use `__editor.touch(true)` and `__editor.typing(true)`; Chromium tests use real mobile emulation (`is_mobile`, `has_touch`) so `(hover: none) and (pointer: coarse)` is genuinely true.
- A dedicated suite (`editor/qa/phone.js`) checks: tabs along the bottom edge and no sideways scroll; six tabs each at least 40 px tall; the top bar is one row; the ⋯ menu contents (and no shortcuts entry); the pinned bar; the first paragraph position; folded effects; ‹ › history; ↑; swipe (synthetic pointer events); typing mode (key row visible, chrome hidden, + Paragraph works, Done restores); the tour and the guide contain no Ctrl, Shift+, right-click or hover on touch; an item's Gets and Loses menu; at 700 px without touch: the logo and name at the bottom left beside the tabs, the counters under the top bar in one place on Map, Items, Check and Game, not on Play, not in the menu, tabs still unscrolled; back to touch: logo returns to the (hidden) top bar; at 1200: tabs at the top and no ⋯.
- The full set of 72 browser suites runs on both engines before each release.
- Screenshots at 390×844, 700×800, 1000 and 1440 were looked at, not only measured.

---

## 10. Mistakes and surprises (so another project can skip them)

- **A fixed header plus a sticky page header took 60% of a phone's height**, leaving about 70 px for text once a keyboard was up. Cure: pin only one thin bar, let the rest scroll, and fold the rest while typing.
- **A toast covered the bottom tab bar** and swallowed a tab tap. Raise it above the bar.
- **A badge on a tab icon overlapped the label** when the tab had no icon; give every tab an icon and place the badge on the icon.
- **A tab bar that scrolls sideways hides tabs.** Six equal columns with a tiny label always fit; icon plus label at 0.68 rem is enough.
- **A map toolbar that scrolled sideways hid tools.** Wrapping into rows (two or three on a phone) shows everything.
- **iOS zooms into any field under 16 px.** All fields are 16 px on touch.
- **The keyboard changes the page's height, not its width.** Any "close on resize" logic must compare widths only, or a menu closes the moment the keyboard opens.
- **`interactive-widget=resizes-content`** in the viewport meta makes Chrome on Android shrink the page for the keyboard; iOS Safari ignores it and covers the page, so the key row is also lifted by `--kb` from `visualViewport`.
- **A hardware keyboard on a tablet** counts as keyboard use: the editor remembers whether the last input was a key, and then focuses the first menu entry. Tests that press a key (Escape) must also send a `mousedown` to say "touch again", or a page change will focus a text box and wrongly switch typing mode on.
- **Browser zoom changes the width** the page sees. A laptop at 200% zoom is a 700 px window with a mouse: that is the `brandlow` case, and it exists because it is common.
- **A tablet in portrait (820 px and under) is treated as a phone** (touch + narrow), and in landscape as a computer-sized screen with touch wording. Typing mode only starts when both are true.
- **Specificity, not order, decides which hide rule wins** when an element moves between parents. Write the rule for the new place with a more specific selector.
- **Rules from older sections stay in the stylesheet.** The editor's first small-screen block (side lists as drawers, a wrapping tab row) was partly overridden later by the bottom-bar rules; the later section is the truth. If you copy this, copy the later one.
- **Test drivers differ**: string-form `waitForFunction` is blocked by the page's strict security policy (no `unsafe-eval`); pass real functions.

---

## 11. Recipe for another single-file app

1. Decide the three questions per screen: *what must stay on screen when there is no room, what can scroll away, what can fold or hide behind one tap?* Write them down before writing CSS.
2. Use **one narrow breakpoint** for the layout (the editor uses 820), a few small steps for details, and **a separate `(hover: none) and (pointer: coarse)` test** for anything about fingers vs mouse.
3. On narrow screens, put the **primary navigation at the bottom** as an icon-plus-tiny-label bar with equal columns (no scrolling), reserve its height in the page's bottom padding, and respect `env(safe-area-inset-bottom)`.
4. Keep **one thin pinned bar** under a one-row top bar; fold secondary controls into one summary line that opens on tap; put infrequent actions in a ⋯ menu.
5. **While the keyboard is up, show only the field and one row of keys**; offer Done. Lift the row with `visualViewport`; include `interactive-widget=resizes-content`.
6. Offer **menus instead of drag, and press-and-hold instead of right-click**; never put a needed action only behind hover.
7. **Words follow the device**: "tap" for touch, "click" with shortcuts for a computer; write every shortcut sentence in two versions and pick by `touchOnly()`.
8. Keep **counters, brand and status where height is cheap** for the device: bottom bar for the mark, a slim line or a menu for numbers.
9. Use **tokens for every color**, a dark set, and the person's explicit light/dark switch on `data-theme`; draw icons and the logo from script using those tokens.
10. Respect **reduced motion** (no opening animation, no fades), **forced colors** (borders, not color-only), and keep all targets at least 36–40 px on touch (padding or hit area, not only the visible shape).
11. Provide test hooks to force touch and typing, test in two engines, and **look at screenshots at 390, 700, 1000 and 1440**.

---

## 12. What is not done, and what is not known

- **Not tried on a physical phone or tablet.** All evidence is from emulation in Firefox and Chromium and from screenshots. The behavior of the on-screen keyboard (especially iOS Safari) is the most likely place for a surprise.
- Bottom sheets (a pop-up panel sliding up from the bottom) for the page and item pickers were offered and **not chosen**; the pickers remain panels and drawers.
- Counters on a phone are only in the ⋯ menu; the owner has not asked for them on screen there.
- On the narrow computer layout, the logo is not shown when the window is narrow **and** the device reports touch (for example a touch laptop); there the phone layout rules apply.
- Hardware keyboards on phones and tablets are handled only by the "last input was a key" check.
- A sticky counter line is not pinned on a phone because it would cost height.

---

## 13. Where each rule lives

| Thing | File |
| --- | --- |
| Viewport meta, the page frame (header, tab row, side areas, key row), the logo's place in the markup | `editor/build.py` |
| All size and device rules (sections "10 Small screens and touch", "13 Phones", "16 Phone layout" at the end, and the late narrow-computer block) | `editor/ui.css` |
| `touchOnly()`, `phoneLayout()`, preferences such as the swipe tip | `editor/ui1-state.js` |
| The logo drawing (`logo`), the opening paint (`brushStroke`), icons, menus, pickers | `editor/ui2-widgets.js` |
| Folded effects line on the Write tab, item menus with Gets / Loses, hints | `editor/ui3-write.js` |
| Counters and status chips (`statusParts`, `statusLines`) | `editor/ui4-status.js` |
| Typing mode, key row, swipe, `placeChrome` | `editor/ui4-phone.js` |
| Top bar and ⋯ menu, tabs, pinned page bar (‹ › ↑), the splash (`showSplash`), the tour, the Quick guide (touch variants), test hooks | `editor/ui5-app.js` |
| The exported game's responsive and accessibility rules | `editor/game.css` |
| Tests | `editor/qa/phone.js` (and the suites it sits beside; see `editor/qa/README.md`) |

---

*Companion documents: `docs/UI-ADULT-PHASES.md` (the phased list of interface ideas), `docs/CHANGELOG.md` (what changed and when, with measured sizes), `docs/FOUNDATION.md` (project background).*
