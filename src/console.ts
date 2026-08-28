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
import {HANG, PAD, choice, field, gap, heading, note, paragraph, row, subtitle} from './console/surface.js';
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
  // AND IT SCROLLS, because rule 3 holds inside an overlay too. A list of
  // places is longer than a short window, and the first version wrote its rows
  // at `body.length - over.length` — NEGATIVE when the list was taller than the
  // space, so rows past the fold were silently dropped and the places below
  // them could not be reached at all. Measured: 9 of 12 at height 16, 1 of 12
  // at height 12.
  //
  // The window is taken by `windowOnto`, the same function the transcript uses,
  // anchored so the row under the cursor is always inside it. Nothing is shed;
  // what does not fit is scrolled past and said.
  // A FULL PAGE replaces the body outright and scrolls on its own — it is
  // something you go to and read, not an answer to a question you had while
  // reading. Everything else sits over the bottom rows.
  const page = PLACES.find(p => p.id === state.place && p.full);
  if (page) {
    const content = page.id === 'help' ? helpPage(state, width) : placeRows(state, width).rows;
    // A surface with a cursor follows it; a page a person is reading holds the
    // offset they scrolled to. Both are the same window onto the same rows.
    const cursor = page.id === 'help' ? -1 : placeRows(state, width).cursor;
    const offset = cursor < 0
      ? state.pageAt
      : Math.max(0, Math.min(Math.max(0, content.length - bodyRows), cursor - bodyRows + 2));
    const shown = windowOnto(content, {offset, following: false}, bodyRows);
    const out = [...shown.rows];
    while (out.length < bodyRows) out.push('');
    if (shown.above > 0) out[0] = row(width, tint(`  ↑ ${shown.above} above`, colour.dim));
    if (shown.below > 0) out[out.length - 1] = row(width, tint(`  ↓ ${shown.below} below`, colour.dim));
    for (let i = 0; i < bodyRows; i++) body[i] = out[i]!;
  }

  const over = !page && state.place ? placeRows(state, width) : !page && launcherUp(state) ? launcherRows(state, width) : null;
  if (over !== null) {
    const room = Math.min(body.length, over.rows.length);
    // Follow the cursor: keep it in view, and prefer showing what is after it.
    const first = Math.max(0, Math.min(over.rows.length - room, over.cursor - room + 2));
    const shown = windowOnto(over.rows, {offset: first, following: false}, room);
    const out = [...shown.rows];
    if (shown.above > 0) out[0] = row(width, tint(`  ↑ ${shown.above} above`, colour.dim));
    if (shown.below > 0) out[out.length - 1] = row(width, tint(`  ↓ ${shown.below} below`, colour.dim));
    for (let i = 0; i < out.length; i++) body[body.length - out.length + i] = out[i]!;
  }

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

/** Which row of an open place a person is on — 0 when it has no list. */
const cursorOf = (state: State): number => {
  if (state.place === 'mode' || state.place === 'policy' || state.place === 'language')
    return state.at + 1;
  if (state.place === 'history') return state.recordAt + 1;
  if (state.place === 'conversations') return state.conversationAt + 1;
  if (state.place === 'profiles') return PROFILES.findIndex(p => p.id === state.profile) + 1;
  return 0;
};

function placeRows(state: State, width: number): {rows: string[]; cursor: number} {
  const say = catalogueFor(state.language);
  const place = PLACES.find(p => p.id === state.place);
  if (!place) return {rows: [], cursor: 0};

  // Every surface opens by naming itself and saying what it is for. After that
  // each is laid out for WHAT IT IS: a list you choose from, a table of facts
  // you read, or a record you study. They share a vocabulary, not a template.
  const rows: string[] = [heading(width, place.name(say)), subtitle(width, place.hint(say)), gap()];

  switch (place.id) {
    // ── LISTS YOU CHOOSE FROM ──────────────────────────────────────────────
    case 'mode':
      (['automatic', 'approval', 'plan'] as const).forEach((m, i) =>
        rows.push(choice(width, i === state.at, m, say.modes[m], m === state.mode)));
      rows.push(gap(), note(width, say.modes.separate));
      break;

    case 'language':
      state.languages.forEach(([id, name], i) =>
        rows.push(choice(width, i === state.at, name, '', id === state.language)));
      break;

    case 'profiles':
      if (state.confirming !== null) {
        rows.push(...paragraph(width, say.profile.confirmHead), gap());
        rows.push(...paragraph(width, say.profile.confirmBody), gap());
        rows.push(...paragraph(width, say.profile.confirmDoesNot), gap());
        rows.push(field(width, say.profile.confirmType, state.confirming, 'state'));
        rows.push(note(width, say.profile.cancel));
        break;
      }
      PROFILES.forEach((p, i) =>
        rows.push(choice(width, i === state.at, p.id, p.mode,
          p.id === state.profile && !state.adjusted)));
      rows.push(gap(), note(width, say.profile.appliesAll));
      if (state.adjusted) rows.push(field(width, state.profile, say.profile.adjusted, 'state'));
      break;

    // ── A TABLE OF SETTINGS, EACH ONE CHANGEABLE ───────────────────────────
    case 'policy':
      state.policy.forEach(([id, value], i) =>
        rows.push(row(width, PAD,
          tint(i === state.at ? glyph.chosen : ' ', colour.cyan), ' ',
          tint(id.padEnd(16), i === state.at ? colour.ink : colour.muted), '  ',
          tint(value, value === 'forbidden' ? colour.red
            : value === 'needs-approval' ? colour.amber : colour.cyanSoft))));
      rows.push(gap(), note(width, say.modes.enterCycles), note(width, say.modes.forbiddenHolds));
      break;

    // ── FACTS YOU READ ─────────────────────────────────────────────────────
    case 'workspace':
      rows.push(field(width, say.places.workspace, state.workspace));
      rows.push(field(width, say.session, state.sessionId));
      break;

    case 'engine':
      for (const line of state.engineFacts) {
        const [label, ...rest] = line.split(' · ');
        rows.push(rest.length > 0
          ? field(width, label!, rest.join(' · '))
          : row(width, PAD, tint(line, colour.ink)));
      }
      break;

    case 'settings':
      if (state.configuration === null) { rows.push(note(width, say.places.loading)); break; }
      for (const [k, v] of state.configuration)
        rows.push(field(width, k, v, k === 'api key' ? 'state' : 'plain'));
      break;

    case 'capabilities': {
      if (state.capabilities === null) { rows.push(note(width, say.places.loading)); break; }
      if (state.capabilities.length === 0) { rows.push(note(width, say.places.nothingYet)); break; }
      // Grouped by the category the ENGINE declares, so the shape of the list
      // is the engine's own and not one this console invented.
      let last = '';
      for (const c of state.capabilities) {
        if (c.category !== last) { rows.push(gap(), heading(width, c.category)); last = c.category; }
        rows.push(row(width, HANG, tint(c.name, colour.ink)));
      }
      break;
    }

    // ── RECORDS YOU STUDY ──────────────────────────────────────────────────
    case 'history':
      if (state.record === null) { rows.push(note(width, say.places.loading)); break; }
      if (state.record.length === 0) { rows.push(note(width, say.places.nothingYet)); break; }
      state.record.forEach((g, i) =>
        rows.push(row(width, PAD,
          tint(i === state.recordAt ? glyph.chosen : ' ', colour.cyan), ' ',
          tint(g.at, colour.dim), '  ',
          tint(g.status.padEnd(12),
            g.status === 'completed' ? colour.cyanSoft
              : g.status === 'failed' ? colour.red : colour.amber), '  ',
          tint(g.goal, i === state.recordAt ? colour.ink : colour.muted))));
      rows.push(gap(), note(width, say.places.openARow));
      break;

    case 'conversations':
      if (state.conversations === null) { rows.push(note(width, say.places.loading)); break; }
      if (state.conversations.length === 0) { rows.push(note(width, say.places.nothingYet)); break; }
      state.conversations.forEach((c, i) =>
        rows.push(row(width, PAD,
          tint(i === state.conversationAt ? glyph.chosen : ' ', colour.cyan), ' ',
          tint(c.at, colour.dim), '  ',
          tint(String(c.goals).padStart(3), colour.amber), '  ',
          tint(c.last, i === state.conversationAt ? colour.ink : colour.muted),
          c.id === state.sessionId ? tint('  ·  ' + say.places.thisSession, colour.cyanSoft) : '')));
      rows.push(gap(), note(width, say.places.resume));
      break;

    case 'inspector': {
      const r = state.inspecting;
      if (r === null) { rows.push(note(width, say.places.loading)); break; }
      if (r.goalId === '') { rows.push(note(width, say.places.pickAGoal)); break; }
      rows.push(field(width, say.record.status, r.status,
        r.status === 'completed' ? 'plain' : r.status === 'failed' ? 'bad' : 'state'));
      rows.push(field(width, say.record.attempts, String(r.attempts ?? '—')));
      rows.push(field(width, say.record.took,
        r.durationMs === null ? '—' : `${Math.round(r.durationMs / 1000)}s`));
      if (r.workspace) rows.push(field(width, say.places.workspace, r.workspace));
      if (r.tasks.length > 0) {
        rows.push(gap(), heading(width, say.record.plan));
        r.tasks.forEach((t, i) =>
          rows.push(row(width, HANG, tint(String(i + 1).padStart(2, '0') + '  ', colour.dim), tint(t, colour.ink))));
      }
      if (r.evidence.length > 0) {
        rows.push(gap(), heading(width, say.record.proved));
        for (const e of r.evidence) rows.push(row(width, HANG, tint(e, colour.cyanSoft)));
      }
      if (r.workers.length > 0) {
        rows.push(gap(), heading(width, say.record.workers));
        for (const w of r.workers)
          rows.push(row(width, HANG, tint(w.role, colour.ink),
            tint(`  ${w.status}${w.steps === null ? '' : ` · ${w.steps}`}`, colour.muted)));
      }
      if (r.retries.length > 0) {
        rows.push(gap(), heading(width, say.record.retries));
        for (const t of r.retries) rows.push(...paragraph(width, t, HANG));
      }
      if (r.guardian.length > 0) {
        rows.push(gap(), heading(width, say.record.guardian));
        for (const g of r.guardian) rows.push(...paragraph(width, g, HANG));
      }
      break;
    }

    case 'help':
      // Drawn by helpPage() — a full page, not a row list.
      break;
  }
  // The row that must stay in view. A place with no list anchors at its top;
  // one with a list follows the row a person is on.
  return {rows, cursor: cursorOf(state) + 2};
}

/**
 * THE HELP PAGE — a page, not a panel.
 *
 * The hierarchy is the design: SECTION, then the KEY on a line of its own in
 * the accent colour, then what it does beneath it, quieter. A reader's eye asks
 * "which key?" and then "what does it do?", in that order, and a key glued to
 * its sentence on one line makes them decode a table instead.
 *
 * Every row is content: nothing here measures the window, and the page scrolls
 * like the transcript when it is longer than the space.
 */
function helpPage(state: State, width: number): string[] {
  const say = catalogueFor(state.language);
  const rows: string[] = [];
  const pad = ' '.repeat(INDENT);

  rows.push(row(width, pad, tint(say.help.title, colour.ink, true)));
  rows.push(row(width, pad, tint(say.help.subtitle, colour.muted)));

  for (const section of say.help.sections) {
    rows.push('');
    rows.push(row(width, pad, tint(section.name, colour.cyanSoft)));
    rows.push('');
    for (const entry of section.entries) {
      rows.push(row(width, pad, '  ', tint(entry.key, colour.cyan, true)));
      // WRAPPED, never cut. A narrow window used to truncate the explanation —
      // a help page that sheds the very sentence a person opened it for. `wrap`
      // is the terminal layer's own, and it measures the real width; the indent
      // it is given back is the same one the key sits on, so a description that
      // runs to two lines still reads as one entry.
      for (const line of wrap(entry.does, Math.max(8, width - INDENT - 2)))
        rows.push(row(width, pad, '  ', tint(line, colour.muted)));
      rows.push('');
    }
  }
  return rows;
}

/** The launcher: one row per place, under a rail of its own. */
function launcherRows(state: State, width: number): {rows: string[]; cursor: number} {
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
  // The rail is row zero, so the chosen place sits one below it.
  return {rows, cursor: state.launcher.at + 1};
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

/**
 * Which row of an open surface a screen row is — or undefined.
 *
 * The same walk that DRAWS decides it, so a click can never land one row off
 * the thing it pointed at. That drift is not hypothetical: it happened once in
 * the transcript, when a second pass re-derived the same skipping rules and
 * then disagreed with the first.
 */
export function surfaceRowAt(state: State, screenRow: number): number | undefined {
  const {columns, rows: height} = screenSize();
  const width = Math.max(20, columns);
  const {bodyRows} = layout(height);
  const page = PLACES.find(p => p.id === state.place && p.full);
  const built = page
    ? (page.id === 'help'
        ? {rows: helpPage(state, width), cursor: -1}
        : placeRows(state, width))
    : launcherUp(state)
      ? launcherRows(state, width)
      : null;
  if (built === null) return undefined;

  // Where the surface starts on screen, and where its window starts in the
  // content — the same two numbers the frame uses to draw it.
  const room = page ? bodyRows : Math.min(bodyRows, built.rows.length);
  const top = RAIL_ROWS + (page ? 0 : bodyRows - room);
  const first = built.cursor < 0
    ? Math.max(0, Math.min(Math.max(0, built.rows.length - room), state.pageAt))
    : Math.max(0, Math.min(Math.max(0, built.rows.length - room), built.cursor - room + 2));
  const index = first + (screenRow - top);
  return index >= 0 && index < built.rows.length ? index : undefined;
}

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
