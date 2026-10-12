/* Wraps a finished page into a zipped page, using the same zippedPage() the editor's Export uses (core.js).
   Usage: node zipwrap.mjs "<title>" < base64-of-the-raw-deflated-page   -> prints the zipped page. build.py runs this for the editor itself. */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
const ctx = createContext({ console, TextDecoder });
runInContext(readFileSync(new URL('core.js', import.meta.url), 'utf8') + '\nthis.zippedPage = zippedPage;', ctx);
process.stdout.write(ctx.zippedPage(readFileSync(0, 'utf8').trim(), process.argv[2] || 'Story'));
