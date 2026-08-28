// ── EVERYTHING THE CONSOLE KNOWS, IN ONE OBJECT ─────────────────────────────
//
// A frame is a pure function of this and nothing else — the property every
// test here depends on, and the reason a resize is a repaint rather than a
// reconciliation. Nothing is remembered between frames to be wrong.

import {DEFAULT_LANGUAGE} from '../i18n/index.js';
import type {Mode} from '../settings/store.js';
import type {PlaceId} from '../places/registry.js';
import {START, type Viewport} from '../viewport.js';
import {NO_HISTORY, type History} from '../history.js';
import type {Item} from './items.js';

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
  /**
   * Goals on record, newest first, once History has been opened.
   *
   * Named `record` rather than `history` because `history` on this same object
   * is the input recall — the console's own, and a different thing entirely.
   *
   * `null` means it has not been read yet, and the screen says so rather than
   * showing an empty list — "nothing on record" and "not looked yet" are
   * different facts, and a console that draws one as the other is guessing.
   */
  record: readonly {id: string; goal: string; status: string; at: string}[] | null;
  /** Which row of History the cursor is on — Enter inspects it. */
  recordAt: number;
  /**
   * Which row the cursor is on in a place whose list is its own — the mode, a
   * policy row, a language. One number, because only one place is ever open.
   */
  at: number;
  /**
   * One execution, read whole, once the Inspector has been opened on it.
   *
   * `null` while it is being assembled. `replay()` reads a set of tables on
   * demand, so a person sees that it is being read rather than an empty screen
   * that looks like an empty execution.
   */
  inspecting: {
    goalId: string;
    status: string;
    attempts: number | null;
    durationMs: number | null;
    workspace: string | null;
    tasks: readonly string[];
    evidence: readonly string[];
    workers: ReadonlyArray<{role: string; status: string; steps: number | null}>;
    retries: readonly string[];
    guardian: readonly string[];
  } | null;
  /** What the engine can reach for, once Capabilities has been opened. */
  capabilities: ReadonlyArray<{name: string; category: string}> | null;
  /** What the engine was given, once Settings has been opened. Read only. */
  configuration: ReadonlyArray<readonly [string, string]> | null;
  /** Sessions, newest first, with how many goals each holds. */
  conversations: ReadonlyArray<{id: string; goals: number; last: string; at: string}> | null;
  /** Which conversation the cursor is on — Enter continues it. */
  conversationAt: number;
  /** The way of working in use, and whether a hand edit has moved it since. */
  profile: string;
  adjusted: boolean;
  /**
   * A profile that widens what may happen, waiting for its name to be typed.
   *
   * Confirmed by TYPING, not by pressing a key: a word is the record that a
   * person chose it. Asked once — afterwards it is simply the profile in use.
   */
  confirming: string | null;
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
  engineFacts: [],
  record: null,
  recordAt: 0,
  at: 0,
  inspecting: null,
  capabilities: null,
  configuration: null,
  conversations: null,
  conversationAt: 0,
  profile: 'phosphor',
  adjusted: false,
  confirming: null
});
