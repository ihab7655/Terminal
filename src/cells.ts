import {BOLD, RESET} from './style.js';

// ── The cell grid every drawn screen composites onto ─────────────────────────
//
// Screens that layer things — a sky behind a dragon, an aura behind an emblem,
// a ring drawn in three passes — cannot be assembled as styled strings, because
// where the escape sequences fall stops being knowable. They composite onto a
// grid of cells and serialise once, at the end.
//
// It also makes the width exact by construction rather than by a check, which
// is the property the whole frame depends on.

export type Cell = {ch: string; colour: string; bold: boolean};

const BLANK: Cell = {ch: ' ', colour: '', bold: false};

export const makeGrid = (width: number, rows: number): Cell[][] =>
  Array.from({length: rows}, () => Array.from({length: width}, () => BLANK));

/** Draw text. Spaces stay transparent, so whatever is behind shows through. */
export function put(
  grid: Cell[][],
  row: number,
  column: number,
  text: string,
  colour: string,
  bold = false
): void {
  const line = grid[row];
  if (!line) return;
  [...text].forEach((ch, i) => {
    const x = column + i;
    if (ch === ' ' || x < 0 || x >= line.length) return;
    line[x] = {ch, colour, bold};
  });
}

/** Draw text including its spaces, so it clears what it covers. */
export function putOpaque(
  grid: Cell[][],
  row: number,
  column: number,
  text: string,
  colour: string,
  bold = false
): void {
  const line = grid[row];
  if (!line) return;
  [...text].forEach((ch, i) => {
    const x = column + i;
    if (x < 0 || x >= line.length) return;
    line[x] = {ch, colour, bold};
  });
}

export function putLines(
  grid: Cell[][],
  top: number,
  left: number,
  lines: readonly string[],
  colour: string,
  bold = false
): void {
  lines.forEach((line, i) => put(grid, top + i, left, line, colour, bold));
}

export const centred = (text: string, span: number) =>
  ' '.repeat(Math.max(0, Math.floor((span - [...text].length) / 2))) + text;

/**
 * One row of cells as a string, opening a colour only where it changes and
 * closing it at the end. A row never leaves a colour open.
 */
export function render(row: readonly Cell[]): string {
  let out = '';
  let open = '';
  let end = row.length;
  while (end > 0 && row[end - 1]!.ch === ' ') end--;
  for (let x = 0; x < end; x++) {
    const cell = row[x]!;
    const want = cell.ch === ' ' ? '' : (cell.bold ? BOLD : '') + cell.colour;
    if (want !== open) {
      if (open !== '') out += RESET;
      out += want;
      open = want;
    }
    out += cell.ch;
  }
  return open === '' ? out : out + RESET;
}
