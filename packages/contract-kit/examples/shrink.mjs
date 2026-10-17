import { agree, agreeAsync } from '../src/contract.mjs';

// A fast price calculator with a bug: it forgets the discount on the item with id 7.
const slow = ({ items }) => items.reduce((sum, i) => sum + i.price * (1 - i.discount), 0);
const fast = ({ items }) => items.reduce((sum, i) => sum + (i.id === 7 ? i.price : i.price * (1 - i.discount)), 0);
const generate = r => ({ items: Array.from({ length: r.int(5, 30) }, () => ({ id: r.int(0, 9), price: r.int(1, 500), discount: r.pick([0, 0.1, 0.5]) })) });

// shrink: true cuts the failing input down to the smallest one that still fails.
const r = agree({ generate, a: fast, b: slow, runs: 200, seed: 1, shrink: true });
console.log(r.ok, 'failed on run', r.failure.n, 'with', r.failure.input.items.length, 'items');
console.log('smallest:', JSON.stringify(r.failure.smallest.input), `(${r.failure.smallest.tries} tries)`);

// tags + expect: say which features the random inputs must contain, so the generator cannot quietly miss them.
const counted = agree({ generate, a: slow, b: slow, runs: 200, tags: i => (i.items.some(x => x.id === 7) ? ['has item 7'] : []), expect: ['has item 7'] });
console.log(counted.ok, counted.tags);

// agreeAsync: the same for functions that return promises (agree itself refuses them).
console.log((await agreeAsync({ generate, a: async i => slow(i), b: async i => slow(i), runs: 50 })).ok);
