// Every row this module returns must fit the width it was given. That is the
// property the frame depends on: the frame is painted from HOME with a fixed
// number of rows, so one row the terminal decides to wrap pushes the bottom of
// the picture off the screen.
import {cell, fit, labelled, wrap} from './text.js';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : '   ' + detail}`);
};

const SAMPLE =
  'The engine read the file, found the defect in the third branch, and rewrote it. ' +
  'A supercalifragilisticexpialidociouslyLongTokenThatCannotBeBrokenOnSpaces follows.';

console.log('\nno row is ever wider than the width it was given');
for (const width of [10, 17, 23, 40, 61, 80, 120]) {
  const rows = wrap(SAMPLE, width);
  const worst = Math.max(...rows.map(r => r.length));
  check(`wrap at ${String(width).padStart(3)}  → ${String(rows.length).padStart(2)} rows, widest ${worst}`, worst <= width);
}

console.log('\nnothing is lost by wrapping');
{
  const rejoined = wrap(SAMPLE, 23).join(' ').replace(/\s+/g, ' ');
  const original = SAMPLE.replace(/\s+/g, ' ');
  // A broken long word gains no spaces, so compare with spaces removed.
  check('every character survives', rejoined.replace(/ /g, '') === original.replace(/ /g, ''));
}

console.log('\nfit and cell');
for (const width of [1, 2, 5, 12, 40]) {
  check(`fit to ${width}`, fit(SAMPLE, width).length <= width);
  check(`cell is exactly ${width}`, cell(SAMPLE, width).length === width);
}
check('short text is untouched', fit('short', 40) === 'short');

console.log('\na wrapped body stays under its own column');
{
  const rows = labelled(':: YOU', SAMPLE, 15, 60);
  const starts = rows.map(r => r.length - r.trimStart().length);
  check('first row carries the label', rows[0]!.startsWith(':: YOU'));
  check('every continuation begins at column 15', starts.slice(1).every(s => s === 15), starts.join(','));
  check('no row exceeds 60', Math.max(...rows.map(r => r.length)) <= 60);
}

console.log('\nthe widths a real window can be');
for (const width of [20, 34, 40, 62, 90, 200]) {
  const rows = labelled('-- ENGINE', SAMPLE, 15, width);
  check(`labelled at ${String(width).padStart(3)} fits`, Math.max(...rows.map(r => r.length)) <= width);
}

console.log(failures === 0 ? '\nall good.\n' : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
