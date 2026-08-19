// A cell grid the diagnostics screen composes into. Panels are painted over one
// another in a fixed order, so a watermark can sit behind everything and an FUI
// element can overlap a panel edge without either owning a Box.
import {palette} from '../theme/palette.js';

// `dim` is the ANSI faint attribute. Faintness has to be an attribute, not a
// darker hex value: the terminal applies it relative to whatever background
// the user's theme has, which an absolute colour cannot do.
export type Cell = {ch: string; color: string; bold?: boolean; dim?: boolean};
export type Segment = {text: string; color: string; bold?: boolean; dim?: boolean};
export type Row = Segment[];

export const EMPTY: Cell = {ch: ' ', color: palette.shadow};

export function createCanvas(width: number, height: number): Cell[][] {
  return Array.from({length: height}, () => Array.from({length: width}, () => EMPTY));
}

export function paint(
  canvas: Cell[][],
  row: number,
  column: number,
  text: string,
  color: string,
  bold?: boolean,
  dim?: boolean
) {
  const line = canvas[row];
  if (!line) return;
  for (let index = 0; index < text.length; index++) {
    const at = column + index;
    const ch = text[index]!;
    // A space is transparent, so whatever is already there keeps showing.
    if (ch === ' ' || at < 0 || at >= line.length) continue;
    line[at] = {ch, color, bold, dim};
  }
}

// Same as paint(), but a space clears the cell instead of passing through. Used
// where a panel must not let the watermark bleed into its own gaps.
export function paintOpaque(canvas: Cell[][], row: number, column: number, text: string, color: string) {
  const line = canvas[row];
  if (!line) return;
  for (let index = 0; index < text.length; index++) {
    const at = column + index;
    if (at < 0 || at >= line.length) continue;
    line[at] = {ch: text[index]!, color};
  }
}

export function paintLines(
  canvas: Cell[][],
  row: number,
  column: number,
  lines: readonly string[],
  color: string,
  bold?: boolean,
  dim?: boolean
) {
  for (const [index, line] of lines.entries()) paint(canvas, row + index, column, line, color, bold, dim);
}

export function toRows(canvas: Cell[][]): Row[] {
  return canvas.map(cells => {
    const segments: Segment[] = [];
    for (const cell of cells) {
      const last = segments[segments.length - 1];
      if (last && last.color === cell.color && last.bold === cell.bold && last.dim === cell.dim) last.text += cell.ch;
      else segments.push({text: cell.ch, color: cell.color, bold: cell.bold, dim: cell.dim});
    }
    return segments;
  });
}
