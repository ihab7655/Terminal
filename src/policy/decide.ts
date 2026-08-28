import type {EffectId, EffectTable, Mode, Standing} from '../settings/store.js';

// ── TWO DIALS, AND THEY DO NOT READ EACH OTHER ──────────────────────────────
//
// The MODE answers one question: does the engine stop and come back to you?
// The TABLE answers a different one: what may happen at all.
//
// `automatic` therefore does not mean "everything is permitted" — it means the
// console will not interrupt you. A table that forbids git still forbids it.
// That independence is what buys the state neither dial can express alone:
// work without interrupting me, and never touch git.
//
// `forbidden` holds in EVERY mode. If it softened under `automatic`, the mode
// would quietly have become a permission after all, and there would be one
// dial wearing two names.
//
// `needs-approval` is simply dormant under `automatic` — there is nobody to
// ask — and the screen says so rather than showing a badge that will not fire.

export type Verdict =
  | {readonly verdict: 'allow'}
  | {readonly verdict: 'deny'; readonly reason: string}
  | {readonly verdict: 'ask'; readonly effects: readonly EffectId[]};

/** What the engine told us about the call it is about to make. */
export type CallFacts = {
  readonly toolName: string;
  /**
   * What the capability DECLARED, as ADR-009 hands it over.
   *
   * `undefined` and `[]` are different facts and are treated as such: absent
   * means the capability made no statement about what it does, which the
   * engine's own comment warns must not be read as harmless. It becomes the
   * `undeclared` row so the decision is made rather than inherited.
   */
  readonly effects?: readonly string[];
  /** The value the capability named as its target — a command, a path, a URL. */
  readonly target?: string;
  readonly workspace: string;
};

const KNOWN: ReadonlySet<string> = new Set<EffectId>([
  'fs:read', 'fs:write', 'process:spawn', 'network:read', 'vcs:write'
]);

/**
 * Which rows govern this call.
 *
 * An effect the console has no row for is NOT ignored — it falls to
 * `undeclared`, the row that exists for exactly this: something the console
 * cannot account for. A capability the engine grows tomorrow, declaring an
 * effect this console has never heard of, is governed on the day it appears.
 */
export function rowsFor(effects: readonly string[] | undefined): EffectId[] {
  if (effects === undefined || effects.length === 0) return ['undeclared'];
  const rows = new Set<EffectId>();
  for (const e of effects) rows.add(KNOWN.has(e) ? (e as EffectId) : 'undeclared');
  return [...rows];
}

const covers = (s: Standing, call: CallFacts, rows: readonly EffectId[]): boolean =>
  s.workspace === call.workspace &&
  (s.kind === 'command'
    ? call.target !== undefined && s.value === call.target
    : rows.includes(s.value as EffectId));

/**
 * The whole decision. Pure, and testable with no engine and no screen.
 *
 * The strictest row wins. A call declaring two effects is governed by both, and
 * a single `forbidden` refuses it — permission is not the maximum of what its
 * parts allow.
 */
export function decide(
  mode: Mode,
  table: EffectTable,
  call: CallFacts,
  standing: readonly Standing[] = []
): Verdict {
  const rows = rowsFor(call.effects);

  // Forbidden first, and before standing approvals: a permission granted in
  // passing must never outrank a row a person set deliberately.
  const denied = rows.filter(r => table[r] === 'forbidden');
  if (denied.length > 0) return {verdict: 'deny', reason: reasonFor(denied, call)};

  // Plan mode never reaches a tool call — beforePlanExecution has already
  // aborted. Answered here anyway so the function is total, and so a caller
  // that asks in the wrong mode gets a refusal rather than an accident.
  if (mode === 'plan') return {verdict: 'deny', reason: 'plan mode — nothing is executed'};

  if (mode === 'automatic') return {verdict: 'allow'};

  const asking = rows.filter(r => table[r] === 'needs-approval');
  if (asking.length === 0) return {verdict: 'allow'};
  if (standing.some(s => covers(s, call, asking))) return {verdict: 'allow'};
  return {verdict: 'ask', effects: asking};
}

/** Said to the WORKER, which reads it as a refused call and adapts. */
const reasonFor = (rows: readonly EffectId[], call: CallFacts): string =>
  `${call.toolName} is not permitted here: ${rows.join(', ')} is forbidden in ${call.workspace}`;
