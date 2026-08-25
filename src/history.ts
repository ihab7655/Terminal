// What was typed before, and how to walk back through it.
//
// THE ARROWS BELONG HERE, NOT TO THE VIEWPORT. Up and down used to scroll the
// window a line at a time — which every other key in this console already does
// better (PgUp/PgDn a page, Home/End the ends) — while the thing a person
// actually reaches the arrows for in a terminal, the last thing they typed, had
// nowhere to be. Every shell, every REPL answers the up arrow with history.
// A console that answers it with a one-line scroll is not offering a feature,
// it is spending the one key the reader already knows.
//
// The rules are the ones a shell taught everyone, and each is here because its
// absence is felt immediately:
//
//   * an unsent draft is not lost when you go looking. It is put back the
//     moment you walk past the newest entry, so browsing costs nothing.
//   * the same line typed twice in a row is remembered once. Re-running a goal
//     is common, and a history that answers up-up-up with the same string three
//     times is a history you have to fight.
//   * sending anything returns to the end. After a send, up means "the thing I
//     just sent", not wherever the browsing left off.

export type History = {
  /** Oldest first. What was actually sent, never what was merely typed. */
  readonly entries: readonly string[];
  /**
   * Where in `entries` the composer currently sits, or null when it holds the
   * live draft rather than a recalled line. Null is not `entries.length` — the
   * two are the same position and different states, and only the second one has
   * a draft to put back.
   */
  readonly at: number | null;
  /** The unsent line browsing interrupted, kept until browsing ends. */
  readonly draft: string;
};

export const NO_HISTORY: History = {entries: [], at: null, draft: ''};

/** Record a sent line, and return to the end. */
export function remember(history: History, line: string): History {
  const last = history.entries[history.entries.length - 1];
  const entries = line === '' || line === last ? history.entries : [...history.entries, line];
  return {entries, at: null, draft: ''};
}

/** What the composer should hold after a step, and where that leaves history. */
export type Recall = {readonly history: History; readonly line: string};

/** One step back. At the oldest entry it stays there rather than emptying. */
export function previous(history: History, draft: string): Recall {
  if (history.entries.length === 0) return {history, line: draft};
  const at = history.at === null ? history.entries.length - 1 : Math.max(0, history.at - 1);
  return {
    history: {...history, at, draft: history.at === null ? draft : history.draft},
    line: history.entries[at]!
  };
}

/** One step forward. Past the newest entry the draft comes back. */
export function next(history: History): Recall {
  if (history.at === null) return {history, line: history.draft};
  const at = history.at + 1;
  if (at >= history.entries.length) {
    return {history: {...history, at: null, draft: ''}, line: history.draft};
  }
  return {history: {...history, at}, line: history.entries[at]!};
}
