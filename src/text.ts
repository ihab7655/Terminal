// Turning text into rows, at the width the window has right now.
//
// This is the whole of layout, and it is a function rather than a component
// tree on purpose: rows are produced fresh every frame from the current width,
// so a resize cannot leave anything behind to reconcile. There is nothing
// remembered between frames to be wrong.
//
// Wrapping is done here rather than left to the terminal, for one reason that
// matters when you own the screen: the frame is painted from HOME with a fixed
// number of rows, so a line the terminal decides to wrap is a row the frame did
// not account for and the bottom of the picture falls off. Every row this
// module returns fits the width it was given.

/** Greedy word wrap. A word longer than the line is broken across as many as it needs. */
export function wrap(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const rows: string[] = [];
  let row = '';

  for (const word of text.split(' ')) {
    if (row === '') row = word;
    else if (row.length + 1 + word.length <= width) row += ' ' + word;
    else {
      rows.push(row);
      row = word;
    }
    while (row.length > width) {
      rows.push(row.slice(0, width));
      row = row.slice(width);
    }
  }

  rows.push(row);
  return rows;
}

/** Cut to fit, with an ellipsis when something was cut. For rows that must not wrap. */
export function fit(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width <= 1) return '…';
  return text.slice(0, width - 1) + '…';
}

/** Pad to exactly `width`, cutting if it is over. Used where a column must line up. */
export function cell(text: string, width: number): string {
  return fit(text, width).padEnd(width, ' ');
}

/**
 * A label column and a body that wraps under itself.
 *
 * The continuation rows are indented to the body's own column rather than left
 * to fall against the frame edge — a wrapped line belongs under the line it
 * continues, and the two are told apart by nothing else.
 */
export function labelled(label: string, body: string, labelWidth: number, width: number): string[] {
  const bodyWidth = Math.max(1, width - labelWidth);
  const lines = wrap(body, bodyWidth);
  return lines.map((line, i) => (i === 0 ? cell(label, labelWidth) : ' '.repeat(labelWidth)) + line);
}
