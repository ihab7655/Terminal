// ── WHAT HAPPENED, AS THE CONSOLE HOLDS IT ──────────────────────────────────
//
// An item says WHAT happened; nothing in it says where anything goes. That is
// the whole of rule 5 expressed as a type: the renderer measures the space,
// wraps the text, orders the rows and repaints — this file only names facts.

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

