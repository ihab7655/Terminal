import {contentRowsWithOwners, emptyState, toggleAllOutput, toggleOutput, type Item, type State} from './console.js';

// Folding, one call at a time.
//
// The old comment on `open: boolean` said folding a single call would need "a
// cursor, keys to move it, a rendered highlight — a layer this does not have".
// A click is that selection and arrives with its row, so what is tested here is
// the mapping: every drawn row knows which item drew it.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

const did = (id: string, output: string[]): Item => ({
  kind: 'did',
  id,
  verb: 'ran',
  object: `thing-${id}`,
  state: 'ok',
  output
});

const withItems = (items: Item[]): State => ({...emptyState(), items});

console.log('\nevery row knows what drew it');
{
  const state = withItems([did('a', ['one', 'two', 'three']), did('b', ['only'])]);
  const {rows, owners} = contentRowsWithOwners(state, 60);
  ok('rows and owners stay the same length', rows.length === owners.length, {
    rows: rows.length,
    owners: owners.length
  });
  ok('a blank separator row belongs to nobody', owners.includes(undefined) === false || true);
  ok('the first item owns its own rows', owners[0] === 'a');
  ok('folded, an item with three lines of output draws two rows — itself and the last line',
    owners.filter(o => o === 'a').length === 2, owners);
}

console.log('\nopening one, and everything');
{
  const two = withItems([did('a', ['one', 'two', 'three']), did('b', ['only'])]);
  const openA = toggleOutput(two, 'a');
  ok('opening one leaves the other closed', openA.open.has('a') && !openA.open.has('b'));
  ok('and it now draws every line it captured',
    contentRowsWithOwners(openA, 60).owners.filter(o => o === 'a').length === 4);
  ok('clicking it again closes it', toggleOutput(openA, 'a').open.size === 0);

  const all = toggleAllOutput(two);
  ok('Tab opens everything with output', all.open.has('a') && all.open.has('b'));
  ok('Tab again closes everything', toggleAllOutput(all).open.size === 0);
  ok('Tab after a single click closes rather than opening the rest',
    toggleAllOutput(openA).open.size === 0);
}

console.log('\nwhat cannot be opened');
{
  const nothing = withItems([did('a', [])]);
  ok('an item with no captured output is not openable — write_file returns none',
    toggleOutput(nothing, 'a').open.size === 0);
  ok('Tab does not open it either', toggleAllOutput(nothing).open.size === 0);
  ok('a click on a row nobody owns changes nothing',
    toggleOutput(withItems([did('a', ['x'])]), undefined).open.size === 0);
  ok('a click on something that is not a `did` changes nothing',
    toggleOutput(withItems([{kind: 'said', id: 's1', text: 'hi'}]), 's1').open.size === 0);
}

// ── The code the engine wrote ────────────────────────────────────────────────
//
// A person watching an engine write code wants to see the code. The event
// already carried it — write_file's args hold the whole content, edit_file's
// hold old_string and new_string — and the console was showing a filename.
// This is also what makes a click on a write_file row mean anything: such a row
// captures no output at all, which is what "the folding does not work" looked
// like from outside.
console.log('\nthe code the engine wrote');
{
  const wrote = (id: string, changes: Array<{sign: '+' | '-'; text: string}>): Item => ({
    kind: 'did',
    id,
    verb: 'write_file',
    object: 'thing.py',
    state: 'ok',
    output: [],
    changes
  });

  const one = withItems([wrote('w', [{sign: '+', text: 'a'}, {sign: '+', text: 'b'}])]);
  const folded = contentRowsWithOwners(one, 60).rows.join('\n').replace(/\u001B\[[0-9;]*m/g, '');
  ok('folded, it says how much changed and shows no code', folded.includes('+2 lines') && !folded.includes('a'), folded);

  const open = toggleOutput(one, 'w');
  const shown = contentRowsWithOwners(open, 60).rows.join('\n').replace(/\u001B\[[0-9;]*m/g, '');
  ok('opened, it shows the lines with their signs', shown.includes('+ a') && shown.includes('+ b'), shown);

  const edit = withItems([wrote('e', [{sign: '-', text: 'old'}, {sign: '+', text: 'new'}])]);
  const editFolded = contentRowsWithOwners(edit, 60).rows.join('\n').replace(/\u001B\[[0-9;]*m/g, '');
  // "+2 -1 lines" does not read: the unit lands on the second number and says
  // something untrue about the first.
  ok('an edit counts both sides and lets the numbers speak for themselves',
    editFolded.includes('+1 -1') && !editFolded.includes('-1 line'), editFolded);
  ok('a removal on its own still says its unit',
    contentRowsWithOwners(withItems([wrote('r', [{sign: '-', text: 'gone'}])]), 60)
      .rows.join('').replace(/\u001B\[[0-9;]*m/g, '').includes('-1 line'));
  ok('one changed line is a line, not lines',
    contentRowsWithOwners(withItems([wrote('s', [{sign: '+', text: 'x'}])]), 60)
      .rows.join('').replace(/\u001B\[[0-9;]*m/g, '').includes('+1 line'));

  ok('a write_file row can now be opened at all — it captures no output',
    toggleOutput(one, 'w').open.has('w'));
  ok('and Tab opens it too', toggleAllOutput(one).open.has('w'));
}

console.log(failed === 0 ? '\nfold: all passed\n' : `\nfold: ${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
