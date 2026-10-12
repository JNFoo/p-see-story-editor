/* The rules the runner (qa.js) uses to read a suite's printed output. Kept in one small file so they can be tested on made-up lines
   (node lines.js runs that test). Every pattern is anchored to the START of the line, so a passing check whose NAME contains a word
   like "error" or "FAIL" is never mistaken for a failure.

   A suite's output is judged on three things: its exit code, these failing lines, and its count of "PASS " lines against the count of the
   last all-green run (a suite that quietly skips checks is a failure too; see qa.js). */
const FAIL_PATTERNS = [
  /^FAIL /,                  // a check failed: "FAIL <name>"
  /^FAILED\b/, /^\d+ FAILED/, // a suite's closing tally
  /^FAILURES [1-9]/,         // real.js's tally
  /^STOPPED/,                // the runner's own time-out note
  /^SCRIPT ERROR/,           // the suite itself stopped on an exception
  /^[A-Za-z]*Error: /,       // the first line of an uncaught exception ("TypeError: x is not a function", "ProtocolError: ...")
  /^Node\.js v\d/            // the last line node prints after a crash
];
/* Suites that print the page errors they saw ("errors []", "page errors: [] []", "errors: [ 'boom' ]"). Anything other than empty brackets fails. */
const ERRORS_LINE = /^(?:page )?errors:?(.*)$/;

function failLines(out) {
  return out.split('\n').filter(line => {
    if (FAIL_PATTERNS.some(re => re.test(line))) return true;
    const m = ERRORS_LINE.exec(line);
    return !!m && m[1].replace(/\[\]|\s/g, '') !== '';
  });
}
const passCount = out => out.split('\n').filter(l => /^PASS /.test(l)).length;
module.exports = { failLines, passCount };

if (require.main === module) { // node lines.js: the self-test
  const cases = [
    ['PASS a check about an error: message', false], ['PASS FAIL in the name', false], ['  FAIL indented is just text', false],
    ['FAIL reorder page list by drag', true], ['3 FAILED', true], ['FAILURES 2', true], ['FAILURES 0', false], ['ALL PASSED', false],
    ['SCRIPT ERROR Timeout', true], ['TypeError: x is not a function', true], ['Node.js v22.22.0', true], ['STOPPED: took longer', true],
    ['errors []', false], ['page errors: [] []', false], ['errors: []', false], ["errors [ 'boom' ]", true], ["page errors: [] [ 'x' ]", true],
    ['errors: 0 in the name of a story', true], ['an Error: in the middle', false], ['stories: 19', false]
  ];
  let bad = 0;
  for (const [line, want] of cases) if ((failLines(line).length > 0) !== want) { bad++; console.log('WRONG:', JSON.stringify(line), 'should be', want ? 'flagged' : 'ignored'); }
  console.log(bad ? bad + ' wrong' : `lines.js: all ${cases.length} cases right`);
  process.exit(bad ? 1 : 0);
}
