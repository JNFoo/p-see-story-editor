/* One call from a story to a finished game page.

     const html = buildGame(project);                    // a string: save it as game.html and open it in any browser
     const small = await buildZippedGame(project);        // the same page, zipped so it unzips itself when opened (smaller)

   `project` can be anything normalizeProject accepts (it is cleaned first). Options: { fonts, fontsLite } are CSS strings of @font-face rules
   (data: URLs) if you want the game to carry a font; without them the game uses the device's own font.

   Copyright (c) 2026 LFC Foundry. MIT License. */
import { normalizeProject, buildGameHtml, zipPage, GAME_PARTS } from './generated.js';

export function buildGame(project, opts = {}) {
  return buildGameHtml(normalizeProject(project), { parts: GAME_PARTS, fonts: opts.fonts || '', fontsLite: opts.fontsLite || '' });
}

export async function buildZippedGame(project, opts = {}) {
  return zipPage(buildGame(project, opts));
}
