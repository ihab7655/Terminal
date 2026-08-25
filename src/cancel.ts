// ── Stopping a goal, from outside it ─────────────────────────────────────────
//
// The engine cannot cancel itself, and says so in its own words
// (execution.coordinator.ts:344): "workers in flight cannot be cancelled
// (nothing in this engine can — there is no AbortController anywhere)".
//
// What it has instead is a way for a HOST to abort a run as control flow rather
// than as a fault: a middleware hook that throws `MiddlewareControlSignal`.
// Per its own header, engine-core never throws it — "control is the host's
// alone". This console is the host, so cancellation is written here, in forty
// lines, and the engine learns nothing new.
//
// This is a flag the engine walks past, not an interrupt:
//
//   Ctrl+C ─→ cancel(goalId)          the id is now marked
//   engine ─→ beforePlanExecution     marked? throw. (covers the planning window)
//   engine ─→ beforeWave              marked? throw. (covers execution)
//             ↓
//             MainBrain records `stopped`, publishes completion.finished,
//             and rethrows the signal to whoever submitted the goal.
//
// THE COST, SAID PLAINLY: a wave is one `await spawnAll(...)`, so a cancel
// raised mid-wave is not seen until every worker in that wave has finished. A
// single-wave plan cannot be stopped at all once it starts. That is a property
// of the engine, not of this file, and it is why the console says "stopping"
// and not "stopped" until the event arrives.
//
// Proven before it was written: agent-engine
// tests/unit/brain/host-cancellation-propagation.test.ts and
// docs/lld/host-cancellation-lld.md §7.

/** The host's own signal, so it can tell its cancel from anyone else's. */
export type Cancellation = {
  /** Mark a running goal for cancellation. Cheap, idempotent, never throws. */
  cancel(goalId: string): void;
  /** Is this the signal this file threw? */
  owns(error: unknown): boolean;
  /** Handed to `ApplicationRuntime.create({middleware})`. */
  readonly middleware: {
    beforePlanExecution(ctx: {goalId: string}): void;
    beforeWave(ctx: {goalId: string}): void;
  };
};

/**
 * `MiddlewareControlSignal` is loaded from the engine, not re-declared: the
 * engine tests the thrown value with `instanceof`
 * (cognitive-plan-executor.ts:326, main-brain.ts:278), so a look-alike class
 * would be reported as a crashed step instead of a host decision — the exact
 * failure that class was created to end.
 */
export function makeCancellation(Signal: new (message: string) => Error): Cancellation {
  const marked = new Set<string>();

  class GoalCancelled extends Signal {}

  const stopIfMarked = (goalId: string): void => {
    if (!marked.delete(goalId)) return;
    // Deleted before throwing, not after: the id is spent. A goalId is unique
    // per run, so a stale mark could not reach a later goal anyway — but a set
    // that only ever grows is a leak in a console that stays open for days.
    throw new GoalCancelled('stopped from the console');
  };

  return {
    cancel: goalId => void marked.add(goalId),
    owns: error => error instanceof GoalCancelled,
    middleware: {
      beforePlanExecution: ctx => stopIfMarked(ctx.goalId),
      beforeWave: ctx => stopIfMarked(ctx.goalId)
    }
  };
}
