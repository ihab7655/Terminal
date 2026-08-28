import {actionsOf, isRunning, sentenceOf, type Action} from './action.js';
import {NO_HISTORY, type History} from './history.js';
import {RAIL_ROWS, rail} from './rail.js';
import {paint, screenSize} from './screen.js';
import {INVERSE, RESET, colour, paint as tint} from './style.js';
import {cell, fit, fitStyled, wrap} from './text.js';
import {START, reflow, scroll, windowOnto, type ScrollCommand, type Viewport} from './viewport.js';
import {catalogueFor, DEFAULT_LANGUAGE, type Catalogue} from './i18n/index.js';
import type {Mode} from './settings/store.js';
import {matching, PLACES, queryOf, type Place, type PlaceId} from './places/registry.js';

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
  /**
   * A line typed while a goal was running — an AMENDMENT, not a new ask.
   *
   * It gets a mark nothing else uses and it is indented under the goal it
   * changes, so the shape says it belongs to something in flight before a word
   * is read. The engine's own six `directive.*` events move it through its
   * states; the console never guesses one.
   */
  | {kind: 'steer'; id: string; text: string; state: string; scope?: string}
  /**
   * The plan the engine produced, when it was asked not to run it.
   *
   * Not a preview and not a prediction: `beforePlanExecution` fires after the
   * plan exists, so these are the tasks it decided on and the contract it
   * froze. The count of tool calls behind this row is zero.
   */
  | {
      kind: 'planned';
      id: string;
      tasks: ReadonlyArray<{title: string; targets: readonly string[]}>;
      contract: readonly string[];
    }
  /**
   * A call the engine is holding, and what it wants permission for.
   *
   * An overlay in the console rather than a place to go to: the reason to say
   * yes is usually the row above it, and going somewhere to answer a yes/no is
   * the barrier that got a whole screen deleted once already.
   */
  | {
      kind: 'asked';
      id: string;
      toolName: string;
      effects: readonly string[];
      target?: string;
      requester: string;
      workspace: string;
    }
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
  /**
   * Where work lands, as it reads on a rail.
   *
   * On the closing rail permanently, beside how the console runs, because these
   * are the two facts a person must never have to go and look up — and because
   * the engine's tools anchor here whether or not anyone was told.
   */
  workspace: string;
  /**
   * The language every word this console writes is said in.
   *
   * Held as an id and resolved at the moment of drawing, so switching it
   * re-renders the whole transcript at the next repaint — the rows are built
   * from structured items on every frame, not stored as sentences. What cannot
   * change is prose the engine already spoke: it was generated once, in the
   * language of the request, and nothing re-writes what was said.
   */
  language: string;
  /** How the console runs: whether it stops and comes back to you. */
  mode: Mode;
  /** How many calls are held, waiting for an answer. */
  waiting: number;
  /**
   * The place that is open over the console, or none.
   *
   * OVER, not instead of: the transcript stays behind it, because the reason to
   * open a place is usually something you just read. Esc clears the innermost
   * thing — a place, then the launcher, then the running goal.
   */
  place: PlaceId | null;
  /** Whether the launcher is up, and which row is chosen. */
  launcher: {open: boolean; at: number};
  /** What the console permits here, as rows a place can list. */
  policy: ReadonlyArray<readonly [string, string]>;
  /** The languages this console has, and how each names itself. */
  languages: ReadonlyArray<readonly [string, string]>;
  /** The conversation every goal from this console belongs to. */
  sessionId: string;
  /** What the engine was given, and whether it answered — lines, already said. */
  engineFacts: readonly string[];
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
  stoppable: false,
  workspace: '',
  language: DEFAULT_LANGUAGE,
  mode: 'automatic',
  waiting: 0,
  place: null,
  launcher: {open: false, at: 0},
  policy: [],
  languages: [],
  sessionId: '',
  engineFacts: []
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
  const endedAfter = items.map(i => i.kind === 'spoke').lastIndexOf(true);
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
    // "+8 lines" reads; "+2 -1 lines" does not — the word lands on the second
    // number and says something untrue about the first. A write says its unit,
    // an edit says both sides and lets them speak for themselves.
    if (removed === 0) {
      return [
        ' '.repeat(left) +
          tint(`+${added}`, colour.added) +
          tint(added === 1 ? ' line' : ' lines', colour.dim)
      ];
    }
    if (added === 0) {
      return [
        ' '.repeat(left) +
          tint(`-${removed}`, colour.removed) +
          tint(removed === 1 ? ' line' : ' lines', colour.dim)
      ];
    }
    return [
      ' '.repeat(left) + tint(`+${added}`, colour.added) + ' ' + tint(`-${removed}`, colour.removed)
    ];
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

  if (item.kind === 'steer') {
    const say = catalogueFor(state.language);
    // Indented one level deeper than a `said`: it hangs off the goal above it.
    const left = INDENT + MARK;
    const room = Math.max(8, width - left - MARK);
    const verdict = say.steer[item.state as keyof typeof say.steer] ?? item.state;
    return [
      ' '.repeat(left) + tint('»', colour.amber) + ' ' +
        tint(fit(item.text, room), colour.ink) + ' ' +
        tint(verdict, colour.dim)
    ];
  }

  if (item.kind === 'planned') {
    const say = catalogueFor(state.language);
    const left = INDENT + MARK;
    const room = Math.max(8, width - left);
    const rows = [
      ' '.repeat(INDENT) + tint('▸', colour.amber) + ' ' +
        tint(fit(say.planned.heading, room), colour.ink) +
        tint(' · ' + say.planned.nothingRan, colour.dim)
    ];
    item.tasks.forEach((t, i) => {
      const targets = t.targets.length > 0 ? ` · ${t.targets.join(' ')}` : '';
      rows.push(' '.repeat(left) + tint(fit(`${String(i + 1).padStart(2, '0')} ${t.title}${targets}`, room), colour.ink));
    });
    if (item.contract.length > 0)
      rows.push(' '.repeat(left) + tint(fit(`${say.planned.judgedAgainst} ${item.contract.join(' · ')}`, room), colour.muted));
    rows.push(' '.repeat(left) + tint(fit(say.planned.howToRun, room), colour.dim));
    return rows;
  }

  // ── A HELD CALL ─────────────────────────────────────────────────────────
  //
  // Drawn where the transcript ends, with the exact target the capability
  // named, and the three ways to answer. Nothing is guessed about the command
  // — it is shown as it will be run, which is why this console has no
  // "dangerous command" detector: a person reads it and decides.
  if (item.kind === 'asked') {
    const say = catalogueFor(state.language);
    const left = INDENT + MARK;
    const room = Math.max(8, width - left);
    // What the decision is ABOUT goes first and alone: the effect, then the
    // exact target. Who asked is context and gets its own row — the engine's
    // `requester.role` is whatever that worker calls itself, and observed live
    // it can be an entire system prompt. It is not shortened here; it is put
    // where a long line is ordinary, and `fit` cuts it at the real width like
    // every other row.
    const rows = [
      ' '.repeat(INDENT) + tint('▸', colour.amber) + ' ' +
        tint(fit(item.effects.join(' · '), room), colour.ink)
    ];
    if (item.target !== undefined)
      rows.push(' '.repeat(left) + tint(fit(item.target, room), colour.ink));
    rows.push(' '.repeat(left) + tint(fit(`${item.workspace} · ${say.asked.hint}`, room), colour.dim));
    rows.push(' '.repeat(left) + tint(fit(`${say.asked.askedBy} ${item.requester}`, room), colour.dim));
    rows.push(
      ' '.repeat(left) +
        tint('y', colour.cyan) + tint(' ' + say.asked.once + '   ', colour.muted) +
        tint('c', colour.cyan) + tint(' ' + say.asked.thisCommand + '   ', colour.muted) +
        tint('r', colour.cyan) + tint(' ' + say.asked.wholeRow + '   ', colour.muted) +
        tint('n', colour.cyan) + tint(' ' + say.asked.refuse, colour.muted)
    );
    return rows;
  }

  const mark = markOf(item, state.spinner);
  const left = INDENT + MARK + verbs + 1;
  const body = Math.max(8, width - left);
  const objectTone = item.state === 'ok' ? colour.cyanSoft : colour.ink;

  wrap(item.object, body).forEach((line, i) =>
    rows.push(
      i === 0
        ? ' '.repeat(INDENT) +
          mark +
          ' ' +
          tint(cell(item.verb, verbs), colour.muted) +
          ' ' +
          tint(line, objectTone)
        : ' '.repeat(left) + tint(line, objectTone)
    )
  );

  rows.push(...outputRows(item, state.open.has(item.id), left, width));
  return rows;
}

// ── A run of tool calls ──────────────────────────────────────────────────────
//
// Folded, it is one sentence: `Ran 3 shell commands`. Opened, each call is
// named as it was made and everything it printed hangs under it:
//
//   ● Bash(cat /home/spark/notes)
//     ⎿  hello
//
// The shape is Claude Code's, deliberately — it is what he asked for, and it is
// the arrangement that answers both readings of a transcript: the sentence
// while scanning, the call itself when you stop on one.
const OPEN_MARK = '●';
const OUTPUT_MARK = '⎿';

/** A tool name as a person says it: `write_file` → `Write`. */
const titleOf = (verb: string) =>
  verb
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

function actionRows(action: Action, state: State, width: number): string[] {
  const say = catalogueFor(state.language);
  const open = action.ids.some(id => state.open.has(id));
  const room = Math.max(8, width - INDENT - MARK);

  if (!open) {
    // The sentence carries the run's state in its mark: turning while a call is
    // still going, a cross when one of them failed.
    const failed = action.items.some(i => i.state === 'failed');
    const mark = isRunning(action)
      ? tint(spinnerFrame(state.spinner), colour.cyanSoft)
      : failed
        ? tint('✕', colour.red)
        : tint('●', colour.cyanSoft);
    return [
      ' '.repeat(INDENT) + mark + ' ' + tint(fit(sentenceOf(action, say), room), colour.ink)
    ];
  }

  const rows: string[] = [];
  for (const item of action.items) {
    const mark =
      item.state === 'running'
        ? tint(spinnerFrame(state.spinner), colour.cyanSoft)
        : item.state === 'failed'
          ? tint(OPEN_MARK, colour.red)
          : tint(OPEN_MARK, colour.cyanSoft);
    // The call, written as it was made: Bash(cat /home/spark/notes).
    const call = `${titleOf(item.verb)}(${item.object})`;
    wrap(call, room).forEach((line, i) =>
      rows.push(' '.repeat(INDENT) + (i === 0 ? mark + ' ' : '  ') + tint(line, colour.ink))
    );

    const detail = [
      ...(item.changes ?? []).map(c => ({text: c.sign + ' ' + c.text, tone: c.sign === '+' ? colour.added : colour.removed})),
      ...item.output.map(line => ({text: line, tone: item.state === 'failed' ? colour.red : colour.muted}))
    ];
    // Hangs under the call rather than under the mark, and the corner is drawn
    // once — the rest is aligned to it, so the block reads as one thing.
    const hang = INDENT + 2;
    detail.forEach((line, i) =>
      rows.push(
        ' '.repeat(hang) +
          (i === 0 ? tint(OUTPUT_MARK + '  ', colour.dim) : '   ') +
          tint(fit(line.text, Math.max(4, width - hang - 3)), line.tone)
      )
    );
  }
  return rows;
}

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

  // A RUN OF TOOL CALLS IS ONE THING (action.ts): consecutive calls to the same
  // tool are collected and drawn as a sentence, opened as the calls themselves.
  // Everything else is drawn as itself, in the order it arrived.
  const pending: Extract<Item, {kind: 'did'}>[] = [];

  const flushActions = () => {
    for (const action of actionsOf(pending)) {
      if (rows.length > 0 && previous !== 'did') {
        rows.push('');
        owners.push(undefined);
      }
      const drawn = actionRows(action, state, width);
      rows.push(...drawn);
      // Every row of a run belongs to the run: clicking any of them opens or
      // closes the whole thing, which is what a person means by clicking a line
      // of it.
      for (let n = 0; n < drawn.length; n++) owners.push(action.ids[0]);
      previous = 'did';
    }
    pending.length = 0;
  };

  for (const [index, item] of state.items.entries()) {
    if (item.kind === 'phase' && (index !== lastPhase || phaseIsStale)) continue;
    if (item.kind === 'did') {
      pending.push(item);
      continue;
    }
    flushActions();
    // Consecutive items OF THE SAME KIND are one block; a change of kind gets
    // air around it. The rule is in the content, not in a spacing table.
    //
    // Drawing a real session showed why it cannot be `did` alone: a capability
    // journey arrives as five consecutive `noted` lines — the gap found, the
    // catalog declining, the build, the adoption — and a blank line between
    // each broke one story into scraps.
    const together = item.kind === previous && item.kind === 'noted';
    if (rows.length > 0 && !together) {
      rows.push('');
      owners.push(undefined);
    }
    const drawn = itemRows(item, state, width, verbs);
    rows.push(...drawn);
    for (let n = 0; n < drawn.length; n++) owners.push(item.id);
    previous = item.kind;
  }
  flushActions();
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
  const {bodyRows, bodyTop} = layout(height);
  // The rail is row 1; the transcript starts under it. A click on the rail, the
  // divider, the composer or the closing rail belongs to no item.
  const inBody = row - bodyTop;
  if (inBody < 1 || inBody > bodyRows) return undefined;
  const {owners} = contentRowsWithOwners(state, Math.max(20, columns));
  const view = reflow(state.view, owners.length, bodyRows);
  const start = Math.max(0, Math.min(view.offset, Math.max(0, owners.length - bodyRows)));
  return owners[start + inBody - 1];
}

/**
 * Is there anything under this row to open?
 *
 * Always, now: a folded run is a SENTENCE — "Ran 3 shell commands" — and
 * opening it shows the calls themselves, `● Bash(cat notes)`, whether or not
 * any of them printed a word. Before the sentence existed, the row already
 * showed the call and there was genuinely nothing more for a `write_file` to
 * reveal; that is what made a click on it look broken.
 */
const foldable = (item: Extract<Item, {kind: 'did'}>): boolean => item.kind === 'did';

/** Open a `did` item's detail, or close it. Anything else is left alone. */
export function toggleOutput(state: State, itemId: string | undefined): State {
  const item = state.items.find(i => i.id === itemId);
  if (!item || item.kind !== 'did') return state;
  // The click landed on a row of a RUN, and a run opens as one: its rows are all
  // owned by its first id, and every call in it follows.
  const dids = state.items.filter((i): i is Extract<Item, {kind: 'did'}> => i.kind === 'did');
  const action = actionsOf(dids).find(a => a.ids.includes(item.id));
  if (!action) return state;
  const open = new Set(state.open);
  const isOpen = action.ids.some(id => open.has(id));
  for (const id of action.ids) {
    if (isOpen) open.delete(id);
    else open.add(id);
  }
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
  const say = catalogueFor(state.language);
  const before = state.input.slice(0, state.caret);
  const at = state.input.slice(state.caret, state.caret + 1) || ' ';
  const after = state.input.slice(state.caret + 1);

  const prompt = tint('  › ', colour.amber);
  const line =
    state.input.length === 0
      ? prompt +
        INVERSE + ' ' + RESET +
        tint(' ' + (state.stoppable ? say.composer.whileWorking : say.composer.placeholder), colour.muted) +
        // Offered where the composer is not being used, and gone the moment a
        // person types. Appended as ORDINARY TEXT with a separator — an earlier
        // version padded it out with a run of spaces, which is saying where to
        // put something rather than what to show. `fitStyled` below cuts this
        // line at the real width like any other, so a narrow window loses the
        // hint before it loses the prompt, with no arithmetic here.
        tint(' · ' + say.composer.keysHint, colour.dim)
      : prompt + colour.ink + before + INVERSE + at + RESET + colour.ink + after + RESET;

  // ── WHAT THE CLOSING RAIL CARRIES ──────────────────────────────────────────
  //
  // It used to be a list of four keys, always, whether or not any of them
  // applied — a strip of technical text under the one part of the screen that
  // should feel like writing. A key that is always shown stops being read, and
  // it cost the row that now carries something a person cannot work without.
  //
  // So the rail carries FACTS at its left — where work lands — and at its right
  // AT MOST ONE key: the one that applies right now. That rule is not new here;
  // the old rail already offered `Esc stops` only while something was
  // stoppable. This applies it to all of them, which is what empties the row.
  //
  // Everything else lives behind `?`, offered in the composer's own unused
  // space and gone the moment a person types.
  const folded = state.items.some(i => i.kind === 'did' && foldable(i));
  const nowKey =
    below > 0
      ? say.plural(say.keys.rowsBelow, below)
      : state.stoppable
        ? say.keys.stops
        : folded
          ? state.open.size > 0 ? say.keys.folds : say.keys.unfolds
          : '';
  const keys = nowKey;

  // The keys ride the rail that closes the console, so they are returned bare —
  // the rail does the framing, and a second indent inside it would set them off
  // from a line they are meant to sit in.
  return [fitStyled(line, width), keys];
}

/**
 * WHERE THE TRANSCRIPT SITS, decided once.
 *
 * The frame draws a rail, the transcript, a divider, the composer, and the rail
 * that closes it. Anything that has to map a SCREEN row back to a transcript row
 * — a click — needs the same two numbers, and working them out a second time is
 * how they drift: the click kept `height - 2` from before the rails existed, so
 * it read every row as the one above it and opened the wrong thing, or nothing.
 */
const layout = (height: number) => ({
  /** Rows of transcript the window can hold. */
  bodyRows: Math.max(1, height - 2 - RAIL_ROWS * 2 - 1),
  /** Screen rows above the transcript — the opening rail. */
  bodyTop: RAIL_ROWS
});

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
  const {bodyRows} = layout(height);

  const content = contentRows(state, width);
  const view = reflow(state.view, content.length, bodyRows);
  const {rows: visible, above, below} = windowOnto(content, view, bodyRows);

  const body = [...visible];
  while (body.length < bodyRows) body.push('');
  if (above > 0) body[0] = tint(`  ↑ ${above} above`, colour.dim);

  // ── WHAT IS OPEN OVER THE CONSOLE ─────────────────────────────────────────
  //
  // A place or the launcher sits at the BOTTOM of the transcript's own space,
  // over the rows there — the reason to open one is usually something just
  // read, and the transcript above it stays visible. It is not a screen you go
  // to: going somewhere to answer a yes/no is the barrier that got a whole
  // screen deleted once, and the same reasoning applies to choosing a mode.
  //
  // It replaces rows rather than reserving any: the frame is the same height,
  // and what it covers is scrolled past, never dropped.
  const over = state.place ? placeRows(state, width) : launcherUp(state) ? launcherRows(state, width) : [];
  for (let i = 0; i < over.length && i < body.length; i++)
    body[body.length - over.length + i] = over[i]!;

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
      // The two facts a person must never look up — how it runs, and where work
      // lands. Joined as content; the rail measures and cuts them.
      rail(width, 'bottom', [state.mode, state.workspace].filter(Boolean).join(' · '), keys!)
    ],
    view
  };
}

/** What this console is, said once, at the top. */
const identity = (state: State): string =>
  state.items.length === 0 ? 'OVERYOS' : 'OVERYOS / operating console';

/**
 * What it is doing, at the far end of the same line.
 *
 * The rail drops a status whole before it cuts the title, so this says one
 * thing at a time and says it plainly. It is read from the same facts the body
 * is drawn from — never a second source that could disagree with the screen.
 */
function status(state: State): string {
  const say = catalogueFor(state.language);
  // Waiting outranks working: one of them is the engine's business and the
  // other is yours, and only one of them stops if you look away.
  if (state.waiting > 0) return say.plural(say.rail.waiting, state.waiting);
  if (state.stoppable) return say.rail.working;
  if (state.items.some(i => i.kind === 'noted' && i.id === 'engine-failed')) return say.rail.noEngine;
  // There is no 'waiting on you' any more. The engine has no paused state: when
  // it needs something it says so and the goal ENDS, so the console is idle and
  // the question is simply the last thing on screen. Claiming otherwise would be
  // the console asserting a state the engine no longer has.
  return state.items.length === 0 ? say.rail.ready : say.rail.idle;
}

/**
 * A place, open over the console.
 *
 * Every one of these shows something the console or the engine already holds —
 * nothing here computes a fact of its own, and nothing claims a state it
 * cannot point at.
 */
function placeRows(state: State, width: number): string[] {
  const say = catalogueFor(state.language);
  const place = PLACES.find(p => p.id === state.place);
  if (!place) return [];
  const room = Math.max(8, width - INDENT - 2);
  const line = (text: string, c: string = colour.muted) =>
    ' '.repeat(INDENT) + tint(fit(text, room), c);
  const rows = [rail(width, 'section', place.name(say), place.hint(say))];

  switch (place.id) {
    case 'keys':
      for (const [k, what] of say.keySheet) rows.push(line(`${k}   ${what}`, colour.muted));
      break;
    case 'mode':
      for (const m of ['automatic', 'approval', 'plan'] as const)
        rows.push(line(`${m === state.mode ? '◆' : '◈'} ${m}   ${say.modes[m]}`,
          m === state.mode ? colour.ink : colour.muted));
      rows.push(line(say.modes.separate, colour.dim));
      break;
    case 'policy':
      for (const [id, value] of state.policy)
        rows.push(line(`${id}   ${value}`, value === 'forbidden' ? colour.red : colour.muted));
      rows.push(line(say.modes.forbiddenHolds, colour.dim));
      break;
    case 'language':
      for (const [id, name] of state.languages)
        rows.push(line(`${id === state.language ? '◆' : '◈'} ${name}`,
          id === state.language ? colour.ink : colour.muted));
      break;
    case 'workspace':
      rows.push(line(`${say.places.workspace}   ${state.workspace}`, colour.muted));
      rows.push(line(`${say.session}   ${state.sessionId}`, colour.muted));
      break;
    case 'engine':
      for (const l of state.engineFacts) rows.push(line(l, colour.muted));
      break;
  }
  return rows;
}

/** The launcher: one row per place, under a rail of its own. */
function launcherRows(state: State, width: number): string[] {
  const say = catalogueFor(state.language);
  const list = offered(state);
  const here = chosen(state);
  const rows = [
    rail(width, 'section', say.places.title, list.length === PLACES.length ? '' : String(list.length))
  ];
  if (list.length === 0) rows.push(' '.repeat(INDENT) + tint(say.places.nothingMatches, colour.dim));
  for (const place of list) {
    const on = place.id === here?.id;
    const room = Math.max(8, width - INDENT - 6);
    rows.push(
      ' '.repeat(INDENT) +
        tint(on ? '◆' : '◈', on ? colour.cyan : colour.dim) + ' ' +
        // The place's OWN number, not its position — it does not move as a
        // query narrows, so a number a person learned stays true.
        tint(String(place.number), colour.dim) + '  ' +
        tint(fit(place.name(say), room), on ? colour.ink : colour.muted) +
        tint('  ' + place.hint(say), colour.dim)
    );
  }
  return rows;
}

/**
 * The places a query means, and the one chosen.
 *
 * Read from the same registry the launcher lists and `/name` filters, so the
 * two entry points can never offer different things.
 */
export function offered(state: State): Place[] {
  return matching(queryOf(state.input), catalogueFor(state.language));
}

export const chosen = (state: State): Place | undefined => {
  const list = offered(state);
  return list[Math.min(Math.max(0, state.launcher.at), Math.max(0, list.length - 1))];
};

/** Is the launcher showing — raised by a key, or by a line that starts with `/`? */
export const launcherUp = (state: State): boolean =>
  state.launcher.open || queryOf(state.input) !== null;

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
