// Colour, in one place, and nothing else in this file.
//
// Truecolour only where a colour is meant. The ANSI faint attribute is
// deliberately absent: it is a second, theme-dependent way of saying what a
// colour already says, and laid over the dimmest colour here it can say it
// twice into invisibility.
const ESC = '\u001B';

const fg = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${ESC}[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
};

export const RESET = `${ESC}[0m`;
export const BOLD = `${ESC}[1m`;
export const INVERSE = `${ESC}[7m`;

// ── THE PALETTE IN USE ──────────────────────────────────────────────────────
//
// A mutable object rather than a frozen one, and read fresh on every frame by
// everything that draws — so switching a profile repaints in the new colours at
// the next repaint, with nothing rebuilt and no component told.
//
// It is written by ONE function, `wear()`, called by the loop. Nothing that
// decides anything imports this file, which the boundary test asserts.
export const colour = {
  ink: fg('#d7fff8'),
  muted: fg('#5d837d'),
  dim: fg('#2b4d4a'),
  cyan: fg('#22e7d5'),
  cyanSoft: fg('#3aa99d'),
  amber: fg('#f1b34b'),
  amberDim: fg('#8a6a2f'),
  purple: fg('#9d78ff'),
  red: fg('#ff5d6c'),
  // A change to the code, in the two colours everyone already reads as added
  // and removed. Kept in the same cool register as the rest of this palette
  // rather than borrowed from a terminal's default green/red, which sit beside
  // `ink` like a different program.
  added: fg('#5fd7a0'),
  removed: fg('#e8737f')
};

/** The glyphs in use, same shape as a theme's. Read fresh, like the palette. */
export const mark = {
  ok: '●', failed: '✕', said: '›', steer: '»', asked: '▸',
  chosen: '◆', other: '◈',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as readonly string[],
  corners: ['╭', '╮', '╰', '╯'] as readonly string[],
  rule: '─'
};

/**
 * Put on a theme: colours and glyphs, in place.
 *
 * In place rather than by returning a new object, because everything that draws
 * already holds a reference to these two — and a frame is built fresh from
 * state every time, so the next repaint is simply in the new hand.
 */
export function wear(theme: {
  palette: Record<string, string>;
  marks: {spinner: readonly string[]; corners: readonly string[]; rule: string} & Record<string, unknown>;
}): void {
  for (const [k, hex] of Object.entries(theme.palette))
    (colour as Record<string, string>)[k] = fg(hex);
  for (const [k, v] of Object.entries(theme.marks))
    (mark as Record<string, unknown>)[k] = v;
}

/** Wrap text in a colour and close it. Never leave a colour open across a row. */
export const paint = (text: string, c: string, bold = false) =>
  `${bold ? BOLD : ''}${c}${text}${RESET}`;

/** How wide a styled string actually is on screen. */
export const visibleWidth = (s: string) =>
  [...s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '')].length;
