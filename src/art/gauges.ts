// The instruments the screens are built from: a tick ring and a segmented bar,
// both pure — given a value they return shapes, so an animation is nothing more
// than calling them with a moving number.
//
// The forms come from a reference sheet the owner chose: the 76%/89% bar and
// the 36/67 dial. Two things carry that language into a terminal, and neither
// of them is a glyph nobody's font has:
//
//   * THE BAR IS A GRADIENT, not a fill. On the sheet the lit segments run
//     bright at the tail and darken toward the head. A cell can only be one
//     colour, so the gradient IS the segments — it is what makes a row of
//     identical marks read as a swept instrument rather than a progress bar.
//
//   * THE RING IS TICKS, not an arc. Separate radial strokes with real gaps
//     between them, on two radii, which is what makes the dial read as an
//     instrument face instead of a pie.
//
// Neither knows a colour. They name their parts and the screen decides what
// each part is worth — the same reason the engine does not choose how the
// console phrases it.

const DOTS = [
  [1, 8],
  [2, 16],
  [4, 32],
  [64, 128]
] as const;

// Big enough for the ticks to be ticks. At 17x8 the face was 34x32 dots — a
// circumference of about a hundred, three dots per tick, and no room left for
// the gap between them: it was drawn and it read as a solid ring, which is the
// one thing the reference sheet's dial is not. The size is not decoration; it
// is what the form costs.
export const RING_COLS = 23;
export const RING_ROWS = 11;
const RING_TICKS = 24;

/**
 * One layer of radial strokes as braille lines.
 *
 * `inner`/`outer` are fractions of the radius, so a stroke is a length rather
 * than a wedge, and `duty` is how much of each tick's own arc it fills — below
 * 1 it leaves the gap that makes the face read as ticks. Cells are two dots
 * wide and four tall, so the vertical radius is halved to keep a circle from
 * rendering as an upright ellipse.
 */
function tickLayer(
  from: number,
  to: number,
  inner: number,
  outer: number,
  duty: number,
  ticks = RING_TICKS
): string[] {
  const width = RING_COLS * 2;
  const height = RING_ROWS * 4;
  const grid = Array.from({length: height}, () => new Array<number>(width).fill(0));
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rx = width / 2 - 1;
  const ry = height / 2 - 1;
  const span = (duty / ticks) * Math.PI * 2;

  for (let index = from; index < to; index++) {
    const start = -Math.PI / 2 + (index / ticks) * Math.PI * 2;
    for (let sweep = 0; sweep <= span + 1e-9; sweep += span / 4 || 1) {
      const angle = start + sweep;
      for (let step = inner; step <= outer + 1e-9; step += 0.02) {
        const x = Math.round(cx + Math.cos(angle) * rx * step);
        const y = Math.round(cy + Math.sin(angle) * ry * step);
        if (x >= 0 && x < width && y >= 0 && y < height) grid[y]![x] = 1;
      }
      if (span === 0) break;
    }
  }

  const lines: string[] = [];
  for (let top = 0; top < height; top += 4) {
    let line = '';
    for (let left = 0; left < width; left += 2) {
      let code = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) if (grid[top + dy]?.[left + dx]) code |= DOTS[dy]![dx]!;
      }
      line += code === 0 ? ' ' : String.fromCharCode(0x2800 + code);
    }
    lines.push(line);
  }
  return lines;
}

// The face: a fine outer collar of many short ticks, and the coarse inner track
// the value is read against. Neither changes, so both are drawn once.
export const ringCollar = tickLayer(0, 36, 0.94, 1.0, 0.34, 36);
export const ringTrack = tickLayer(0, RING_TICKS, 0.52, 0.76, 0.42);

export type Ring = {collar: string[]; track: string[]; value: string[]; head: string[]};

/** The dial at a value. `head` is the leading tick alone, so the screen can
 *  carry it brighter than the trail it is pulling. */
export function ring(percent: number): Ring {
  const lit = Math.round((Math.min(100, Math.max(0, percent)) / 100) * RING_TICKS);
  return {
    collar: ringCollar,
    track: ringTrack,
    value: lit > 1 ? tickLayer(0, lit - 1, 0.52, 0.76, 0.42) : [],
    head: lit > 0 ? tickLayer(lit - 1, lit, 0.52, 0.76, 0.42) : []
  };
}

// ── The bar ──────────────────────────────────────────────────────────────────

/**
 * A part of the bar and what it is, never what colour it is.
 *
 * `lit` arrives already split into bands so the screen can run a gradient
 * across them — band 0 is the tail and the last band is nearest the head.
 */
export type BarPart = {text: string; part: 'cap' | 'lit' | 'head' | 'rest'; band: number};

export const BAR_BANDS = 3;

/**
 * The reference bar: a cut leading corner, lit segments in graded bands, a
 * bright head, the unlit track, and a cut trailing corner.
 *
 * The caps are what carry the sheet's cut-corner geometry into a single row —
 * a terminal cell cannot be a parallelogram, but a row that opens and closes on
 * a diagonal reads as one. They are also the whole of the shape: nothing here
 * encloses anything, which is what lets a bar of this language sit in a console
 * that scrolls.
 */
export function bar(fraction: number, width: number): BarPart[] {
  const inner = Math.max(1, width - 2);
  const on = Math.round(Math.min(1, Math.max(0, fraction)) * inner);
  const parts: BarPart[] = [{text: '▞', part: 'cap', band: 0}];

  const trail = Math.max(0, on - 1);
  if (trail > 0) {
    // Split as evenly as the cells allow, largest band first so a short bar
    // still shows its gradient rather than three bands of one.
    let placed = 0;
    for (let band = 0; band < BAR_BANDS; band++) {
      const upto = Math.round(((band + 1) / BAR_BANDS) * trail);
      const length = upto - placed;
      placed = upto;
      if (length > 0) parts.push({text: '▰'.repeat(length), part: 'lit', band});
    }
  }
  if (on > 0) parts.push({text: '▰', part: 'head', band: BAR_BANDS - 1});
  if (inner - on > 0) parts.push({text: '▱'.repeat(inner - on), part: 'rest', band: 0});

  parts.push({text: '▚', part: 'cap', band: 0});
  return parts;
}

// Eighth-width blocks, so a meter advances in fractions of a cell instead of
// jumping a whole one. That is the difference between a bar that slides and a
// bar that stutters.
const PARTIALS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const;

export type Meter = {full: string; edge: string; track: string};

export function meter(fraction: number, width: number): Meter {
  const clamped = Math.min(1, Math.max(0, fraction));
  const eighths = Math.round(clamped * width * 8);
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  const edge = rest > 0 ? PARTIALS[rest]! : '';
  const used = whole + (edge ? 1 : 0);
  return {
    full: '█'.repeat(Math.min(whole, width)),
    edge: used <= width ? edge : '',
    track: '┈'.repeat(Math.max(0, width - used))
  };
}

// One graduation rail shared by a whole column of readouts, so the scale is
// stated once instead of on every row.
export function graduation(count: number) {
  return Array.from({length: count}, (_, index) =>
    index === 0 || index === count - 1 ? '\u2524' : index % Math.round(count / 4) === 0 ? '\u253C' : '\u2500'
  ).join('').replace(/^\u2524/, '\u251C');
}

// The one thing on a screen allowed to move while nothing is finishing, and
// only ever beside something that is genuinely in flight. It lives here rather
// than in a screen because both screens turn it and neither owns it.
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;
export const spinnerFrame = (n: number) => SPINNER[((n % SPINNER.length) + SPINNER.length) % SPINNER.length]!;
