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

export const colour = {
  ink: fg('#d7fff8'),
  muted: fg('#5d837d'),
  dim: fg('#2b4d4a'),
  cyan: fg('#22e7d5'),
  cyanSoft: fg('#3aa99d'),
  amber: fg('#f1b34b'),
  purple: fg('#9d78ff'),
  red: fg('#ff5d6c')
} as const;

/** Wrap text in a colour and close it. Never leave a colour open across a row. */
export const paint = (text: string, c: string, bold = false) =>
  `${bold ? BOLD : ''}${c}${text}${RESET}`;

/** How wide a styled string actually is on screen. */
export const visibleWidth = (s: string) =>
  [...s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '')].length;
