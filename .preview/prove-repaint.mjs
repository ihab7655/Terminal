import {screenOf} from './screen-of.mjs';
const E = String.fromCharCode(27);
const COLS = 40, ROWS = 6;

const wide = ['the engine read the whole file here', 'second line, also quite long here'];
const narrow = ['short', 'tiny'];

// The version this project shipped until now.
const oldPaint = rows => `${E}[?2026h${E}[H` + rows.join('\n') + `${E}[J${E}[?2026l`;
// The version above.
const newPaint = rows => {
  let f = `${E}[?2026h`;
  rows.forEach((row, i) => { f += `${E}[${i + 1};1H` + row + ' '.repeat(Math.max(0, COLS - row.length)); });
  return f + `${E}[J${E}[?2026l`;
};

// The property: after a narrower frame lands on a wider one, the screen shows
// the narrower frame and nothing else. `join with newlines` is kept here as the
// counter-example, so the test states what the defect WAS as well as what the
// fix does — this is the one that made the console unusable at every zoom.
console.log('\nrepaint: a shorter frame leaves nothing of the longer one');
let failed = 0;
for (const [name, paint, shouldBeClean] of [
  ['join with newlines leaves stale text', oldPaint, false],
  ['position and pad leaves a clean screen', newPaint, true]
]) {
  const screen = screenOf(paint(wide) + paint(narrow), COLS, ROWS);
  const clean = screen.every((line, i) => line === (narrow[i] ?? ''));
  const ok = clean === shouldBeClean;
  if (!ok) failed++;
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${name}`);
  if (!ok) screen.slice(0, 3).forEach((l, i) => console.log(`      ${i}| ${JSON.stringify(l)}`));
}
console.log(failed === 0 ? '\nall good.\n' : `\n${failed} failed.\n`);
process.exit(failed === 0 ? 0 : 1);
