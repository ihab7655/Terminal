import chalk from 'chalk';

export type StyledCell = {ch: string; color: string; bold?: boolean; dim?: boolean};

// One <Text> per row, instead of one per colour run.
//
// Ink measures every Text node it is handed with string-width, and the canvas
// screens used to hand it a node per run: a 240 column row of sky breaks into
// roughly forty of them, seventy rows deep, which is some 2,600 nodes a frame.
// Profiled at 240x70, string-width alone was 22% of the samples and the
// allocation behind it pushed the garbage collector to a further 13% — between
// them the render stopped keeping up with the 70ms tick and a frame in eight
// was dropped.
//
// Styling the row into a single string costs one measurement instead of forty.
// The runs themselves are cut exactly where they were before, so the bytes that
// reach the terminal are the same; only the node count changes.
const cache = new Map<string, (text: string) => string>();

function styler(cell: StyledCell) {
  const key = `${cell.color}|${cell.bold ? 1 : 0}|${cell.dim ? 1 : 0}`;
  let paint = cache.get(key);
  if (!paint) {
    let builder = chalk.hex(cell.color);
    if (cell.bold) builder = builder.bold;
    if (cell.dim) builder = builder.dim;
    paint = builder;
    cache.set(key, paint);
  }
  return paint;
}

const sameStyle = (a: StyledCell, b: StyledCell) =>
  a.color === b.color && a.bold === b.bold && a.dim === b.dim;

export function styleRow(cells: readonly StyledCell[]): string {
  // Nothing is painted past the last inked cell, so the row stops there rather
  // than carrying a tail of styled blanks to the terminal.
  let end = cells.length;
  while (end > 0 && cells[end - 1]!.ch === ' ') end--;

  let out = '';
  let index = 0;
  while (index < end) {
    const head = cells[index]!;
    let next = index + 1;
    while (next < end && sameStyle(cells[next]!, head)) next++;

    let text = '';
    let inked = false;
    for (let at = index; at < next; at++) {
      const ch = cells[at]!.ch;
      text += ch;
      if (ch !== ' ') inked = true;
    }
    // A run of blanks has no colour to show, so it goes out bare. Wrapping it
    // in an escape sequence lengthens every frame and changes nothing on screen.
    out += inked ? styler(head)(text) : text;
    index = next;
  }
  // A row of nothing must still BE a row. Ink gives an empty Text no height, so
  // returning '' collapsed every blank line and lifted everything below it: the
  // diagnostics rail, painted at the last canvas row, surfaced nine rows early.
  return out === '' ? ' ' : out;
}
