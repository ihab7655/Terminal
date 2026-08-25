// Every row this module returns must fit the width it was given. That is the
// property the frame depends on: the frame is painted from HOME with a fixed
// number of rows, so one row the terminal decides to wrap pushes the bottom of
// the picture off the screen.
import {cell, fit, labelled, wrap, fitStyled, width as columnsOf} from './text.js';

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

console.log('\nfitStyled: visible columns, not characters');
{
  const E = String.fromCharCode(27);
  const red = `${E}[31m`;
  const reset = `${E}[0m`;
  const seen = (s: string) => [...s.replace(new RegExp(E + '\\[[0-9;]*m', 'g'), '')].length;
  const eq = (name: string, got: unknown, want: unknown) =>
    check(name, Object.is(got, want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

  eq('a styled line is cut by what shows, not by its bytes',
    seen(fitStyled(`${red}${'x'.repeat(80)}${reset}`, 44)), 44);
  eq('escapes at the end do not buy extra columns',
    seen(fitStyled(`${red}${'x'.repeat(20)}${reset}${red}${'y'.repeat(60)}${reset}`, 30)), 30);
  eq('a line that fits is returned whole',
    fitStyled(`${red}short${reset}`, 44), `${red}short${reset}`);
  eq('the cut closes the colour it opened',
    fitStyled(`${red}${'x'.repeat(80)}`, 10).endsWith(`${E}[0m`), true);
  eq('plain text behaves as before', seen(fitStyled('x'.repeat(80), 12)), 12);
  eq('zero width is empty', fitStyled(`${red}xxxx`, 0), '');
  eq('exactly the width is not truncated', seen(fitStyled(`${red}${'x'.repeat(12)}`, 12)), 12);
}

// ── columns, not characters ──────────────────────────────────────────────────
//
// From a real Arabic session: `اسمي DeepSeek! 😊 كيف يمكنني مساعدتك اليوم؟`
// came back on screen as `اسمي DeepSeek! 😊st` with the rest orphaned on the
// next row. `.slice()` had cut between the emoji's two code units.
console.log('\ncolumns, not characters');
{
  const halfChar = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  check('an emoji is never cut in half', wrap('a😊b c', 2).every(r => !halfChar.test(r)));
  check('an emoji counts as the two columns it occupies',
    columnsOf('😊') === 2 && columnsOf('a😊') === 3, String(columnsOf('😊')));
  check('Arabic counts one column per letter', columnsOf('مرحبا') === 5, String(columnsOf('مرحبا')));
  check('Arabic diacritics take no column of their own',
    columnsOf('مَرْحَبا') === 5, String(columnsOf('مَرْحَبا')));
  check('fit cuts on a character boundary', !halfChar.test(fit('a😊bcd', 4)), fit('a😊bcd', 4));
  check('fit respects the columns it was given', columnsOf(fit('a😊bcd', 4)) <= 4);
  check('cell pads to the columns it promises, emoji included',
    columnsOf(cell('😊', 5)) === 5, String(columnsOf(cell('😊', 5))));
  check('a character wider than the whole line still terminates', wrap('😊😊', 1).length === 2);
  check('every wrapped row of a mixed Arabic line fits',
    wrap('اسمي DeepSeek! 😊 كيف يمكنني مساعدتك اليوم؟', 20).every(r => columnsOf(r) <= 20));
}

// ── a row is a row ───────────────────────────────────────────────────────────
//
// The engine's summary of a finished goal is several lines. Handed through as
// one "word", its breaks reached the terminal uncounted: the frame said two
// rows, the terminal drew five, and the bottom of the picture fell off screen.
console.log('\na row is a row');
{
  const summary = 'Created `print_numbers.py`\nIt contains:\nfor i in range(1, 11):\n    print(i)';
  const rows = wrap(summary, 60);
  check('no returned row hides a line break', rows.every(r => !/[\r\n]/.test(r)));
  check('each line of the text gets at least its own row', rows.length >= 4, String(rows.length));
  check('a blank line between paragraphs survives as a blank row',
    wrap('one\n\ntwo', 20).length === 3, JSON.stringify(wrap('one\n\ntwo', 20)));
  check('\\r\\n is one break, not two', wrap('a\r\nb', 20).length === 2,
    JSON.stringify(wrap('a\r\nb', 20)));
  check('an indented line keeps its indent',
    wrap('for n in range(3):\n    print(n)', 40)[1] === '    print(n)',
    JSON.stringify(wrap('for n in range(3):\n    print(n)', 40)));
  check('a wrapped indented line keeps it on every row',
    wrap('    one two three four five six', 14).every(r => r.startsWith('    ')),
    JSON.stringify(wrap('    one two three four five six', 14)));
  check('an indent too deep for the line is given up rather than crushing the text',
    wrap('          deep', 12).every(r => r.length <= 12),
    JSON.stringify(wrap('          deep', 12)));
  check('fit turns a break into a space rather than a second row',
    !/[\r\n]/.test(fit('a\nb', 20)), JSON.stringify(fit('a\nb', 20)));
}

console.log(failures === 0 ? '\nall good.\n' : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
