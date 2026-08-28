import {decide, rowsFor, type CallFacts, type Verdict} from './decide.js';
import type {EffectId, EffectTable, Mode, Standing} from '../settings/store.js';

// ── EVERYTHING THE CONSOLE HANDS THE ENGINE ─────────────────────────────────
//
// One object, registered once at `ApplicationRuntime.create()`. It closes over
// LIVE console state, so the mode and the table can change mid-session with no
// restart and no reconnection — the pattern cancel.ts already proved, with a
// different variable.
//
// WHY APPROVAL ATTACHES TO `beforeToolCall` AND NOTHING ELSE. Of the engine's
// seven hooks it is the only one that returns a value: `{allow, reason}`,
// first-deny-wins (runtime/middleware-runner.ts). A denial there is SOFT — the
// call does not happen, the worker reads `[ERROR] Blocked: …` as a failed call
// and adapts, and the goal continues. Every other hook can only throw, and a
// throw is a hard abort of its scope.
//
// WHY PLAN ATTACHES TO `beforePlanExecution`. It fires after the plan exists
// and before anything runs, and its context carries the taskPlan, the frozen
// goalContract and the risk assessment. Throwing there is a HOST ABORT: the
// goal ends having produced and reported its plan, with the tool-call count at
// zero. That is not a simulation and not a dry run — nothing was executed.
//
// AND WHY A WAVE IS NOT USED FOR EITHER. A wave is one `await spawnAll(...)`,
// so a decision raised at wave level is not seen until every worker in that
// wave has finished; a single-wave plan could not be gated at all. Tool calls
// are checked one at a time, inside the worker.

export type ApprovalRequest = {
  readonly id: string;
  readonly goalId: string;
  readonly toolName: string;
  readonly effects: readonly EffectId[];
  readonly target: string | undefined;
  readonly requester: string;
  readonly workspace: string;
};

/** How a person answered. `once` and `refuse` are this call; the rest are kept. */
export type Answer = 'once' | 'command' | 'row' | 'refuse';

/** What the engine had decided to do, reported instead of done. */
export type PlannedWork = {
  readonly goalId: string;
  readonly tasks: ReadonlyArray<{readonly title: string; readonly targets: readonly string[]}>;
  readonly contract: readonly string[];
  readonly attempt: number;
};

/** What the console must supply for a decision to be made. */
export type Live = {
  mode(): Mode;
  table(): EffectTable;
  standing(): readonly Standing[];
  workspace(): string;
  /** Show a request and resolve when a person answers it. */
  ask(request: ApprovalRequest): Promise<Answer>;
  /** A person said `keep this` — the console persists it and says so. */
  remember(request: ApprovalRequest, answer: 'command' | 'row'): void;
  /**
   * The plan the engine produced, in plan mode, before anything ran.
   *
   * `beforePlanExecution` fires AFTER the plan exists and BEFORE any tool call,
   * so its context carries the real thing: the tasks the engine decided on and
   * the contract it froze. Nothing here is predicted — a plan mode that showed
   * a guess would be a simulation, which this is not.
   */
  planned(plan: PlannedWork): void;
  /**
   * The console refused a call by its own policy.
   *
   * It has to SAY so. Observed live on 2026-08-28: with writes forbidden, a
   * goal produced five failing tool calls and the transcript reported only
   * that the engine had noticed problems — the one thing a person needed to
   * know, that this console refused them, was the one thing missing. A refusal
   * the console makes and does not report is the console hiding its own act.
   */
  refused(request: {toolName: string; reason: string}): void;
};

export type Control = {
  /** Mark a running goal for cancellation. Cheap, idempotent, never throws. */
  cancel(goalId: string): void;
  /** Is this the signal this module threw? */
  owns(error: unknown): boolean;
  /** Was this goal stopped before its plan ran, by plan mode? */
  planOnly(goalId: string): boolean;
  readonly middleware: Record<string, unknown>;
};

/**
 * `MiddlewareControlSignal` is loaded FROM the engine, never re-declared: the
 * engine tests the thrown value with `instanceof`, so a look-alike class is
 * reported as a crashed step instead of a host decision — the exact failure
 * that class exists to end.
 */
export function makeControl(Signal: new (message: string) => Error, live: Live): Control {
  const marked = new Set<string>();
  const planned = new Set<string>();
  let asked = 0;

  class GoalCancelled extends Signal {}
  class PlanOnly extends Signal {}

  const stopIfMarked = (goalId: string): void => {
    // Deleted before throwing: the mark is spent. A goalId is unique per run so
    // a stale mark could not reach a later goal anyway, but a set that only
    // grows is a leak in a console that stays open for days.
    if (!marked.delete(goalId)) return;
    throw new GoalCancelled('stopped from the console');
  };

  return {
    cancel: goalId => void marked.add(goalId),
    owns: error => error instanceof GoalCancelled || error instanceof PlanOnly,
    planOnly: goalId => planned.has(goalId),
    middleware: {
      beforePlanExecution(ctx: {
        goalId: string;
        attempt?: number;
        taskPlan?: {childTasks?: ReadonlyArray<{title?: string; targetFiles?: string[]}>};
        goalContract?: {requirements?: ReadonlyArray<{type?: string} | string>};
      }) {
        stopIfMarked(ctx.goalId);
        if (live.mode() !== 'plan') return;
        planned.add(ctx.goalId);
        live.planned({
          goalId: ctx.goalId,
          attempt: ctx.attempt ?? 1,
          tasks: (ctx.taskPlan?.childTasks ?? []).map(t => ({
            title: t.title ?? '',
            targets: t.targetFiles ?? []
          })),
          contract: (ctx.goalContract?.requirements ?? []).map(r =>
            typeof r === 'string' ? r : (r.type ?? '')
          )
        });
        throw new PlanOnly('plan mode — the plan was produced and nothing was run');
      },

      beforeWave(ctx: {goalId: string}) {
        stopIfMarked(ctx.goalId);
      },

      async beforeToolCall(ctx: {
        goalId: string;
        toolName: string;
        requester?: {role?: string};
        effects?: ReadonlyArray<{id: string; target?: unknown}>;
        workspaceDir?: string;
      }): Promise<{allow: boolean; reason?: string}> {
        const declared = ctx.effects?.map(e => e.id);
        const target = ctx.effects?.find(e => e.target !== undefined)?.target;
        const facts: CallFacts = {
          toolName: ctx.toolName,
          effects: declared,
          // Left exactly as the capability named it — un-normalised, because
          // the first normalisation at a policy seam is the first
          // interpretation, and the engine says so where it hands it over.
          target: typeof target === 'string' ? target : undefined,
          workspace: live.workspace()
        };

        const verdict: Verdict = decide(live.mode(), live.table(), facts, live.standing());
        if (verdict.verdict === 'allow') return {allow: true};
        if (verdict.verdict === 'deny') {
          live.refused({toolName: ctx.toolName, reason: verdict.reason});
          return {allow: false, reason: verdict.reason};
        }

        const request: ApprovalRequest = {
          id: `ask-${++asked}`,
          goalId: ctx.goalId,
          toolName: ctx.toolName,
          effects: rowsFor(declared),
          target: facts.target,
          requester: ctx.requester?.role ?? 'a worker',
          workspace: facts.workspace
        };
        const answer = await live.ask(request);
        if (answer === 'refuse')
          return {allow: false, reason: 'refused from the console'};
        if (answer === 'command' || answer === 'row') live.remember(request, answer);
        return {allow: true};
      }
    }
  };
}
