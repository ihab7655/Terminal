// ── APPEARANCE, AND ONLY APPEARANCE ─────────────────────────────────────────
//
// A theme in a terminal is not a palette. Layout is forbidden to it — the
// content decides the layout — so what is left is COLOUR and the GLYPH
// VOCABULARY: the state marks, the rail corners, the spinner, the caret.
// Change those two and it is a different instrument. Change only the colours
// and it is the same instrument repainted.
//
// NOTHING HERE IS READ BY ANYTHING THAT DECIDES. This module imports nothing
// and is imported only by what draws. A permission never asks what colour the
// screen is, and the boundary test asserts it.

export type Palette = {
  readonly ink: string;
  readonly muted: string;
  readonly dim: string;
  readonly cyan: string;
  readonly cyanSoft: string;
  readonly amber: string;
  readonly amberDim: string;
  readonly purple: string;
  readonly red: string;
  readonly added: string;
  readonly removed: string;
};

/** The glyphs a theme speaks in. Same meanings, different hand. */
export type Marks = {
  readonly ok: string;
  readonly failed: string;
  readonly said: string;
  readonly steer: string;
  readonly asked: string;
  readonly chosen: string;
  readonly other: string;
  readonly spinner: readonly string[];
  /** top-left, top-right, bottom-left, bottom-right, and the line between. */
  readonly corners: readonly [string, string, string, string];
  readonly rule: string;
};

export type Theme = {readonly id: string; readonly palette: Palette; readonly marks: Marks};

const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

/** What ships: cool cyan on a deep teal-black. Quiet, and made for hours. */
export const phosphor: Theme = {
  id: 'phosphor',
  palette: {
    ink: '#d7fff8', muted: '#5d837d', dim: '#2b4d4a',
    cyan: '#22e7d5', cyanSoft: '#3aa99d',
    amber: '#f1b34b', amberDim: '#8a6a2f', purple: '#9d78ff',
    red: '#ff5d6c', added: '#5fd7a0', removed: '#e8737f'
  },
  marks: {
    ok: '●', failed: '✕', said: '›', steer: '»', asked: '▸',
    chosen: '◆', other: '◈', spinner: BRAILLE,
    corners: ['╭', '╮', '╰', '╯'], rule: '─'
  }
};

/**
 * The same instrument in daylight.
 *
 * Ink on cool paper, one deep teal accent. For a bright room and for sharing a
 * screen — the console owns the whole display, so the terminal's own light
 * theme never reaches it. Marks unchanged: this is a change of light, not of
 * hand.
 */
export const vellum: Theme = {
  id: 'vellum',
  palette: {
    ink: '#12211f', muted: '#5c7370', dim: '#a9bab7',
    cyan: '#0f6f66', cyanSoft: '#137d72',
    amber: '#9a6b12', amberDim: '#b89a5e', purple: '#5b46a8',
    red: '#b03a3a', added: '#1f7a4d', removed: '#a33b3b'
  },
  marks: phosphor.marks
};

/**
 * Brass and bone on a neutral black — machined, not neon, and deliberately not
 * green-on-black.
 *
 * Heavier marks and a double-struck rail, so it reads as a different instrument
 * at a glance rather than the same one recoloured.
 */
export const hacker: Theme = {
  id: 'hacker',
  palette: {
    ink: '#ece8e1', muted: '#8a8f99', dim: '#3a3a42',
    cyan: '#c8963e', cyanSoft: '#a87c33',
    amber: '#e0a020', amberDim: '#8a6a2f', purple: '#9b7bd4',
    red: '#d4453e', added: '#b9a05a', removed: '#d4453e'
  },
  marks: {
    ok: '◆', failed: '◇', said: '❯', steer: '❱', asked: '▰',
    chosen: '▰', other: '▱',
    spinner: ['▰▱▱', '▱▰▱', '▱▱▰', '▱▰▱'],
    corners: ['╔', '╗', '╚', '╝'], rule: '═'
  }
};

export const themes: ReadonlyMap<string, Theme> = new Map([
  [phosphor.id, phosphor],
  [vellum.id, vellum],
  [hacker.id, hacker]
]);

export const themeFor = (id: string | undefined): Theme => themes.get(id ?? '') ?? phosphor;
