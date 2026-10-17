import { describeChange } from '../dist/story-diff.mjs';

// Two copies of a story, as objects or as JSON text. Only the parts that matter to a story are compared.
const before = {
  id: 'lantern',
  passages: [{ id: 'shore', name: 'The shore', blocks: [{ text: 'A lantern glows.' }], choices: [] }]
};
const after = JSON.parse(JSON.stringify(before));
after.passages.push({ id: 'rocks', name: 'The rocks', blocks: [], choices: [] });

console.log(describeChange(before, after)); // { text: 'Add page “The rocks”', pid: 'rocks' }
console.log(describeChange(after, before)); // { text: 'Delete page “The rocks”', pid: 'rocks' }

// A page that changed: the label says what kind of change, and pid says where.
const edited = JSON.parse(JSON.stringify(before));
edited.passages[0].choices.push({ label: 'Wade out', to: '' });
console.log(describeChange(before, edited)); // { text: 'Add a choice on “The shore”', pid: 'shore' }

// Text that is not a story never throws.
console.log(describeChange('not json', '{}')); // { text: 'Edit the story', pid: '' }
