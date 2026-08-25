import {NO_HISTORY, type History} from './history.js';
import {RAIL_ROWS, rail} from './rail.js';
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

/** One line the engine added to or removed from a file. */
export type Change = {readonly sign: '+' | '-'; readonly text: string};

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
  | {kind: 'phase'; id: string; text: string; detail?: string; since?: number}
  /**
   * A question that stopped the goal, and the answer if one was given.
   *
   * `clarification.requested` does not merely inform — main-brain.ts:407 returns
   * `awaiting_clarification` and the execution ends there. Rendering it as one
   * more grey note would hide the fact that nothing is running and the engine is
   * waiting on the person.
   */
  | {
      kind: 'asked';
      id: string;
      question: string;
      /** Which execution is waiting. ADR-011 puts it on every event's envelope,
       *  and without it an answer has nowhere to go. */
      goalId: string;
      answer?: string;
    }
  /** The engine's own voice. Prose, unlabelled. */
  | {kind: 'spoke'; id: string; text: string}
  /** Short findings under what was just said. */
  | {kind: 'noted'; id: string; lines: string[]}
  /** Something the engine DID, and how it went. */
  | {
      kind: 'did';
      id: string;
      /**
       * What this call changed in the code, when it changed code.
       *
       * Folded, it is one line saying how much: `+3 -1`. Opened — Tab, or a
       * click on the row — it is the lines themselves. That is the whole reason
       * a click on a `write_file` row does anything at all: before this, such a
       * row had no captured output and nothing to show, which is exactly what
       * "the folding does not work" looked like from outside.
       */
      changes?: readonly Change[];
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
  /**
   * The clock the frame is drawn against, in ms.
   *
   * Held in state rather than read from `Date.now()` while drawing, so a frame
   * stays a pure function of state — the property every test here depends on.
   * It is advanced by the same tick that turns the spinner, which is exactly
   * when a duration on screen could have changed.
   */
  now: number;
  /**
   * Which `did` items are showing all of their captured output.
   *
   * It used to be one boolean for the whole session, and its comment said why:
   * "folding one call at a time would need a selection — a cursor, keys to move
   * it, a rendered highlight — and that is a layer this does not have yet."
   * A click IS that selection, and it arrives with the row it happened on. So
   * the layer never had to be built: Tab still opens or closes everything, and
   * a click opens or closes the one thing under the pointer.
   */
  open: ReadonlySet<string>;
  /** What was typed and sent before, and where the arrows have walked to. */
  history: History;
  /**
   * Whether a goal is running that Esc could stop.
   *
   * Content, not layout (rule 5): the footer offers the key only while there is
   * something for it to do. It is told rather than derived, because "running"
   * is the console's own fact — it holds the goal id it submitted — and no item
   * in the log carries it: a goal that has finished and one still working leave
   * the same trail behind them.
   */
  stoppable: boolean;
};

export const emptyState = (): State => ({
  items: [],
  input: '',
  caret: 0,
  view: START,
  spinner: 0,
  now: Date.now(),
  history: NO_HISTORY,
  open: new Set<string>(),
  stoppable: false
});

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const spinnerFrame = (n: number) => SPINNER[n % SPINNER.length]!;

/**
 * The phase still worth drawing, or -1.
 *
 * A phase is only true while the engine is between events. Once it has spoken
 * — an ending, a question — the phase is over, and a spinner still turning
 * beside it claims work that stopped. Drawn against a real engine, "⠋ planning"
 * sat under a finished goal.
 */
function livePhaseIndex(items: readonly Item[]): number {
  const lastPhase = items.map(i => i.kind === 'phase').lastIndexOf(true);
  if (lastPhase === -1) return -1;
  const endedAfter = items.map(i => i.kind === 'spoke' || i.kind === 'asked').lastIndexOf(true);
  return endedAfter > lastPhase ? -1 : lastPhase;
}

/**
 * Is anything on screen carrying a turning mark right now?
 *
 * The clock that advances the spinner asks this, so that "what turns" is
 * decided once, here, beside the drawing that turns it. It used to be a second
 * opinion in index.ts — `some(i => i.kind === 'did' && i.state === 'running')`
 * — which left out the phase line entirely. The result was the console at its
 * least reassuring: while the engine planned, for over a minute, the mark
 * beside "planning" was frozen and the screen looked hung.
 */
export const anythingTurning = (items: readonly Item[]): boolean =>
  livePhaseIndex(items) !== -1 || items.some(i => i.kind === 'did' && i.state === 'running');

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
  const room = Math.max(8, width - left);
  const tone = item.state === 'failed' ? colour.red : colour.muted;
  const at = (line: string, c: string) => ' '.repeat(left) + tint(fit(line, room), c);

  // The code first, when there is code: it is what the call was FOR. Captured
  // output is what happened around it.
  const changed = changeRows(item, open, left, room);

  if (item.output.length === 0) return changed;
  if (open) return [...changed, ...item.output.map(line => at(line, tone))];
  return [...changed, at(item.output[item.output.length - 1]!, tone)];
}

/** The change this call made: a count while folded, the lines while open. */
function changeRows(
  item: Extract<Item, {kind: 'did'}>,
  open: boolean,
  left: number,
  room: number
): string[] {
  const changes = item.changes ?? [];
  if (changes.length === 0) return [];

  if (!open) {
    // Folded, it says how much changed and nothing else. A first line of code
    // as a preview would be a sample the reader cannot trust — code is only
    // meaningful whole, which is what opening it is for.
    const added = changes.filter(c => c.sign === '+').length;
    const removed = changes.length - added;
    const parts = [
      added > 0 ? tint(`+${added}`, colour.added) : '',
      removed > 0 ? tint(`-${removed}`, colour.removed) : ''
    ].filter(Boolean);
    return [' '.repeat(left) + parts.join(' ') + tint(added + removed === 1 ? ' line' : ' lines', colour.dim)];
  }

  // Open: the sign is column one of the line, where it is scanned down the page
  // for free — the same reason the state mark leads a `did` row. Never wrapped,
  // and cut at the edge like a terminal cuts a long line, because re-flowing
  // code silently changes what it says.
  return changes.map(
    c =>
      ' '.repeat(left) +
      tint(c.sign + ' ', c.sign === '+' ? colour.added : colour.removed) +
      tint(fit(c.text, Math.max(4, room - 2)), c.sign === '+' ? colour.added : colour.removed)
  );
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
    // HOW LONG THIS HAS BEEN GOING ON, once it has been going on long enough to
    // wonder. Planning a real goal runs past a minute, and a turning mark alone
    // says "not frozen" without saying "still working, and this is how long".
    // Under the threshold nothing is shown: a duration that appears beside every
    // passing phase is noise, and it would flicker on and off as fast as the
    // engine moves between them.
    const seconds = item.since === undefined ? 0 : Math.floor((state.now - item.since) / 1000);
    const elapsed = seconds >= 3 ? `${seconds}s` : undefined;
    const detail = [item.detail, elapsed].filter(Boolean).join(' · ');
    const body = fit(detail ? `${item.text} · ${detail}` : item.text, Math.max(8, width - left));
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
  rows.push(...outputRows(item, state.open.has(item.id), left, width));
  return rows;
}

/** Every row of the session, at this width. The viewport decides what is seen. */
export function contentRows(state: State, width: number): string[] {
  return contentRowsWithOwners(state, width).rows;
}

/**
 * The same rows, plus which item each one came from.
 *
 * Built by the one walk that builds the rows rather than by a second pass that
 * would have to re-derive the same skipping and spacing rules — and drift from
 * them. `undefined` is a row no item owns: the blank line between blocks.
 */
export function contentRowsWithOwners(
  state: State,
  width: number
): {rows: string[]; owners: (string | undefined)[]} {
  const verbs = verbWidth(state.items);
  const rows: string[] = [];
  const owners: (string | undefined)[] = [];
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
  const lastPhase = livePhaseIndex(state.items);
  const phaseIsStale = lastPhase === -1;

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
    if (rows.length > 0 && !together) {
      rows.push('');
      owners.push(undefined);
    }
    const drawn = itemRows(item, state, width, verbs);
    rows.push(...drawn);
    for (let n = 0; n < drawn.length; n++) owners.push(item.id);
    previous = item.kind;
  }
  return {rows, owners};
}

/**
 * Which item is under a click, or undefined.
 *
 * `row` is 1-based, as a terminal reports it. The window's own offset is what
 * turns that into a position in the content — the same offset the frame was
 * drawn with, so what a person points at is what they hit.
 */
export function itemAtRow(state: State, row: number): string | undefined {
  const {columns, rows: height} = screenSize();
  const bodyRows = Math.max(1, height - 2);
  if (row < 1 || row > bodyRows) return undefined; // the footer, or off the frame
  const {owners} = contentRowsWithOwners(state, Math.max(20, columns));
  const view = reflow(state.view, owners.length, bodyRows);
  const start = Math.max(0, Math.min(view.offset, Math.max(0, owners.length - bodyRows)));
  return owners[start + row - 1];
}

/** Is there anything under this row to open — captured output, or a change? */
const foldable = (item: Extract<Item, {kind: 'did'}>): boolean =>
  item.output.length > 0 || (item.changes?.length ?? 0) > 0;

/** Open a `did` item's detail, or close it. Anything else is left alone. */
export function toggleOutput(state: State, itemId: string | undefined): State {
  const item = state.items.find(i => i.id === itemId);
  if (!item || item.kind !== 'did' || !foldable(item)) return state;
  const open = new Set(state.open);
  if (!open.delete(item.id)) open.add(item.id);
  return {...state, open};
}

/** Tab: everything with output, or nothing. */
export function toggleAllOutput(state: State): State {
  if (state.open.size > 0) return {...state, open: new Set<string>()};
  const withOutput = state.items.filter(i => i.kind === 'did' && foldable(i));
  return {...state, open: new Set(withOutput.map(i => i.id))};
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

  const folded = state.items.some(i => i.kind === 'did' && foldable(i));
  // Esc is offered only while something is running — the one key here that is
  // sometimes meaningless, and a key that does nothing should not be advertised.
  const quit = state.stoppable ? 'Esc stops · Ctrl+C quit' : 'Ctrl+C quit';
  // Offered only once there is something to walk back to, same rule as Esc.
  const recall = state.history.entries.length > 0 ? '↑↓ recalls · ' : '';
  const keys =
    below > 0
      ? `${below} row${below === 1 ? '' : 's'} below · PgDn follows again · ${quit}`
      : folded
        ? `Tab ${state.open.size > 0 ? 'folds' : 'unfolds'} output · click a row · ${recall}${quit}`
        : `${recall}PgUp/PgDn scroll · Home/End jump · Enter sends · ${quit}`;

  // The keys ride the rail that closes the console, so they are returned bare —
  // the rail does the framing, and a second indent inside it would set them off
  // from a line they are meant to sit in.
  return [fitStyled(line, width), keys];
}

/**
 * The whole frame: exactly as many rows as the window has, every one of them no
 * wider than it. Anything that does not fit is scrolled past, never dropped —
 * `above` and `below` are what the reader is told about the rest.
 */
export function frame(state: State): {rows: string[]; view: Viewport} {
  const {columns, rows: height} = screenSize();
  const width = Math.max(20, columns);
  // The rail above, the transcript, the composer, and the rail that closes it —
  // the arrangement the prototype this console's design comes from uses on
  // every screen (trakdem, src/console/ConsoleShell.tsx). The chrome is two
  // rows, and rule 3 still holds inside them: the transcript scrolls, it is
  // never shed.
  const bodyRows = Math.max(1, height - 2 - RAIL_ROWS * 2 - 1);

  const content = contentRows(state, width);
  const view = reflow(state.view, content.length, bodyRows);
  const {rows: visible, above, below} = windowOnto(content, view, bodyRows);

  const body = [...visible];
  while (body.length < bodyRows) body.push('');
  if (above > 0) body[0] = tint(`  ↑ ${above} above`, colour.dim);

  const [composer, keys] = footerRows(state, width, below);
  // A plain line between the transcript and the composer, as the prototype
  // draws it: what has been said is finished, what is being typed is not, and
  // the two are different kinds of thing sharing one screen. It costs a row of
  // transcript, which is why it is the last piece of chrome added and the first
  // that would go.
  const divider = tint('─'.repeat(width), colour.dim);
  return {
    rows: [
      rail(width, 'top', identity(state), status(state)),
      ...body,
      divider,
      composer!,
      rail(width, 'bottom', keys!)
    ],
    view
  };
}

/** What this console is, said once, at the top. */
const identity = (state: State): string =>
  state.items.length === 0 ? 'DRAGON / console' : 'DRAGON / operating console';

/**
 * What it is doing, at the far end of the same line.
 *
 * The rail drops a status whole before it cuts the title, so this says one
 * thing at a time and says it plainly. It is read from the same facts the body
 * is drawn from — never a second source that could disagree with the screen.
 */
function status(state: State): string {
  if (state.stoppable) return 'working';
  const spoke = [...state.items].reverse().find(i => i.kind === 'spoke' || i.kind === 'asked');
  if (spoke?.kind === 'asked' && spoke.answer === undefined) return 'waiting on you';
  if (state.items.some(i => i.kind === 'noted' && i.id === 'engine-failed')) return 'no engine';
  return state.items.length === 0 ? 'ready' : 'idle';
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
