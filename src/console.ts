import {paint, screenSize} from './screen.js';
import {INVERSE, RESET, colour, paint as tint} from './style.js';
import {cell, fit, fitStyled, labelled, wrap} from './text.js';
import {START, reflow, scroll, windowOnto, type ScrollCommand, type Viewport} from './viewport.js';

// The console: state in, one frame out.
//
// Every frame is built from nothing. There is no previous frame to reconcile
// with, no remembered height, and no component that has to be told the window
// changed — a resize simply produces a different list of rows from the same
// state. That is rule 4, and it is a property of building rows fresh rather
// than a thing this file has to remember to do.

export type Tone = 'user' | 'engine' | 'tool' | 'search' | 'event';

export type Block = {
  id: string;
  tone: Tone;
  /** What acted, in the label column. */
  label: string;
  text: string;
  detail?: string[];
  /** A two character mark. The one in flight carries a spinner frame. */
  mark?: string;
};

export type State = {
  /** Everything that has happened, oldest first. Nothing is ever removed. */
  blocks: Block[];
  /** What is happening now, if anything. Drawn under the rest, never stored twice. */
  live: Block | null;
  input: string;
  caret: number;
  view: Viewport;
  spinner: number;
};

export const emptyState = (): State => ({
  blocks: [],
  live: null,
  input: '',
  caret: 0,
  view: START,
  spinner: 0
});

const TONE: Record<Tone, string> = {
  user: colour.ink,
  engine: colour.cyan,
  tool: colour.purple,
  search: colour.amber,
  event: colour.muted
};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const spinnerFrame = (n: number) => SPINNER[n % SPINNER.length]!;

// The house indent, a two character mark and a space, and a name.
const INDENT = 2;
const MARK = 3;
const NAME = 12;
const LABEL = INDENT + MARK + NAME;
const DETAIL = LABEL + 4;

/** One block, as rows. Styling is applied per row so no colour crosses a row boundary. */
function blockRows(block: Block, width: number): string[] {
  const tone = TONE[block.tone];
  const mark = block.mark ?? (block.tone === 'user' ? '::' : '--');
  const label = ' '.repeat(INDENT) + cell(mark, MARK) + cell(block.label, NAME);
  const body = block.tone === 'user' ? colour.ink : colour.cyanSoft;

  const rows = labelled(label, block.text, LABEL, width).map((row, i) =>
    i === 0
      ? tint(row.slice(0, LABEL), tone, true) + tint(row.slice(LABEL), body)
      : ' '.repeat(LABEL) + tint(row.slice(LABEL), body)
  );

  for (const detail of block.detail ?? []) {
    for (const line of wrap(detail, Math.max(1, width - DETAIL))) {
      rows.push(' '.repeat(DETAIL) + tint(line, colour.muted));
    }
  }

  return rows;
}

/** Every row of the conversation, at this width. The viewport decides what is seen. */
export function contentRows(state: State, width: number): string[] {
  const rows: string[] = [];
  for (const block of state.blocks) {
    if (rows.length > 0) rows.push('');
    rows.push(...blockRows(block, width));
  }
  if (state.live) {
    if (rows.length > 0) rows.push('');
    rows.push(...blockRows(state.live, width));
  }
  return rows;
}

/** The composer and what the keys do — always the last two rows of the frame. */
function footerRows(state: State, width: number, above: number, below: number): string[] {
  const before = state.input.slice(0, state.caret);
  const at = state.input.slice(state.caret, state.caret + 1) || ' ';
  const after = state.input.slice(state.caret + 1);

  const prompt = tint('  > ', colour.amber);
  const line =
    state.input.length === 0
      ? prompt + INVERSE + ' ' + RESET + tint(' say something to the engine', colour.muted)
      : prompt + colour.ink + before + INVERSE + at + RESET + colour.ink + after + RESET;

  const keys =
    below > 0
      ? `${below} row${below === 1 ? '' : 's'} below · PgDn follows again · Ctrl+C quit`
      : 'PgUp/PgDn scroll · Home/End jump · Enter sends · Ctrl+C quit';

  return [fitStyled(line, width), tint('  ' + fit(keys, width - 2), colour.dim)];
}

/**
 * The whole frame: exactly as many rows as the window has, every one of them no
 * wider than it. Anything that does not fit is scrolled past, never dropped —
 * `above` and `below` are what the reader is told about the rest.
 */
export function frame(state: State): {rows: string[]; view: Viewport} {
  const {columns, rows: height} = screenSize();
  const width = Math.max(20, columns);
  const bodyRows = Math.max(1, height - 2);

  const content = contentRows(state, width);
  const view = reflow(state.view, content.length, bodyRows);
  const {rows: visible, above, below} = windowOnto(content, view, bodyRows);

  const body = [...visible];
  while (body.length < bodyRows) body.push('');
  if (above > 0) body[0] = tint(`  ↑ ${above} above`, colour.dim);

  return {rows: [...body, ...footerRows(state, width, above, below)], view};
}

/** Draw it. The only place a frame reaches the screen. */
export function draw(state: State): State {
  const {rows, view} = frame(state);
  paint(rows);
  return state.view === view ? state : {...state, view};
}

export const scrollBy = (state: State, command: ScrollCommand): State => {
  const {columns, rows: height} = screenSize();
  const content = contentRows(state, Math.max(20, columns));
  return {...state, view: scroll(state.view, command, content.length, Math.max(1, height - 2))};
};
