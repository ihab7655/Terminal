// ── WHAT THE CONSOLE SAYS, IN THE LANGUAGE A PERSON CHOSE ───────────────────
//
// One catalogue per language, each satisfying this one shape, each registered
// by id. Adding a language is a new file and one line in `catalogues` — never
// an edit to anything that renders, decides or orchestrates.
//
// NOTHING HERE IS ABOUT DIRECTION OR LAYOUT. The terminal layer already
// measures Arabic correctly — one column per character — and already refuses to
// cut a character in half; reordering is the terminal's own job and text.ts
// says so in its header. A language changes WORDS. It does not mirror a screen,
// move a mark from one side to the other, or reverse an indent. One interface,
// identical in every language.
//
// WHAT IS NEVER TRANSLATED, and the reasons are not stylistic:
//   * OVERYOS — a name is the same name in every language.
//   * Tool names, effect ids, commands, paths, code — identifiers.
//   * Captured tool output — a traceback is a thing you search for, and a
//     translated one is a thing you cannot find.

/**
 * How many of a thing there are, as a language counts them.
 *
 * English has two forms and Arabic has six, so a catalogue declares the forms
 * it has and OWNS the rule that picks between them. Nothing outside a language
 * file knows how many forms that language uses — which is the whole difference
 * between a structure that accepts a new language and one that pretends to.
 */
export type Plural = {
  readonly zero?: string;
  readonly one: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
};

export type Catalogue = {
  readonly id: string;
  /** How this language names itself, for the language list. */
  readonly name: string;

  /** Picks the form for `n` from what this language declared. `{n}` is filled. */
  plural(forms: Plural, n: number): string;

  readonly rail: {
    readonly idle: string;
    readonly ready: string;
    readonly working: string;
    readonly noEngine: string;
    readonly waiting: Plural;
  };

  readonly composer: {
    readonly placeholder: string;
    readonly whileWorking: string;
    readonly keysHint: string;
  };

  readonly keys: {
    readonly stops: string;
    readonly unfolds: string;
    readonly folds: string;
    readonly rowsBelow: Plural;
  };

  readonly session: string;
  readonly keySheet: ReadonlyArray<readonly [string, string]>;
  readonly modes: {
    readonly automatic: string;
    readonly approval: string;
    readonly plan: string;
    readonly separate: string;
    readonly forbiddenHolds: string;
  };

  /** What the engine is doing, said as one line that replaces the last. */
  /** What became of an amendment, in the engine's own six states. */
  readonly steer: {
    readonly received: string;
    readonly scoped: string;
    readonly delivered: string;
    readonly admitted: string;
    readonly superseded: string;
    readonly not_delivered: string;
  };

  readonly phases: {
    readonly starting: string;
    readonly reading: string;
    readonly planning: string;
    readonly planned: string;
    readonly executing: string;
    readonly waveFinished: string;
    readonly working: string;
    readonly checkpoint: string;
  };
  /** What became of a goal, and what the engine concluded on the way. */
  readonly outcome: {
    readonly completed: string;
    readonly finished: string;
    readonly failed: string;
    readonly verificationFailed: string;
    readonly retrying: string;
    readonly stopping: string;
    readonly buildingCapability: string;
    readonly judgesUnreliable: string;
    readonly repairing: string;
    readonly repaired: string;
    readonly noEngineHere: string;
    readonly endedBadly: string;
    readonly replanned: string;
  };

  readonly places: {
    readonly title: string;
    readonly keys: string; readonly keysHint: string;
    readonly mode: string; readonly modeHint: string;
    readonly policy: string; readonly policyHint: string;
    readonly language: string; readonly languageHint: string;
    readonly workspace: string; readonly workspaceHint: string;
    readonly engine: string; readonly engineHint: string;
    readonly choose: string;
    readonly nothingMatches: string;
  };

  readonly planned: {
    readonly heading: string;
    readonly nothingRan: string;
    readonly judgedAgainst: string;
    readonly howToRun: string;
  };

  readonly asked: {
    readonly hint: string;
    readonly once: string;
    readonly thisCommand: string;
    readonly wholeRow: string;
    readonly refuse: string;
    readonly askedBy: string;
  };

  readonly engine: {
    readonly waking: string;
    readonly none: string;
    readonly stopping: string;
  };

  /** What a run of tool calls did. `{n}` is the count. */
  readonly did: {
    readonly shell: Plural;
    readonly wrote: Plural;
    readonly edited: Plural;
    readonly read: Plural;
    readonly listed: Plural;
    readonly ranProject: Plural;
    readonly ranTests: Plural;
    readonly snippet: Plural;
    readonly searched: Plural;
    /** A tool this catalogue has no phrase for. `{tool}` is its name. */
    readonly other: Plural;
    readonly failed: string;
    readonly someFailed: Plural;
  };

  /** How much a change was. `{n}` is the count. */
  readonly changes: {
    readonly added: Plural;
    readonly removed: Plural;
  };
};

/** Fill `{n}` and `{tool}` — the only two a catalogue may carry. */
export const fill = (text: string, values: Record<string, string | number>): string =>
  text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole);
