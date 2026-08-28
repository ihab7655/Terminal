import {rail} from './rail.js';

// The rail's one promise: it is exactly as wide as it is told. Everything else
// here is about what gives way when that cannot hold.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '\u2713' : '\u2717'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};
const ESC = String.fromCharCode(27);
const plain = (s: string) => s.split(new RegExp(ESC + '\\[[0-9;]*m', 'g')).join('');
const cols = (s: string) => [...plain(s)].length;

console.log('\nexactly the width it was given');
for (const w of [24, 40, 60, 92, 120]) {
  ok(`at ${w} columns`, cols(rail(w, 'top', 'OVERYOS', 'engine online')) === w,
    cols(rail(w, 'top', 'OVERYOS', 'engine online')));
}
ok('a long title cannot push it past the frame',
  cols(rail(30, 'top', 'a title far longer than this rail can possibly hold', 'busy')) === 30);
ok('zero width draws nothing', rail(0, 'top', 'x') === '');

console.log('\nwhat gives way, in order');
ok('the status goes first, and goes whole \u2014 half a status says nothing',
  !plain(rail(34, 'top', 'OVERYOS / operating console', 'engine online')).includes('engi'),
  plain(rail(34, 'top', 'OVERYOS / operating console', 'engine online')));
ok('the title is cut last, and says it was cut',
  plain(rail(28, 'top', 'a title longer than the room', '')).includes('\u2026'),
  plain(rail(28, 'top', 'a title longer than the room', '')));
ok('with no room to name anything, the corners still hold',
  plain(rail(6, 'top', 'name', 'status')) === '\u256d\u2500\u2500 \u2500\u256e',
  plain(rail(6, 'top', 'name', 'status')));
ok('with no room even for those, it is a rail and nothing else',
  /^[\u2500]+$/.test(plain(rail(4, 'top', 'name', 'status'))), plain(rail(4, 'top', 'name', 'status')));

console.log('\nthe corners say which edge it is');
ok('top opens', plain(rail(30, 'top', 'x')).startsWith('\u256d') && plain(rail(30, 'top', 'x')).endsWith('\u256e'));
ok('bottom closes', plain(rail(30, 'bottom', 'x')).startsWith('\u2570') && plain(rail(30, 'bottom', 'x')).endsWith('\u256f'));
ok('a rail with no title is a plain line between its corners',
  cols(rail(20, 'bottom')) === 20);

console.log(failed === 0 ? '\nrail: all passed\n' : `\nrail: ${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
