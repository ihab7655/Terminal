import {route, type Press, type Where} from './route.js';

// The key table from the design, as a MATRIX: every key against every
// navigation state, asserting what it decides. Pure — no screen, no engine, and
// no console running.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

const key = (over: Partial<Press> = {}): Press => ({name: '', text: '', ctrl: false, ...over});
const where = (over: Partial<Where> = {}): Where => ({
  openingDone: true, place: null, inside: false, launcher: false,
  running: false, waiting: false, composerEmpty: true, ...over
});

const KEYS: Array<[string, Press]> = [
  ['^C', key({ctrl: true, text: 'c'})],
  ['^K', key({ctrl: true, text: 'k'})],
  ['^P', key({ctrl: true, text: 'p'})],
  ['?', key({text: '?'})],
  ['Esc', key({name: 'escape'})],
  ['Enter', key({name: 'enter'})],
  ['Up', key({name: 'up'})],
  ['Down', key({name: 'down'})],
  ['y', key({text: 'y'})],
  ['a letter', key({text: 'x'})]
];

const STATES: Array<[string, Where]> = [
  ['the console', where()],
  ['a place open', where({place: 'help'})],
  ['a place with something open inside it', where({place: 'conversations', inside: true})],
  ['the launcher up', where({launcher: true})],
  ['a goal running', where({running: true})],
  ['a call waiting', where({waiting: true, running: true})],
  ['the opening', where({openingDone: false})]
];

console.log('\nthe whole matrix — every key against every state');
const table: Record<string, Record<string, string>> = {};
for (const [kn, k] of KEYS) {
  table[kn] = {};
  for (const [sn, w] of STATES) table[kn]![sn] = route(k, w).do;
}

ok('^C quits from everywhere, including the opening',
  STATES.every(([sn]) => table['^C']![sn] === 'quit'));
ok('the opening swallows every other key, and only to skip itself',
  KEYS.filter(([n]) => n !== '^C').every(([n]) => table[n]!['the opening'] === 'skip-opening'));

console.log('\nEsc clears the innermost thing, and nothing further');
ok('a place first', table['Esc']!['a place open'] === 'close-place');
ok('and what is open INSIDE a place before the place itself',
  table['Esc']!['a place with something open inside it'] === 'close-inside');
ok('but ^K still leaves the place whole — it is a way somewhere else, not back',
  table['^K']!['a place with something open inside it'] === 'close-place');
ok('then the launcher', table['Esc']!['the launcher up'] === 'close-launcher');
ok('then the running goal', table['Esc']!['a goal running'] === 'stop-goal');
ok('and with nothing open and nothing running it does nothing',
  table['Esc']!['the console'] === 'compose');

console.log('\nwhat is open owns the keyboard');
ok('^K opens the launcher from the console', table['^K']!['the console'] === 'open-launcher');
ok('and closes it when it is up', table['^K']!['the launcher up'] === 'close-launcher');
ok('and leaves a place, back to it', table['^K']!['a place open'] === 'close-place');
ok('Enter confirms in a place and in the launcher',
  table['Enter']!['a place open'] === 'confirm' && table['Enter']!['the launcher up'] === 'confirm');
ok('and sends in the console', table['Enter']!['the console'] === 'compose');
ok('arrows choose while something is open',
  table['Up']!['the launcher up'] === 'choose' && table['Down']!['a place open'] === 'choose');
ok('and reach the composer otherwise — where they recall what was typed',
  table['Up']!['the console'] === 'compose');

console.log('\nthe two direct keys, and the one that cannot exist');
ok('^P goes straight to what it may do',
  route(key({ctrl: true, text: 'p'}), where()).do === 'open-place');
ok('? opens the key sheet on an empty line',
  route(key({text: '?'}), where()).do === 'open-place');
ok('but a question mark inside a sentence is a question mark',
  route(key({text: '?'}), where({composerEmpty: false})).do === 'compose');

console.log('\nanswering a held call');
ok('y answers only while one is held', table['y']!['a call waiting'] === 'answer');
ok('and is ordinary text every other moment', table['y']!['the console'] === 'compose');
ok('all four answers are heard',
  ['y', 'c', 'r', 'n'].every(t => route(key({text: t}), where({waiting: true})).do === 'answer'));
ok('and a letter that is not one of them is not',
  route(key({text: 'x'}), where({waiting: true})).do === 'compose');

console.log('\nevery cell of the matrix is decided — none falls through');
const cells = KEYS.length * STATES.length;
const decided = Object.values(table).flatMap(r => Object.values(r)).filter(Boolean).length;
ok(`${cells} cells, all answered`, decided === cells, {cells, decided});

console.log(failed === 0 ? '\nroute: all passed\n' : `\nroute: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
