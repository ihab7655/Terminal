import {colour, mark as glyph, paint as tint} from '../style.js';
import {fitStyled, wrap} from '../text.js';

// ── ONE VISUAL LANGUAGE FOR EVERY SURFACE ───────────────────────────────────
//
// Twelve places were each choosing their own colours, and four of them had
// settled on flat grey: a screen with no hierarchy, where a value, a label and
// a heading all look alike. That is not twelve designs, it is the absence of
// one.
//
// So the vocabulary lives here, and a surface says what a row IS rather than
// what colour it should be. The semantics, and they are the console's from the
// beginning:
//
//   cyan    what you can act on — a heading, a chosen row, a key
//   ink     the content itself, the thing you came to read
//   amber   a value that carries state, and anything that needs attention
//   red     a refusal, a failure
//   muted   secondary — a label, an explanation
//   dim     chrome — separators, counts, hints
//
// Every builder returns a row already cut to the width, because a row assembled
// from fitted pieces is not a fitted row.

const row = (width: number, ...pieces: string[]): string => fitStyled(pieces.join(''), width);

/** The two-column indent, and one deeper for anything hanging under a row. */
export const PAD = '  ';
export const HANG = '    ';

/** The name of a surface, or of a section inside one. */
export const heading = (width: number, text: string): string =>
  row(width, PAD, tint(text, colour.cyanSoft));

/** What the surface is for, under its name. Said once, quietly. */
export const subtitle = (width: number, text: string): string =>
  row(width, PAD, tint(text, colour.muted));

/**
 * A fact: its label, then its value.
 *
 * The label is secondary and the VALUE is what a person came for, so the value
 * carries the weight. `tone` marks a value that says something about state —
 * forbidden, failed, in use — rather than merely reporting one.
 */
export const LABEL = 16;

export const field = (
  width: number,
  label: string,
  value: string,
  tone: 'plain' | 'state' | 'bad' = 'plain'
): string =>
  row(width, PAD,
    // One column for every label on a surface, so values line up and the eye
    // reads down them. A label longer than the column pushes its own value
    // along rather than being cut — a truncated label names nothing.
    tint(label.length >= LABEL ? label + '  ' : label.padEnd(LABEL), colour.muted),
    tint(value, tone === 'bad' ? colour.red : tone === 'state' ? colour.amber : colour.ink));

/**
 * A row a person can be ON — in a list they are choosing from.
 *
 * The mark and the colour both say it, because a mark survives a screenshot and
 * a colourblind reader, and the colour is what the eye finds first.
 */
export const choice = (
  width: number,
  on: boolean,
  label: string,
  note = '',
  inUse = false
): string =>
  row(width, PAD,
    tint(on ? glyph.chosen : glyph.other, on ? colour.cyan : colour.dim), ' ',
    tint(label, on ? colour.ink : colour.muted),
    inUse ? tint('  ·  ', colour.dim) + tint('in use', colour.cyanSoft) : '',
    note ? tint('   ' + note, colour.dim) : '');

/** A line of explanation, or a hint about what a key will do. */
export const note = (width: number, text: string): string =>
  row(width, PAD, tint(text, colour.dim));

/** Body text that must never be cut — it wraps to whatever width there is. */
export const paragraph = (width: number, text: string, indent = PAD): string[] =>
  wrap(text, Math.max(8, width - indent.length)).map(line => row(width, indent, tint(line, colour.muted)));

/** A blank line. Named, so spacing reads as a decision rather than a typo. */
export const gap = (): string => '';

export {row};
