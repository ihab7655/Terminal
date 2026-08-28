import {actionsOf, isRunning, sentenceOf, type Action} from './action.js';
import {NO_HISTORY, type History} from './history.js';
import {RAIL_ROWS, rail} from './rail.js';
import {paint, screenSize} from './screen.js';
import {INVERSE, RESET, colour, mark as glyph, paint as tint} from './style.js';
import {cell, fit, fitStyled, wrap} from './text.js';
import {reflow, scroll, windowOnto, type ScrollCommand, type Viewport} from './viewport.js';
// The state and the items live beside this file, not in it: `console.ts` is
// the RENDERER — state → rows — and everything it renders is declared where a
// consumer can import it without pulling a frame builder in with it.
import {emptyState, type State} from './console/state.js';
import type {Item} from './console/items.js';
// The transcript's rows, and the two measurements the frame shares with it:
// the indent is the design's tab stop and the mark is the column a state sits
// in. Both belong to the arrangement, and both are declared once.
import {
  INDENT, contentRows, contentRowsWithOwners, foldable, itemAtRow,
  toggleAllOutput, toggleOutput
} from './console/transcript.js';
import {spinnerFrame} from './console/spinner.js';
export {contentRows, contentRowsWithOwners, itemAtRow, toggleAllOutput, toggleOutput} from './console/transcript.js';
export {spinnerFrame} from './console/spinner.js';
export {emptyState, type State} from './console/state.js';
export type {Change, Item, ItemState} from './console/items.js';
import {catalogueFor, DEFAULT_LANGUAGE, type Catalogue} from './i18n/index.js';
import type {Mode} from './settings/store.js';
import {matching, PLACES, queryOf, type Place, type PlaceId} from './places/registry.js';
import {profiles as PROFILES} from './theme/profiles.js';

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







/**
 * The phase still worth drawing, or -1.
 *
 * A phase is only true while the engine is between events. Once it has spoken
 * — an ending, a question — the phase is over, and a spinner still turning
 * beside it claims work that stopped. Drawn against a real engine, "⠋ planning"
 * sat under a finished goal.
 */
export function livePhaseIndex(items: readonly Item[]): number {
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
export const layout = (height: number) => ({
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
  const divider = tint(glyph.rule.repeat(width), colour.dim);
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
/**
 * A row of a place or an overlay, cut at the real width.
 *
 * Every one of these is a line of coloured pieces, and the mistake this closes
 * was fitting the PIECES: a row assembled from three fitted fragments is not a
 * fitted row, and four of them overflowed a narrow window — found by rendering
 * every state at every width from 20 to 140 rather than by looking.
 *
 * `fitStyled` measures visible columns and ignores the escape codes, so the row
 * is cut where the screen ends and nothing here counts anything.
 */
const row = (width: number, ...pieces: string[]): string => fitStyled(pieces.join(''), width);

function placeRows(state: State, width: number): string[] {
  const say = catalogueFor(state.language);
  const place = PLACES.find(p => p.id === state.place);
  if (!place) return [];
  const room = Math.max(8, width - INDENT - 2);
  const line = (text: string, c: string = colour.muted) =>
    row(width, ' '.repeat(INDENT), tint(text, c));
  const rows = [rail(width, 'section', place.name(say), place.hint(say))];

  switch (place.id) {
    case 'keys':
      for (const [k, what] of say.keySheet) rows.push(line(`${k}   ${what}`, colour.muted));
      break;
    case 'mode':
      for (const m of ['automatic', 'approval', 'plan'] as const)
        rows.push(line(`${m === state.mode ? glyph.chosen : glyph.other} ${m}   ${say.modes[m]}`,
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
        rows.push(line(`${id === state.language ? glyph.chosen : glyph.other} ${name}`,
          id === state.language ? colour.ink : colour.muted));
      break;
    case 'workspace':
      rows.push(line(`${say.places.workspace}   ${state.workspace}`, colour.muted));
      rows.push(line(`${say.session}   ${state.sessionId}`, colour.muted));
      break;
    case 'engine':
      for (const l of state.engineFacts) rows.push(line(l, colour.muted));
      break;
    case 'history':
      if (state.record === null) { rows.push(line(say.places.loading, colour.dim)); break; }
      if (state.record.length === 0) { rows.push(line(say.places.nothingYet, colour.dim)); break; }
      state.record.forEach((g, i) => {
        const on = i === state.recordAt;
        rows.push(row(width,
          ' '.repeat(INDENT),
          tint(on ? glyph.chosen + ' ' : '  ', colour.cyan),
          tint(`${g.at}  ${g.status}  ${g.goal}`, on ? colour.ink : g.status === 'failed' ? colour.red : colour.muted)
        ));
      });
      rows.push(line(say.places.openARow, colour.dim));
      break;

    case 'inspector': {
      const r = state.inspecting;
      if (r === null) { rows.push(line(say.places.loading, colour.dim)); break; }
      if (r.goalId === '') { rows.push(line(say.places.pickAGoal, colour.dim)); break; }
      const took = r.durationMs === null ? '—' : `${Math.round(r.durationMs / 1000)}s`;
      rows.push(line(`${say.record.status}   ${r.status}`, colour.ink));
      rows.push(line(`${say.record.attempts}   ${r.attempts ?? '—'}   ${say.record.took} ${took}`, colour.muted));
      if (r.workspace) rows.push(line(`${say.places.workspace}   ${r.workspace}`, colour.muted));
      if (r.tasks.length > 0) {
        rows.push(line(say.record.plan, colour.cyanSoft));
        r.tasks.forEach((t, i) => rows.push(line(`  ${String(i + 1).padStart(2, '0')} ${t}`, colour.muted)));
      }
      if (r.evidence.length > 0)
        rows.push(line(`${say.record.proved}   ${r.evidence.join(' · ')}`, colour.muted));
      if (r.workers.length > 0)
        rows.push(line(`${say.record.workers}   ` +
          r.workers.map(w => `${w.role}:${w.status}${w.steps === null ? '' : `/${w.steps}`}`).join(' · '), colour.muted));
      for (const t of r.retries) rows.push(line(`${say.record.retries}   ${t}`, colour.muted));
      for (const g of r.guardian) rows.push(line(`${say.record.guardian}   ${g}`, colour.muted));
      if (r.tasks.length === 0 && r.evidence.length === 0 && r.workers.length === 0)
        rows.push(line(say.record.nothing, colour.dim));
      break;
    }

    case 'profiles': {
      if (state.confirming !== null) {
        rows.push(line(say.profile.confirmHead, colour.ink));
        rows.push(line(say.profile.confirmBody, colour.muted));
        rows.push(line(say.profile.confirmDoesNot, colour.dim));
        rows.push(line(`${say.profile.confirmType}: ${state.confirming}`, colour.amber));
        rows.push(line(say.profile.cancel, colour.dim));
        break;
      }
      for (const p of PROFILES) {
        const on = p.id === state.profile;
        rows.push(line(
          `${on ? glyph.chosen : glyph.other} ${p.id}   ${p.mode}` +
            (on && state.adjusted ? ` · ${say.profile.adjusted}` : ''),
          on ? colour.ink : colour.muted));
      }
      rows.push(line(say.profile.appliesAll, colour.dim));
      break;
    }

    case 'settings':
      if (state.configuration === null) { rows.push(line(say.places.loading, colour.dim)); break; }
      for (const [k, v] of state.configuration) rows.push(line(`${k}   ${v}`, colour.muted));
      break;

    case 'conversations': {
      if (state.conversations === null) { rows.push(line(say.places.loading, colour.dim)); break; }
      if (state.conversations.length === 0) { rows.push(line(say.places.nothingYet, colour.dim)); break; }
      state.conversations.forEach((c, i) => {
        const on = i === state.conversationAt;
        const mine = c.id === state.sessionId ? ` · ${say.places.thisSession}` : '';
        rows.push(row(width,
          ' '.repeat(INDENT),
          tint(on ? glyph.chosen + ' ' : '  ', colour.cyan),
          tint(`${c.at}  ${c.goals}  ${c.last}${mine}`, on ? colour.ink : colour.muted)
        ));
      });
      rows.push(line(say.places.resume, colour.dim));
      break;
    }

    case 'capabilities':
      if (state.capabilities === null) { rows.push(line(say.places.loading, colour.dim)); break; }
      if (state.capabilities.length === 0) { rows.push(line(say.places.nothingYet, colour.dim)); break; }
      for (const c of state.capabilities)
        rows.push(line(`${c.category}   ${c.name}`, colour.muted));
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
    rows.push(row(width,
      ' '.repeat(INDENT),
      tint(on ? glyph.chosen : glyph.other, on ? colour.cyan : colour.dim), ' ',
      // The place's OWN number, not its position — it does not move as a query
      // narrows, so a number a person learned stays true.
      tint(String(place.number), colour.dim), '  ',
      tint(place.name(say), on ? colour.ink : colour.muted),
      tint('  ' + place.hint(say), colour.dim)
    ));
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
