import {blockTextWidth, GLYPH_HEIGHT, renderBlockText} from './art/blockFont.js';
import {dragonCrossArt} from './art/dragonCrossArt.js';
import {colour, paint as tint} from './style.js';

// ── The opening ──────────────────────────────────────────────────────────────
//
// A state inside the same loop, not a phase and not a second screen. Owning the
// screen is what makes this possible: there is no handover to arrange, because
// nothing is ever handed over — the loop simply builds a different list of rows
// while `done` is false.
//
// It is a pure function of the tick and the size, and it keeps NO measurement.
// The size is read fresh at every frame, so a window resized mid-animation just
// draws differently on the next tick. Rule 4 costs nothing here.
//
// The three drawings below are not a budget and nothing is dropped to fit. They
// are three ways of drawing the same moment, and a size chooses between them
// the way a paragraph chooses a line break — the small one is not the big one
// with pieces missing, it is a whole thing at its own size.

export type Opening = {readonly tick: number; readonly done: boolean};

export const startOpening = (): Opening => ({tick: 0, done: false});
export const skipOpening = (o: Opening): Opening => ({...o, done: true});

/** ~45ms a tick, so the whole thing is a little over two seconds. */
export const TICK_MS = 45;
const SWEEP = 30; // the dragon assembles
const NAME_AT = 24; // the name starts arriving before the sweep ends
const END = 52;

export const advance = (o: Opening): Opening =>
  o.done ? o : {tick: o.tick + 1, done: o.tick + 1 >= END};

const NAME = 'DRAGON';
const TAGLINE = 'an operating engine';

const DRAGON_H = dragonCrossArt.length;
const DRAGON_W = Math.max(...dragonCrossArt.map(l => [...l].length));

// A diagonal sweep: every cell has a moment it arrives, earlier at the top left.
// Scaled so the last cell lands exactly on SWEEP rather than at some number that
// happens to be big enough.
const REACH = (DRAGON_H - 1) * 0.6 + (DRAGON_W - 1) * 0.35;
const arrival = (row: number, col: number) => ((row * 0.6 + col * 0.35) / REACH) * SWEEP;

const centre = (line: string, width: number, visible = [...line].length) => {
  const left = Math.max(0, Math.floor((width - visible) / 2));
  return ' '.repeat(left) + line;
};

/** The dragon, as much of it as has arrived by now. */
function dragonRows(tick: number, width: number): string[] {
  return dragonCrossArt.map((line, row) => {
    const chars = [...line];
    let out = '';
    let drawn = 0;
    for (let col = 0; col < chars.length; col++) {
      if (arrival(row, col) <= tick) {
        out += chars[col];
        drawn++;
      } else {
        out += ' ';
        drawn++;
      }
    }
    return out.trimEnd() === '' ? '' : centre(tint(out.trimEnd(), colour.cyan), width, drawn);
  });
}

// The name, arriving letter by letter. `tick` here is the name's OWN clock, not
// the loop's: it waits for the dragon only when there is a dragon to wait for.
// Tying it to the sweep unconditionally gave a window too short for the dragon
// 1.1 seconds of blank screen before the first letter — an animation of
// nothing, measured on a 44x14 window.
function nameRows(tick: number, width: number): string[] {
  const shown = Math.min(NAME.length, Math.max(0, Math.round(tick / 2)));
  if (shown === 0) return Array.from({length: GLYPH_HEIGHT}, () => '');
  const text = NAME.slice(0, shown);
  const w = blockTextWidth(text);
  return renderBlockText(text).map(line => centre(tint(line, colour.ink, true), width, w));
}

const taglineRow = (tick: number, width: number) =>
  tick < END - 14 ? '' : centre(tint(TAGLINE, colour.muted), width, TAGLINE.length);

const hintRow = (tick: number, width: number) =>
  tick < END - 10 ? '' : centre(tint('press any key', colour.dim), width, 13);

/**
 * Exactly `rows` rows, none wider than `columns`. The caller paints them as any
 * other frame — the opening has no privileges over the screen.
 */
export function openingRows(tick: number, columns: number, rows: number): string[] {
  const width = Math.max(20, columns);
  const big = rows >= DRAGON_H + GLYPH_HEIGHT + 5 && width >= DRAGON_W + 2;
  const medium = rows >= GLYPH_HEIGHT + 4 && width >= blockTextWidth(NAME) + 2;

  const body = big
    ? [...dragonRows(tick, width), '', ...nameRows(tick - NAME_AT, width)]
    : medium
      ? nameRows(tick, width)
      : [centre(tint(NAME, colour.cyan, true), width, NAME.length)];

  const tail = [taglineRow(tick, width), hintRow(tick, width)];
  const block = rows >= body.length + tail.length + 2 ? [...body, '', ...tail] : body;

  // Centred vertically in whatever room there is, and clipped to it. A window
  // too short for the drawing shows its top rather than an apology.
  const top = Math.max(0, Math.floor((rows - block.length) / 2));
  const out = [...Array.from({length: top}, () => ''), ...block].slice(0, rows);
  while (out.length < rows) out.push('');
  return out;
}
