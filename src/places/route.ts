// ── WHAT A KEY MEANS, GIVEN WHAT IS OPEN ────────────────────────────────────
//
// A pure function of the key and the navigation state — no side effects, no
// screen, no engine. The loop reads the answer and performs it; this file
// decides it, so the whole table can be asserted as a matrix rather than
// discovered by pressing keys at a running console.
//
// The rule it encodes: WHAT IS OPEN OWNS THE KEYBOARD, and Esc clears the
// innermost thing — a place, then the launcher, then the running goal. That is
// only safe because the closing rail always says what Esc will do right now,
// which is the rule this console already followed when it offered `Esc stops`
// only while something was stoppable.

export type Where = {
  readonly openingDone: boolean;
  readonly place: PlaceId | null;
  readonly launcher: boolean;
  readonly running: boolean;
  readonly waiting: boolean;
  readonly composerEmpty: boolean;
};

import type {PlaceId} from './registry.js';

export type Act =
  | {do: 'skip-opening'}
  | {do: 'quit'}
  | {do: 'open-launcher'}
  | {do: 'close-launcher'}
  | {do: 'open-place'; place: PlaceId}
  | {do: 'close-place'}
  | {do: 'choose'; by: -1 | 1}
  | {do: 'confirm'}
  | {do: 'answer'; key: string}
  | {do: 'stop-goal'}
  | {do: 'compose'};

export type Press = {readonly name: string; readonly text: string; readonly ctrl: boolean};

export function route(k: Press, w: Where): Act {
  if (k.ctrl && k.text === 'c') return {do: 'quit'};

  // The opening owns every key until it ends, and the key that skips it is
  // spent on skipping — it is not also the first character of a goal.
  if (!w.openingDone) return {do: 'skip-opening'};

  if (w.place !== null) {
    if (k.name === 'escape' || (k.ctrl && k.text === 'k')) return {do: 'close-place'};
    if (k.name === 'up') return {do: 'choose', by: -1};
    if (k.name === 'down') return {do: 'choose', by: 1};
    if (k.name === 'enter') return {do: 'confirm'};
    return {do: 'compose'};
  }

  if (w.launcher) {
    if (k.name === 'escape' || (k.ctrl && k.text === 'k')) return {do: 'close-launcher'};
    if (k.name === 'up') return {do: 'choose', by: -1};
    if (k.name === 'down') return {do: 'choose', by: 1};
    if (k.name === 'enter') return {do: 'confirm'};
    return {do: 'compose'};
  }

  if (k.ctrl && k.text === 'k') return {do: 'open-launcher'};
  if (k.ctrl && k.text === 'p') return {do: 'open-place', place: 'policy'};
  // `?` only on an empty line, so a question mark inside a sentence stays one.
  if (!k.ctrl && k.text === '?' && w.composerEmpty) return {do: 'open-place', place: 'help'};

  // These letters answer a held call only while one is held; every other
  // moment they are ordinary text. A `y` typed before a request exists is just
  // a `y` — the alternative is a console that swallows a keystroke because of
  // something that has not happened yet.
  if (w.waiting && !k.ctrl && 'ycrn'.includes(k.text) && k.text !== '')
    return {do: 'answer', key: k.text};

  if (k.name === 'escape') return w.running ? {do: 'stop-goal'} : {do: 'compose'};
  return {do: 'compose'};
}

// NO `^M` FOR THE MODE, and its absence is a fact about terminals rather than a
// gap: Ctrl+M is carriage return — a terminal delivers the same byte for both,
// and `decode('\r')` is `enter`. Binding it would bind Enter, and every goal a
// person sent would open a menu. The mode is reached by `/mode` or the
// launcher, both of which work.
