// The sky the dragon assembles into: a still starfield plus a few drifting
// signal streams. Both are pure functions of (row, column, tick), so the field
// is stable across frames and costs no state.
import {palette} from '../theme/palette.js';

export type SkyMark = {ch: string; color: string};

const STAR_DENSITY = 0.075;
const STREAM_CHANCE = 0.18;

function hash(a: number, b: number, salt: number) {
  let value = (a + 1) * 374761393 + (b + 1) * 668265263 + (salt + 1) * 1442695041;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

// Stars hold their positions and breathe; thinning the field is how it recedes.
function starAt(row: number, column: number, tick: number, level: number): SkyMark | null {
  if (level <= 0 || hash(row, column, 17) >= STAR_DENSITY * level) return null;
  const twinkle = Math.sin(tick / 9 + hash(row, column, 43) * Math.PI * 2);
  if (twinkle > 0.85) return {ch: '+', color: palette.cyanSoft};
  if (twinkle > 0.2) return {ch: ':', color: palette.dim};
  // The faintest phase draws NOTHING. It used to be a dot in a colour darker
  // than the background, which is a bet on the background being black — it
  // showed as a speck on any other. Painting it faint instead was worse: the
  // attribute breaks the styled run at every star, and the segment count per
  // frame rose by half, which is what made the screen judder. Absence costs no
  // segment and is correct on every theme.
  return null;
}

// A minority of rows carry a stream that drifts at its own speed and spacing.
function flowAt(row: number, column: number, tick: number, level: number): SkyMark | null {
  if (level <= 0 || hash(row, 0, 91) >= STREAM_CHANCE * level) return null;
  const speed = 1 + Math.floor(hash(row, 1, 5) * 3);
  const period = 26 + Math.floor(hash(row, 2, 9) * 22);
  const offset = (column + tick * speed) % period;
  if (offset === 0) return {ch: '+', color: palette.cyanSoft};
  if (offset === 1 || offset === 2) return {ch: '-', color: palette.dim};
  return null;
}

export function skyAt(
  row: number,
  column: number,
  tick: number,
  starLevel: number,
  flowLevel: number
): SkyMark | null {
  return flowAt(row, column, tick, flowLevel) ?? starAt(row, column, tick, starLevel);
}
