#!/usr/bin/env python3
"""Builds the single-file editor from its source parts.

Outputs (next to this script):
  story-editor.html            the finished editor, PACKED with LZMA: one self-contained, offline file that unpacks itself when opened
  story-editor.plain.html      the same editor, readable (size budgets and text-reading checks use this one)
  story-editor.artifact.html   the same page without <html>/<head>, for pages that wrap it

Needs Python 3.9+ and Node.js 18+ with esbuild (run "npm install" once in this folder). The packing is LZMA from Python's standard
library (see lzma/); nothing else to install.

Sources, in the order they appear in the finished file:
  fonts/                        Inter Tight, embedded as data in <style id="font-ui"> (also copied into exported games)
  game.css, player.js, the game rules in core.js
                                minified by build-game.mjs into the code every exported game carries:
                                -> <script type="application/json" id="game-parts"> (code and styles in one piece per optional feature)
  keepers-light.project.json    the built-in example story                -> <script type="application/json" id="starter-story">
  ui.css                        styles for the editor                     -> <style>
  core.js, maplayout.js, twine.js, routes.js
                                PART 1: story model, game rules, checker, export; map layout; Twine import (global functions)
  player.js                     PART 2: plays a story (global function)
  ui1-state.js ... ui5-app.js   PART 3, wrapped in one function so it leaks nothing
"""
import base64, json, os, re, sys, datetime, subprocess
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__)) + "/"
read = lambda f: open(HERE + f, encoding="utf8").read()

# ---- the typeface: Inter Tight (SIL Open Font License), embedded so the file stays offline. It is Inter with
#      tighter spacing: the same letters, about 10% narrower, so more fits on a line. Subset to Western European
#      letters and common punctuation, weight axis 400-700 (the weights used), no hinting; other characters fall
#      back to the device's own fonts. Made from @fontsource-variable/inter-tight (latin, wght) with fontTools.
#      Rebuilding is NOT repeatable by default: fontTools stamps the current time into the font, and the compressed size then
#      moves by up to ~120 bytes from one run to the next (measured Oct 2026: 19,948 to 20,072 bytes for the full cut, 12,876 to
#      12,980 for the plain-English cut). Setting SOURCE_DATE_EPOCH fixes the stamp and makes three runs byte-identical, so
#      put it in front of every command below. The two committed font files are used as they are; nothing here runs in the build.
#        export SOURCE_DATE_EPOCH=1759881600
#        fonttools varLib.instancer inter-tight-latin-wght-normal.woff2 wght=400:700 -o it.ttf
#        pyftsubset it.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+2018-201F,U+2026,U+2013-2014,U+2022,U+2190-2193,U+00D7"
#          --layout-features=kern,tnum --no-hinting --desubroutinize --flavor=woff2 --output-file=InterTight-sub.woff2
def font_face(family, fname):
    data = base64.b64encode(open(HERE + "fonts/" + fname, "rb").read()).decode("ascii")
    return ("@font-face{font-family:'%s';font-style:normal;font-weight:400 700;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2')}" % (family, data))
FONT = font_face("Inter Tight", "InterTight-sub.woff2")

# ---- the small typeface for games whose story uses only plain English characters (KL_LITE_FONT in core.js says which). It is the
#      same font cut down again, from InterTight-sub.woff2, so the letters are identical:
#        pyftsubset InterTight-sub.woff2 --unicodes="U+0020-007E,U+00B7,U+00D7,U+2013-2014,U+2018-201F,U+2022,U+2026,U+2192"
#          --layout-features=kern,tnum --no-hinting --desubroutinize --flavor=woff2 --output-file=InterTight-ascii.woff2
FONT_LITE = font_face("Inter Tight", "InterTight-ascii.woff2")
# The build stops if KL_LITE_FONT (core.js) accepts a character the small font does not have (the arrow, in neither font, may fall back).
# The rule is asked about every character directly, by running it in node, instead of reading its text: reading the text with a pattern
# missed capital hex digits (\u00B7) and characters typed in as themselves.
try:
    from fontTools.ttLib import TTFont
    have = set(TTFont(HERE + "fonts/InterTight-ascii.woff2").getBestCmap())
    probe = ("const vm=require('node:vm'),fs=require('node:fs');const c=vm.createContext({});"
             "vm.runInContext(fs.readFileSync(process.argv[1],'utf8')+'\\nthis.R=KL_LITE_FONT;',c);"
             "const ok=[];for(let cp=0;cp<0x10000;cp++)if(cp<0xd800||cp>0xdfff)if(c.R.test(String.fromCharCode(cp)))ok.push(cp);console.log(JSON.stringify(ok));")
    accepted = json.loads(subprocess.run(["node", "-e", probe, HERE + "core.js"], capture_output=True, text=True, check=True).stdout)
    if len(accepted) < 90:
        raise SystemExit("BUILD STOPPED: KL_LITE_FONT (core.js) accepts only %d characters; the check could not read it properly." % len(accepted))
    for cp in accepted:
        if cp != 0x2192 and cp not in have:
            raise SystemExit("BUILD STOPPED: KL_LITE_FONT (core.js) accepts U+%04X, which the small font does not have." % cp)
except ImportError:
    print("note: fontTools is not installed, so the small font was not checked against KL_LITE_FONT")

# ---- the contract test: the checker must agree with the real game rules, and every field of the story must be accounted
#      for (see contract.mjs). A failure stops the build, so editor, game and checker cannot drift apart.
CONTRACT = subprocess.run(["node", HERE + "contract.mjs", "400", "1"], capture_output=True, text=True)
if CONTRACT.returncode != 0:
    raise SystemExit("BUILD STOPPED by the contract test:\n" + CONTRACT.stderr + CONTRACT.stdout)
print(CONTRACT.stdout.strip())

# ---- what every exported game carries: the rules and the player, minified, and the game stylesheet, minified
GAME = json.loads(subprocess.run(["node", HERE + "build-game.mjs"], capture_output=True, text=True, check=True).stdout)
# the pieces as JSON data: the rules and core player, one code piece and one style piece per optional feature.
# "<" is escaped so no text can end the tag early. buildGameHtml (core.js) writes into each game only the pieces its story uses.
GAME_PARTS = json.dumps(GAME, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")

UI_PARTS = ["ui1-state.js", "ui2-widgets.js", "ui3-write.js", "ui4-map.js", "ui4-views.js", "ui4-speed.js", "translate.js", "ui5-app.js"]

# ---- the example story, as compact JSON (it is data; the readable copy is keepers-light.project.json).
#      "<" is escaped so no text can end the tag early.
starter = json.dumps(json.load(open(HERE + "keepers-light.project.json", encoding="utf8")), ensure_ascii=False, separators=(",", ":"))
starter = starter.replace("<", "\\u003c")

# ---- the editor's script
ui = "(function () {\n'use strict';\n\n" + "\n".join(read(f) for f in UI_PARTS) + "\n})();\n"
script = "'use strict';\n\n" + read("core.js") + "\n" + read("maplayout.js") + "\n" + read("twine.js") + "\n" + read("routes.js") + "\n" + read("player.js") + "\n" + ui
script = re.sub(r"</(script)", r"<\\/\1", script, flags=re.I)  # any capitalization ends a script tag in HTML
# ---- the version stamp shown on the splash: when this file was built, as YYYY.MM.DD.HHMM in US Eastern time, 24-hour clock, e.g. "2026.10.08.2320" (the owner's format from Oct 8 2026 on)
now = datetime.datetime.now(ZoneInfo("America/New_York"))
STAMP = now.strftime("%Y.%m.%d.%H%M")
script = script.replace("__BUILD_STAMP__", STAMP)

BANNER = """<!--
  STORY EDITOR  -  a single-file editor for interactive (choose-your-own-adventure) stories.

  HOW TO USE
    Open this file in any modern browser (Chrome, Edge, Firefox, Safari, Android, iPhone, iPad).
    Write pages and choices, press Export game, and you get one HTML file anyone can play.

  OFFLINE AND PRIVATE
    This file makes no network requests and says so in its Content-Security-Policy below.
    The typeface (Inter Tight, SIL Open Font License) is embedded in the file.
    Your story is kept in this browser (localStorage) and, with Save, in a .story.json file you choose.

  HOW THE FILE IS ORGANIZED
    1. <style>  editor styles (colors, layout, small-screen rules)
    2. <body>   the empty page frame: top bar, tabs, side lists, main area
    0. fonts    Inter Tight in <style id="font-ui">, embedded and subset to keep the file small
    3. data     the example story, and the stylesheet and code every exported game carries (minified)
    4. <script> PART 1 CORE (model, rules, checker, import, export) and MAP LAYOUT
                PART 2 PLAYER (plays a story)
                PART 3 EDITOR (the screens), in sections 3a-3e
  This file is generated from separate source files by build.py; edit those, not this.
  Built: __STAMP__
-->"""

BODY = """<!-- Page frame. The editor fills #side, #main and #itemside with JavaScript. -->
<div id="app">
  <header id="top">
    <span class="brandwrap"><span id="brandlogo" role="button" tabindex="0" title="Play the opening again" aria-label="Play the opening again"></span><span class="brand"><span>Story</span><span>Editor</span></span></span>
    <div class="menu">
      <button class="btn" id="menubtn" type="button" title="Save, open, start a new story, export">File ▾</button>
      <div class="pop" id="menupop" hidden></div>
    </div>
    <button class="btn" id="savebtn" type="button" title="Save your story to a file (Ctrl+S)" aria-label="Save"><span class="lbl">Save</span></button>
    <div class="menu">
      <button class="btn" id="optbtn" type="button" title="Quick guide, shortcuts, light/dark, fonts, preferences and advanced features" aria-label="Options">⚙<span class="lbl"> Options</span></button>
      <div class="pop" id="optpop" hidden></div>
    </div>
    <button class="btn" id="undo" type="button" title="Undo the last change (Ctrl+Z)" aria-label="Undo">↶<span class="lbl"> Undo</span></button>
    <button class="btn" id="redo" type="button" title="Redo (Ctrl+Y)" aria-label="Redo">↷<span class="lbl"> Redo</span></button>
    <input id="title" aria-label="Story title" placeholder="Story title" maxlength="120" title="The title of your story. Players see it above each page.">
    <div class="stats" id="stats" role="group" aria-label="Story totals"></div>
    <button class="btn" id="help" type="button" title="Quick guide" aria-label="Quick guide">?</button>
    <button class="btn primary" id="export" type="button" title="Turn your story into one HTML file anyone can play">Export<span class="lbl"> game</span></button>
  </header>
  <div class="banner" id="nosave" hidden style="margin:0;border-width:0 0 1px">This browser is not keeping your work between visits. Press Save often to keep it in a file.</div>
  <nav id="tabs" role="tablist" aria-label="Sections" aria-controls="main"></nav>
  <div id="drawerbar" hidden></div>
  <div id="body">
    <aside id="side" aria-label="Pages"></aside>
    <main id="main"></main>
    <aside id="itemside" aria-label="Items"></aside>
  </div>
  <div id="scrim"></div>
</div>
<div id="toast" role="status" aria-live="polite"></div>
<div id="tip" role="tooltip" aria-hidden="true"></div>
"""

CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; "
       "connect-src 'none'; form-action 'none'; base-uri 'none'")

DATA = ('<!-- Data, never run here: the built-in example story (JSON), and the code and styles of the game (one piece per optional feature; an exported game gets only the pieces its story uses). -->\n'
        '<script type="application/json" id="starter-story">\n%s\n</script>\n'
        '<script type="application/json" id="game-parts">%s</script>\n'
        '<script type="text/plain" id="font-lite">%s</script>\n') % (starter, GAME_PARTS, FONT_LITE)

# ---- the editor's own script and styles are shrunk (comments and spacing only) in the finished file; the sources stay documented.
#      Set STORY_READABLE=1 to build without that, e.g. to read an error message with real line numbers.
def shrink(kind, text):
    if os.environ.get("STORY_READABLE"):
        return text
    return subprocess.run(["node", HERE + "minify.mjs", kind], input=text, capture_output=True, text=True, check=True).stdout

STYLE = '<style id="font-ui">%s</style>\n<style>\n%s\n</style>\n' % (FONT, shrink("css", read("ui.css")))
SCRIPT = "<script>\n%s\n</script>\n" % shrink("js", script)
# HTML has one more trap inside a script: after "<!--" a later "<script" switches the parser into a mode where the real </script> no longer
# ends the script (until a "-->" turns it off). The code writes "<!--" and "<script" in the games it exports, so each "<!--" must be closed by a
# "-->" before the next "<script". Checked on the finished text, exactly.
for _m in re.finditer("<!--", SCRIPT):
    _close = SCRIPT.find("-->", _m.end())
    _open = re.search("<script", SCRIPT[_m.end():], re.I)
    if _open and (_close < 0 or _m.end() + _open.start() < _close):
        raise SystemExit("BUILD STOPPED: the editor's script has a \"<!--\" that is not closed by \"-->\" before the next \"<script\"; browsers would then not find the end of the script. Near: " + SCRIPT[_m.start():_m.start() + 80])

standalone = """<!doctype html>
%s
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="%s">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:,">
<title>Story Editor</title>
%s</head>
<body>
%s
%s
%s</body>
</html>
""" % (BANNER.replace("__STAMP__", STAMP), CSP, STYLE, BODY, DATA, SCRIPT)

artifact = "<title>Story Editor</title>\n" + STYLE + BODY + "\n" + DATA + SCRIPT

# ---- the editor as delivered is a PACKED page: the plain page above, compressed with LZMA (much tighter than zip; it costs build time, a few
#      seconds) inside a tiny page that unpacks itself when opened and checks a hash of the result first. The compressed bytes are stored as
#      base64 text, which works from a file and from any web server (the smaller "raw bytes" form fails on a server that sends a UTF-8 header,
#      such as GitHub Pages). The packer and the decoder in lzma/ are copied from https://github.com/JNFoo/JS-modules (tools/lzma-pack).
#      story-editor.plain.html keeps the plain page: size budgets and the tests that read the text use it. Exported games are still zipped by
#      the Export button (core.js), because the browser can zip but has no LZMA compressor.
open(HERE + "story-editor.plain.html", "w", encoding="utf8").write(standalone)
_raw = standalone.encode("utf8")
sys.path.insert(0, HERE + "lzma")
import lzma_pack
os.environ.setdefault("ESBUILD", HERE + "node_modules/.bin/esbuild")   # shrinks the unpacking script; build.py must give the same bytes every run
_page, _info = lzma_pack.pack(_raw, title="Story Editor", encoding="base64", minifier="esbuild", tune=[(1, 0, 0), (2, 0, 0), (3, 0, 0)])   # three settings, 0.5 s; the full 15-setting search (2.7 s) saved at most 100 bytes more
_zipped = _page.decode("latin-1")
open(HERE + "story-editor.html", "w", encoding="utf8").write(_zipped)
print("packed story-editor.html with LZMA (lc=%d pb=%d): %d KB plain -> %d KB" % (_info["lc"], _info["pb"], len(_raw) // 1024, len(_page) // 1024))
open(HERE + "story-editor.artifact.html", "w", encoding="utf8").write(artifact)
print("built story-editor.html (%d KB plain), stamped %s" % (len(standalone.encode("utf8")) // 1024, STAMP))

# ---- size budgets: the finished editor and a few exported games must stay under a ceiling, or the build stops.
#      A ceiling is raised on purpose, here, with a note of why (the table below shows every build how close each one is).
#      budget.mjs makes the numbers from the finished file, using the same function the Export button uses.
#      "Change" is against the previous build (kept in sizes-last.json).
BUDGETS = {  # name: ceiling in bytes (the file itself, not gzip)
    "Editor (story-editor.html)": 620000,   # raised to 620,000 on Oct 14 (owner: "raise ceiling to implement ideas and then we can discuss what to compress or reduce after") for page colors and notes, pinned routes and translations; the owner expects more growth from further UI research, so trimming is a later discussion. Before that 565,000 on Oct 14 for Import Twine (twine.js: file readers, SugarCube and Harlowe macro readers, variables and if / else turned into rules; +50 KB plain, +20 KB packed). Before that: 520,000,   # the plain page (lowered to 520,000 on Oct 14: shortening local names took 42 KB off, which more than paid for the Options → Safety box, its reminder, the revision stamp and the test script; was 545,000, raised to 545,000 on Oct 8 night for the map icon toolbar, start-page rule, drag handles, first-time tour and many more checker rules; raised to 540,000 on Oct 8 evening for the Write-tab batches: page picker, history, side toggles, split, paste, templates, phone bar, wide layout; tightened to 520,000 when they were done; was 500,000 on Oct 8 for the Game tab with its live preview; was 490,000; raised from 470,000 for find and replace, unfinished flags, reach reports, the manuscript, Oct 8 2026; now about 2% headroom, so it stays)
    "Editor as delivered (packed)": 275000, # raised to 275,000 on Oct 14 with the plain page for colors/notes, pinned routes and translations (owner asked to raise first and trim later); was 246,000 for Import Twine (+20 KB); what the file on disk weighs
    "The Keeper\u2019s Light (the built-in example)": 59900,   # raised to 59,900 on Oct 14 with the other games (translation hooks); was 58,600 on Oct 14 with the other two for the recap's "Roads not taken" (about 600 bytes); raised from 57,500 on Oct 14 with the next two (about 400 bytes: back swipe, contrast follows the system, already-taken check mark)
    "Standard 25-page game": 51500,                           # raised to 51,500 on Oct 14 (headroom for the translation hooks in the player); was 50,200, 49,500, 49,000
    "Standard 25-page game, Place code on": 54800,            # raised to 54,800 on Oct 14 with the other games; was 53,500, 53,000, 52,500
}
sizes = json.loads(subprocess.run(["node", HERE + "budget.mjs", HERE + "story-editor.plain.html"], capture_output=True, text=True, check=True).stdout)
rows = [("Editor (story-editor.html)", sizes["editor"])] + [(g["name"], g) for g in sizes["games"]]
import gzip as _gz
_zb = _zipped.encode("utf8")
rows.insert(1, ("Editor as delivered (packed)", {"bytes": len(_zb), "gzip": len(_gz.compress(_zb, 9))}))
try:
    last = json.load(open(HERE + "sizes-last.json"))
except (OSError, ValueError):
    last = {}
print("\nSize budget            bytes     gzip   ceiling  used   change since last build")
over = []
for name, m in rows:
    ceil = BUDGETS.get(name)
    if ceil is None:
        raise SystemExit("BUILD STOPPED: no size ceiling for \"%s\" in BUDGETS (build.py)." % name)
    change = m["bytes"] - last.get(name, m["bytes"])
    print("  %-46s %8d %8d %8d %4d%%   %+d" % (name, m["bytes"], m["gzip"], ceil, round(100 * m["bytes"] / ceil), change))
    if m["bytes"] > ceil:
        over.append("%s is %d bytes over its ceiling of %d" % (name, m["bytes"] - ceil, ceil))
json.dump({n: m["bytes"] for n, m in rows}, open(HERE + "sizes-last.json", "w"), indent=1)
if over:
    raise SystemExit("BUILD STOPPED: over the size budget:\n  " + "\n  ".join(over) + "\n(trim something, or raise the ceiling in BUDGETS with a reason)")
