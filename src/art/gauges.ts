// The two instruments the screen is built from: a braille ring and a meter that
// moves in fractions of a cell. Both are pure — given a value they return lines,
// so the animation is nothing more than calling them with a moving number.

const DOTS = [
  [1, 8],
  [2, 16],
  [4, 32],
  [64, 128]
] as const;

export const RING_COLS = 17;
export const RING_ROWS = 8;
const RING_TICKS = 32;

// Each cell is two dots wide and four tall, so the vertical radius is halved to
// keep a circle from rendering as an upright ellipse.
function ringLayer(from: number, to: number): string[] {
  const width = RING_COLS * 2;
  const height = RING_ROWS * 4;
  const grid = Array.from({length: height}, () => new Array<number>(width).fill(0));
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rx = width / 2 - 1;
  const ry = height / 2 - 1;

  for (let index = from; index < to; index++) {
    const angle = -Math.PI / 2 + (index / RING_TICKS) * Math.PI * 2;
    for (let step = 0.7; step <= 1.001; step += 0.05) {
      const x = Math.round(cx + Math.cos(angle) * rx * step);
      const y = Math.round(cy + Math.sin(angle) * ry * step);
      if (x >= 0 && x < width && y >= 0 && y < height) grid[y]![x] = 1;
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

// The unlit track, drawn once and reused: it never changes.
export const ringTrack = ringLayer(0, RING_TICKS);

export type Ring = {value: string[]; head: string[]};

// `value` is everything lit so far; `head` is the tick at the leading edge,
// returned separately so the sweep can carry a brighter colour than its trail.
export function ring(percent: number): Ring {
  const lit = Math.round((percent / 100) * RING_TICKS);
  return {
    value: lit > 0 ? ringLayer(0, Math.max(0, lit - 1)) : [],
    head: lit > 0 ? ringLayer(lit - 1, lit) : []
  };
}

export function ringCentre(lines: string[], text: string): string[] {
  if (lines.length === 0) return lines;
  const middle = Math.floor(lines.length / 2);
  const chars = [...(lines[middle] ?? ' '.repeat(RING_COLS)).padEnd(RING_COLS, ' ')];
  const start = Math.max(0, Math.floor((RING_COLS - text.length) / 2));
  for (let index = 0; index < text.length; index++) chars[start + index] = text[index]!;
  const copy = [...lines];
  copy[middle] = chars.join('');
  return copy;
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

// A segmented readout rather than a bar chart: fixed instrument cells, with the
// leading one carried separately so it can sit brighter than its trail.
export type Segments = {lit: string; head: string; rest: string};

export function segments(fraction: number, count: number): Segments {
  const on = Math.round(Math.min(1, Math.max(0, fraction)) * count);
  return {
    lit: '\u25B0'.repeat(Math.max(0, on - 1)),
    head: on > 0 ? '\u25B0' : '',
    rest: '\u25B1'.repeat(count - on)
  };
}

// One graduation rail shared by a whole column of readouts, so the scale is
// stated once instead of on every row.
export function graduation(count: number) {
  return Array.from({length: count}, (_, index) =>
    index === 0 || index === count - 1 ? '\u2524' : index % Math.round(count / 4) === 0 ? '\u253C' : '\u2500'
  ).join('').replace(/^\u2524/, '\u251C');
}
