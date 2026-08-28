// ── THE TRANSCRIPT'S OWN ROWS ───────────────────────────────────────────────
//
// One item in, its rows out, at the width it is given. Everything here is a
// pure function of state and width: no measurement of the window, no position
// chosen by a number in this file, and nothing kept between calls.
//
// Split out of console.ts because that file is the FRAME — rail, body, divider,
// composer, rail — and this is what fills the body. They grew together, and the
// design said to part them before overlays and places made the one file the
// place every change lands.

import {actionsOf, isRunning, sentenceOf, type Action} from '../action.js';
import {catalogueFor} from '../i18n/index.js';
import {colour, mark as glyph, paint as tint} from '../style.js';
import {cell, fit, fitStyled, wrap} from '../text.js';

/**
 * Assemble a row of coloured pieces and cut the WHOLE thing at the real width.
 *
 * The mistake this closes was fitting the PIECES: a row built from three fitted
 * fragments is not a fitted row, and three item kinds overflowed a narrow
 * window — found by rendering every state at every width from 20 to 140 rather
 * than by looking at one. `fitStyled` measures visible columns and ignores the
 * escape codes, so nothing here counts anything.
 */
const row = (width: number, ...pieces: string[]): string => fitStyled(pieces.join(''), width);
import {reflow, windowOnto} from '../viewport.js';
import {screenSize} from '../screen.js';
import type {Change, Item} from './items.js';
import type {State} from './state.js';
import {spinnerFrame} from './spinner.js';
// Shared with the frame: how many rows the body has, and which phase is still
// worth drawing. Declared once, in the file that owns the arrangement.
import {layout, livePhaseIndex} from '../console.js';

export const INDENT = 2;
export const MARK = 2;          // a state mark and the space after it
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
  if (item.state === 'failed') return {ch: glyph.failed, tone: colour.red};
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
    return [row(width,
      ' '.repeat(left), tint(glyph.steer, colour.amber), ' ',
      tint(item.text, colour.ink), ' ', tint(verdict, colour.dim)
    )];
  }

  if (item.kind === 'planned') {
    const say = catalogueFor(state.language);
    const left = INDENT + MARK;
    const room = Math.max(8, width - left);
    const rows = [row(width,
      ' '.repeat(INDENT), tint(glyph.asked, colour.amber), ' ',
      tint(say.planned.heading, colour.ink),
      tint(' · ' + say.planned.nothingRan, colour.dim)
    )];
    item.tasks.forEach((t, i) => {
      const targets = t.targets.length > 0 ? ` · ${t.targets.join(' ')}` : '';
      rows.push(row(width, ' '.repeat(left),
        tint(`${String(i + 1).padStart(2, '0')} ${t.title}${targets}`, colour.ink)));
    });
    if (item.contract.length > 0)
      rows.push(row(width, ' '.repeat(left),
        tint(`${say.planned.judgedAgainst} ${item.contract.join(' · ')}`, colour.muted)));
    rows.push(row(width, ' '.repeat(left), tint(say.planned.howToRun, colour.dim)));
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
    const rows = [row(width,
      ' '.repeat(INDENT), tint(glyph.asked, colour.amber), ' ',
      tint(item.effects.join(' · '), colour.ink)
    )];
    if (item.target !== undefined)
      rows.push(row(width, ' '.repeat(left), tint(item.target, colour.ink)));
    rows.push(row(width, ' '.repeat(left), tint(`${item.workspace} · ${say.asked.hint}`, colour.dim)));
    rows.push(row(width, ' '.repeat(left), tint(`${say.asked.askedBy} ${item.requester}`, colour.dim)));
    rows.push(row(width,
      ' '.repeat(left),
      tint('y', colour.cyan), tint(' ' + say.asked.once + '   ', colour.muted),
      tint('c', colour.cyan), tint(' ' + say.asked.thisCommand + '   ', colour.muted),
      tint('r', colour.cyan), tint(' ' + say.asked.wholeRow + '   ', colour.muted),
      tint('n', colour.cyan), tint(' ' + say.asked.refuse, colour.muted)
    ));
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
        ? tint(glyph.failed, colour.red)
        : tint(glyph.ok, colour.cyanSoft);
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
          ? tint(glyph.ok, colour.red)
          : tint(glyph.ok, colour.cyanSoft);
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
export const foldable = (item: Extract<Item, {kind: 'did'}>): boolean => item.kind === 'did';

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

