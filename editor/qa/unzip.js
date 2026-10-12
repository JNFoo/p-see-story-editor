/* Exported games are saved zipped (see zippedPage in core.js). A test that wants to READ the game's text calls plain(text) first;
   text that is not a zipped page comes back unchanged. */
const zlib = require('zlib');
exports.plain = text => {
  const m = /<script type="text\/plain" id="z">\n([\s\S]*?)<\/script>/.exec(text);
  return m ? zlib.inflateRawSync(Buffer.from(m[1].replace(/\s+/g, ''), 'base64')).toString('utf8') : text;
};
exports.isZipped = text => /<script type="text\/plain" id="z">/.test(text);
