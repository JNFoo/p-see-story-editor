import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { buildGame, buildZippedGame, buildGameHtml, createSession, normalizeProject, makeProject, makePassage, makeChoice, makeItem, GAME_PARTS } from '../dist/story-player.mjs';
import { STARTERS } from '../../story-format/dist/story-format.mjs';
import { analyze } from '../../story-check/dist/story-check.mjs';
import { makeGenStory } from '../../qa-kit/src/genstory.mjs';
import { loadEditor } from '../../qa-kit/src/editor-vm.mjs';

const genStory = makeGenStory(normalizeProject);
const ed = loadEditor(['buildGameHtml']);

test('every starter becomes one self-contained page with no network references', () => {
  for (const st of STARTERS) {
    const html = buildGame(st.make());
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<script type="application\/json" id="story-data">/);
    assert.match(html, /Content-Security-Policy/);
    assert.ok(!/(src|href)=["']https?:/i.test(html), `${st.name}: no external files`);
    assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket/.test(html), `${st.name}: no network calls`);
  }
});

test('story text can never close the script tag early', () => {
  const s = makeProject('Evil </script><b>');
  s.passages[0].blocks[0].text = 'x </script><img src=x onerror=alert(1)>   y';
  const html = buildGame(s);
  assert.equal((html.match(/<\/script>/g) || []).length, 2); // the story data block and the game script, nothing more
  assert.ok(!html.includes('<img src=x'));
});

test('a game carries only the features its story uses', () => {
  const plain = buildGame(makeProject('Plain'));
  const quest = buildGame(STARTERS[5].make()); // uses dice checks and a number
  assert.ok(quest.length > plain.length);
  assert.ok(GAME_PARTS.js.feats.dice.length > 100);
  assert.equal(plain.includes(GAME_PARTS.js.feats.dice), false);
  assert.equal(quest.includes(GAME_PARTS.js.feats.dice), true);
});

test('identical output to the editor for the same story and assets', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const p = genStory(seed);
    assert.equal(buildGameHtml(p, { parts: GAME_PARTS }), ed.buildGameHtml(p, { parts: GAME_PARTS }), `seed ${seed}`);
  }
});

test('zipped games are smaller and unzip to the same page', async () => {
  const p = STARTERS[3].make();
  const plain = buildGame(p);
  const zipped = await buildZippedGame(p);
  assert.ok(zipped.length < plain.length);
  const b64 = /id="z">\n([\s\S]*?)<\/script>/.exec(zipped)[1].replace(/\s/g, '');
  assert.equal(inflateRawSync(Buffer.from(b64, 'base64')).toString('utf8'), plain);
});

test('a session plays by the game rules: items unlock choices, numbers change, dice give odds', () => {
  const s = makeProject('Keys');
  const a = s.passages[0];
  a.blocks[0].text = 'Start';
  const key = makeItem('Key', 'object');
  const luck = makeItem('Luck', 'stat');
  luck.lo = 0;
  luck.hi = 5;
  luck.start = 2;
  s.items.push(key, luck);
  const end = makePassage('End');
  end.ending = true;
  const grab = makeChoice('Grab key', a.id);
  grab.gives = [key.id];
  grab.adds = { [luck.id]: 2 };
  const open = makeChoice('Open', end.id);
  open.needs = [key.id];
  open.lock = true;
  open.why = 'You need a key.';
  a.choices.push(open, grab);
  s.passages.push(end);
  const sess = createSession(normalizeProject(s));
  assert.equal(sess.choices[0].locked, true);
  assert.throws(() => sess.choose(0), /locked: You need a key/);
  sess.choose(1);
  assert.equal(sess.choices[0].locked, false);
  assert.deepEqual(sess.inventory, { things: ['Key'], numbers: { Luck: 4 } });
  sess.choose(1);
  sess.choose(1); // luck is capped at 5
  assert.equal(sess.inventory.numbers.Luck, 5);
  sess.choose(0);
  assert.equal(sess.ended, true);
  assert.throws(() => sess.choose(0), /ended/);
});

test('random play never reaches an ending the checker calls unreachable (200 random stories)', () => {
  let a = 7;
  const rng = () => (a = (Math.imul(a, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  let plays = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const p = genStory(seed);
    const never = new Set(analyze(p).endings.filter(e => e.reachable === false).map(e => e.pid));
    for (let run = 0; run < 15; run++) {
      const s = createSession(p, { rng });
      for (let step = 0; step < 60 && !s.ended; step++) {
        const open = s.choices.filter(c => !c.locked);
        if (!open.length) break;
        s.choose(open[Math.floor(rng() * open.length)].index);
      }
      plays++;
      if (s.ended) assert.ok(!never.has(s.page.id), `seed ${seed}: reached ${s.page.name}`);
    }
  }
  assert.ok(plays >= 3000);
});
