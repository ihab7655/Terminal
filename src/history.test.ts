import {NO_HISTORY, next, previous, remember, type History} from './history.js';

// The behaviour every shell taught everyone, asserted the way a person meets it:
// type, send, then reach for the up arrow.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

const sent = (...lines: string[]): History => lines.reduce(remember, NO_HISTORY);

console.log('\nwalking back through what was sent');
ok('up recalls the last line sent',
  previous(sent('build a thing'), '').line === 'build a thing');
ok('up twice reaches the one before it',
  (() => {
    const h = sent('first', 'second');
    const one = previous(h, '');
    return previous(one.history, '').line === 'first';
  })());
ok('at the oldest entry it stays there rather than emptying',
  (() => {
    const h = sent('only');
    const one = previous(h, '');
    return previous(one.history, '').line === 'only';
  })());
ok('with nothing sent yet, up leaves the draft alone',
  previous(NO_HISTORY, 'half a thought').line === 'half a thought');

console.log('\ncoming back');
ok('down returns to the newer entry',
  (() => {
    const h = sent('first', 'second');
    const back = previous(previous(h, '').history, '');
    return next(back.history).line === 'second';
  })());
ok('past the newest entry the unsent draft comes back',
  (() => {
    const one = previous(sent('a goal'), 'a draft I was writing');
    return next(one.history).line === 'a draft I was writing';
  })());
ok('down on a composer that never browsed does nothing to it',
  next(sent('a goal')).line === '');

console.log('\nwhat is worth remembering');
ok('the same line twice in a row is remembered once',
  sent('again', 'again').entries.length === 1, sent('again', 'again').entries);
ok('the same line again later is remembered again',
  sent('a', 'b', 'a').entries.length === 3);
ok('an empty line is not history', sent('').entries.length === 0);
ok('sending returns to the end — up means the thing just sent',
  (() => {
    const browsed = previous(sent('first', 'second'), '');
    const after = remember(browsed.history, 'third');
    return after.at === null && previous(after, '').line === 'third';
  })());
ok('a draft is dropped once a line is sent',
  remember(previous(sent('x'), 'draft').history, 'y').draft === '');

console.log(failed === 0 ? '\nhistory: all passed\n' : `\nhistory: ${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
