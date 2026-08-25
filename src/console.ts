import {paint, screenSize} from './screen.js';
import {INVERSE, RESET, colour, paint as tint} from './style.js';
import {cell, fit, fitStyled, wrap} from './text.js';
import {START, reflow, scroll, windowOnto, type ScrollCommand, type Viewport} from './viewport.js';

// The console: content in, one frame out.
//
// Every frame is built from nothing. There is no previous frame to reconcile
// with, no remembered height, and no component that has to be told the window
// changed — a resize simply produces a different list of rows from the same
// state. That is rule 4, and it is a property of building rows fresh rather
// than a thing this file has to remember to do.
//
// WHAT IT HOLDS IS CONTENT, NOT LAYOUT (rule 5). An item says what happened;
// nothing in it says where anything goes. The one measurement taken here is
// the verb column, and it is DERIVED from the verbs the session actually
// contains, at the current width, every frame — not chosen and not remembered.
//
// The shape of the four items came out of pushing a whole session through the
// version before this one and reading it:
//
//   * a failed tool call looked exactly like a successful one, so the state is
//     now the FIRST thing on the row — right-aligning it reads as well and
//     needs arithmetic against the right edge, while a mark in column one is
//     scanned down the page for free
//   * `-- ENGINE` sat on every sentence the engine said. A name that is always
//     there stops being read, and it cost a label column of width; the engine
//     is the default speaker and goes unlabelled
//   * what the user said now has no label column at all, and a mark nothing
//     else uses, so it is the thing the eye finds while scrolling
//   * captured output kept being wrapped, which normalised the leading spaces
//     out of a traceback. Output takes a different path: never wrapped, never
//     touched, cut at the edge like a terminal cuts it

export type ItemState = 'ok' | 'failed' | 'running';

export type Item =
  /** What the person asked for. The anchor of the whole log. */
  | {kind: 'said'; id: string; text: string}
  /**
   * What the engine is doing RIGHT NOW — and only now.
   *
   * Derived from the events that describe a phase rather than a result:
   * `goal.started`, `classification.completed`, `planning.started`/`.finished`,
   * `execution.wave.started`/`.finished`, `worker.spawned`, `checkpoint.saved`.
   * Eight events, one line: each replaces the last instead of appending, because
   * a reader wants to know where the engine is, not read the eight steps it took
   * to get there. `did` accumulates; this does not.
   */
  | {kind: 'phase'; id: string; text: string; detail?: string}
  /**
   * A question that stopped the goal, and the answer if one was given.
   *
   * `clarification.requested` does not merely inform — main-brain.ts:407 returns
   * `awaiting_clarification` and the execution ends there. Rendering it as one
   * more grey note would hide the fact that nothing is running and the engine is
   * waiting on the person.
   */
  | {kind: 'asked'; id: string; question: string; answer?: string}
  /** The engine's own voice. Prose, unlabelled. */
  | {kind: 'spoke'; id: string; text: string}
  /** Short findings under what was just said. */
  | {kind: 'noted'; id: string; lines: string[]}
  /** Something the engine DID, and how it went. */
  | {
      kind: 'did';
      id: string;
      verb: string;
      object: string;
      state: ItemState;
      /** Captured verbatim. Never wrapped, never re-indented. */
      output: string[];
    };

export type State = {
  /** Everything that has happened, oldest first. Nothing is ever removed. */
  items: Item[];
  input: string;
  caret: number;
  view: Viewport;
  spinner: number;
  /** Whether captured output is unfolded. One switch, for everything. */
  open: boolean;
};

export const emptyState = (): State => ({
  items: [],
  input: '',
  caret: 0,
  view: START,
  spinner: 0,
  open: false
});

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const spinnerFrame = (n: number) => SPINNER[n % SPINNER.length]!;

const INDENT = 2;
const MARK = 2;          // a state mark and the space after it
const VERB_LIMIT = 14;
const SAID_LIMIT = 2;    // '› '

/** How wide the verb column is for THIS content. Derived every frame. */
const verbWidth = (items: readonly Item[]) =>
  Math.min(
    VERB_LIMIT,
    Math.max(0, ...items.filter(i => i.kind === 'did').map(i => (i as {verb: string}).verb.length))
  );

function markOf(item: Extract<Item, {kind: 'did'}>, spinner: number) {
  if (item.state === 'running') return {ch: spinnerFrame(spinner), tone: colour.ink};
  if (item.state === 'failed') return {ch: '✕', tone: colour.red};
  return {ch: '✓', tone: colour.cyanSoft};
}

/**
 * How much of an item's captured output is shown.
 *
 * Folded, ONE line: the LAST one, whatever happened. First-line-on-failure was
 * the obvious rule and it is wrong — a traceback ends with the exception and a
 * pytest run ends with "2 failed, 12 passed", while both of them BEGIN with a
 * banner. Watched in a real session, first-line gave "=== test session starts
 * ===" as the report of a failure. A command puts its verdict last. No count. A "⌄ 3 more lines" under every successful call was drawn and watched
 * in a real session, and it put a valueless row under each one — the run of
 * actions, which should scan as a list, came apart into pairs. The footer says
 * Tab unfolds; that is where the affordance belongs, once, not on every row.
 */
function outputRows(
  item: Extract<Item, {kind: 'did'}>,
  open: boolean,
  left: number,
  width: number
): string[] {
  if (item.output.length === 0) return [];
  const room = Math.max(8, width - left);
  const tone = item.state === 'failed' ? colour.red : colour.muted;
  const at = (line: string, c: string) => ' '.repeat(left) + tint(fit(line, room), c);

  if (open) return item.output.map(line => at(line, tone));

  return [at(item.output[item.output.length - 1]!, tone)];
}

function itemRows(item: Item, state: State, width: number, verbs: number): string[] {
  const rows: string[] = [];

  if (item.kind === 'said') {
    const body = Math.max(8, width - INDENT - SAID_LIMIT);
    wrap(item.text, body).forEach((line, i) =>
      rows.push(
        ' '.repeat(INDENT) +
          tint(i === 0 ? '› ' : '  ', colour.amber, true) +
          tint(line, colour.ink, i === 0)
      )
    );
    return rows;
  }

  if (item.kind === 'spoke') {
    const left = INDENT + MARK;
    for (const line of wrap(item.text, Math.max(8, width - left))) {
      rows.push(' '.repeat(left) + tint(line, colour.ink));
    }
    return rows;
  }

  if (item.kind === 'noted') {
    const left = INDENT + MARK;
    for (const note of item.lines) {
      wrap(note, Math.max(8, width - left - 2)).forEach((line, i) =>
        rows.push(
          ' '.repeat(left) + tint(i === 0 ? '· ' : '  ', colour.dim) + tint(line, colour.muted)
        )
      );
    }
    return rows;
  }

  if (item.kind === 'phase') {
    // One line, replaced in place. The mark is the spinner while it is the
    // current phase — the engine is between events, which is exactly when a
    // reader has nothing else to look at.
    const left = INDENT + MARK;
    const head = ' '.repeat(INDENT) + tint(spinnerFrame(state.spinner), colour.cyanSoft) + ' ';
    const body = fit(item.detail ? `${item.text} · ${item.detail}` : item.text, Math.max(8, width - left));
    return [head + tint(body, colour.muted)];
  }

  if (item.kind === 'asked') {
    // The engine stopped and is waiting on the person, so this reads as a
    // question and not as another grey line. Answered, it keeps the answer
    // beneath it — the pair is one exchange.
    const left = INDENT + MARK;
    const rows: string[] = [];
    wrap(item.question, Math.max(8, width - left - 2)).forEach((line, i) =>
      rows.push(
        ' '.repeat(INDENT) + tint(i === 0 ? '? ' : '  ', colour.amber, true) + tint(line, colour.ink)
      )
    );
    for (const line of item.answer ? wrap(item.answer, Math.max(8, width - left - 2)) : []) {
      rows.push(' '.repeat(left) + tint('› ', colour.amber) + tint(line, colour.cyanSoft));
    }
    return rows;
  }

  const mark = markOf(item, state.spinner);
  const left = INDENT + MARK + verbs + 1;
  const body = Math.max(8, width - left);
  const objectTone = item.state === 'ok' ? colour.cyanSoft : colour.ink;

  wrap(item.object, body).forEach((line, i) =>
    rows.push(
      ' '.repeat(INDENT) +
        tint(i === 0 ? mark.ch : ' ', mark.tone, true) +
        ' ' +
        tint(i === 0 ? cell(item.verb, verbs) : ' '.repeat(verbs), colour.muted) +
        ' ' +
        tint(line, objectTone)
    )
  );
  rows.push(...outputRows(item, state.open, left, width));
  return rows;
}

/** Every row of the session, at this width. The viewport decides what is seen. */
export function contentRows(state: State, width: number): string[] {
  const verbs = verbWidth(state.items);
  const rows: string[] = [];
  let previous: Item['kind'] | null = null;

  // A phase describes where the engine IS, so only the last one is true. Eight
  // engine events map to it (goal.started, classification.completed, planning
  // started/finished, wave started/finished, worker.spawned, checkpoint.saved)
  // and rendering all of them would bury the session in its own footsteps.
  //
  // Dropped here rather than at the door: an event that arrived is a fact, and
  // the record keeps it. What a phase is worth is a display decision, and this
  // is where display decisions live (rule 5 — content decides layout; this is
  // content deciding what content means).
  const lastPhase = state.items.map(i => i.kind === 'phase').lastIndexOf(true);
  // A phase is only true while the engine is between events. Once it has
  // spoken — an ending, a question — the phase is over, and a spinner still
  // turning beside it claims work that stopped. Drawn against a real engine,
  // "⠋ planning" sat under a finished goal.
  const endedAfter = state.items.map(i => i.kind === 'spoke' || i.kind === 'asked').lastIndexOf(true);
  const phaseIsStale = endedAfter > lastPhase;

  for (const [index, item] of state.items.entries()) {
    if (item.kind === 'phase' && (index !== lastPhase || phaseIsStale)) continue;
    // Consecutive items OF THE SAME KIND are one block; a change of kind gets
    // air around it. The rule is in the content, not in a spacing table.
    //
    // It used to apply to `did` alone, and drawing a real session showed why
    // that is not enough: a capability journey arrives as five consecutive
    // `noted` lines — the gap found, the catalog declining, the build, the
    // adoption — and a blank line between each broke one story into scraps.
    const together = item.kind === previous && (item.kind === 'did' || item.kind === 'noted');
    if (rows.length > 0 && !together) rows.push('');
    rows.push(...itemRows(item, state, width, verbs));
    previous = item.kind;
  }
  return rows;
}

/** The composer and what the keys do — always the last two rows of the frame. */
function footerRows(state: State, width: number, below: number): string[] {
  const before = state.input.slice(0, state.caret);
  const at = state.input.slice(state.caret, state.caret + 1) || ' ';
  const after = state.input.slice(state.caret + 1);

  const prompt = tint('  › ', colour.amber);
  const line =
    state.input.length === 0
      ? prompt + INVERSE + ' ' + RESET + tint(' say something to the engine', colour.muted)
      : prompt + colour.ink + before + INVERSE + at + RESET + colour.ink + after + RESET;

  const folded = state.items.some(i => i.kind === 'did' && i.output.length > 0);
  const keys =
    below > 0
      ? `${below} row${below === 1 ? '' : 's'} below · PgDn follows again · Ctrl+C quit`
      : folded
        ? `Tab ${state.open ? 'folds' : 'unfolds'} output · PgUp/PgDn scroll · Enter sends · Ctrl+C quit`
        : 'PgUp/PgDn scroll · Home/End jump · Enter sends · Ctrl+C quit';

  return [fitStyled(line, width), tint('  ' + fit(keys, Math.max(1, width - 2)), colour.dim)];
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

  return {rows: [...body, ...footerRows(state, width, below)], view};
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
