import { writeFileSync } from 'node:fs';
import { makeProject, makePassage, makeChoice, makeItem, buildGame, buildZippedGame, createSession } from '../dist/story-player.mjs';

// A story with a dice check: roll two dice, add Courage, reach 9 to beat the dragon.
const story = makeProject('The Dragon');
const [cave] = story.passages;
cave.name = 'Cave mouth';
cave.blocks[0].text = 'Heat rolls out of the cave. Something huge shifts in the dark.';
const courage = makeItem('Courage', 'stat');
courage.lo = 0;
courage.hi = 6;
courage.start = 3;
story.items.push(courage);
const won = makePassage('Victory');
const lost = makePassage('Singed');
won.ending = true;
won.valence = 'good';
won.blocks[0].text = 'The dragon bows its head. The valley is safe.';
lost.ending = true;
lost.valence = 'bad';
lost.blocks[0].text = 'You flee with scorched eyebrows.';
const fight = makeChoice('Face the dragon', won.id);
fight.check = { stat: courage.id, target: 9, fail: lost.id };
cave.choices.push(fight);
story.passages.push(won, lost);

// 1. One offline HTML file. Open it in any browser; it never contacts the internet.
writeFileSync(new URL('dragon.html', import.meta.url), buildGame(story));

// 2. The same game, zipped so it unzips itself when opened (smaller on disk).
const zipped = await buildZippedGame(story);
writeFileSync(new URL('dragon.zipped.html', import.meta.url), zipped);

// 3. Play it from code with the game's own rules (a fixed "random" makes the run repeatable).
const play = createSession(story, { rng: () => 0.5 });
console.log(play.text, play.choices); // odds is the chance of passing the check, in percent
console.log(play.choose(0)); // { roll, passed }
console.log('ended on:', play.page.name, play.ended);
