import type {EngineEvent} from './adapter.js';
import {makeCancellation} from './cancel.js';

// ── The terminal's one door to the engine ────────────────────────────────────
//
// Loaded BY PATH, not as a dependency: the console stays at zero dependencies,
// the coupling is something a reader can see, and a user can point it
// elsewhere with ENGINE_PATH. A console that cannot find an engine reports
// that; it does not crash.
//
// NOTHING THE ENGINE PRINTS MAY REACH THE SCREEN. It logs through pino, whose
// quietest level is `error`, and dotenvx writes a banner at import — either one
// lands mid-frame and tears it. Both streams are captured for the duration of
// the import, and what they wrote becomes content this console can show rather
// than damage it has to survive.
//
// The frames themselves are safe from that capture because `screen.ts` holds
// its own `process.stdout.write`, taken at load. That is not a detail: without
// it, a measured run put three frames out of forty-one on the screen and the
// boot looked frozen.

const DEFAULT_ENGINE =
  process.env['ENGINE_PATH'] ?? '/home/spark/agent-engine/packages/engine-core/dist/index.js';

export type Engine = {
  /** Every execution event, already narrowed by the engine's own contract. */
  watch(handler: (event: EngineEvent) => void): () => void;
  /**
   * Submit a goal. Resolves when the engine has finished with it.
   *
   * The caller names it: `GoalRequest.id` is honoured as given
   * (main-brain.ts:263, `req.id || randomUUID()`), and a console that knows the
   * id from the first millisecond can stop the goal before a single event has
   * arrived — the window where a stop is worth most.
   */
  submit(goal: string, goalId: string): Promise<{success: boolean; status: string}>;
  /**
   * Stop a running goal at the engine's next boundary.
   *
   * Not an interrupt: see cancel.ts. The `stopped` line the reader sees comes
   * from the engine's own `completion.finished`, not from this call — which is
   * why this returns nothing and cannot fail. A goal that has already ended, or
   * that never existed, is a mark nobody reads.
   */
  cancel(goalId: string): void;
  // NO `answer`. The engine has no clarification state and no second entry
  // point: when it needs something it says so and the goal ends, and the next
  // thing typed is an ordinary `submit` that arrives with the exchange above it.
  shutdown(): Promise<void>;
};

export type EngineFailure = {
  readonly failed: true;
  /** What went wrong, in one line — this is what the console shows. */
  readonly reason: string;
  /** Whatever the engine printed on the way, kept rather than discarded. */
  readonly captured: readonly string[];
};

/** Swallow both output streams and hand back what they were given. */
function capture(): {lines: string[]; restore: () => void} {
  const lines: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  const take =
    () =>
    (chunk: unknown, ...rest: unknown[]): boolean => {
      const text = String(chunk).trim();
      if (text !== '') lines.push(text);
      const done = rest.find(a => typeof a === 'function') as (() => void) | undefined;
      if (done) done();
      return true;
    };
  process.stdout.write = take() as typeof process.stdout.write;
  process.stderr.write = take() as typeof process.stderr.write;
  return {
    lines,
    restore: () => {
      process.stdout.write = realOut;
      process.stderr.write = realErr;
    }
  };
}

const message = (error: unknown) =>
  error instanceof Error ? error.message.split('\n')[0]! : String(error);

/**
 * Wake the engine, or say why it could not be woken.
 *
 * A failure is a value, not a throw: not finding an engine, or finding one that
 * cannot reach its store, is an ordinary state for a console to be in and to
 * report. It is not an exception for the loop to survive.
 */
export async function openEngine(enginePath = DEFAULT_ENGINE): Promise<Engine | EngineFailure> {
  // The engine's logger has no silent level; `error` is as quiet as it goes,
  // and anything it still writes is captured below.
  process.env['LOG_LEVEL'] ??= 'error';

  // WHERE THE ENGINE'S CONFIGURATION LIVES, said by the only thing that knows.
  //
  // engine-core resolves its `.env` by walking up from INIT_CWD or cwd
  // (core/env-path.ts). Run from this console, that walk starts in the
  // console's own directory and finds nothing — so the engine came up with no
  // API key and no database: measured, DeepSeek answered
  // `401 Authentication Fails (auth header format should be Bearer sk-...)`
  // and persistence fell back to in-memory, and a plain goal failed at its
  // first clarity call.
  //
  // The console knows the engine's path and therefore its root; the engine
  // cannot know the console's. INIT_CWD is the variable engine-core reads
  // first, and setting it is how a host says "my configuration is over here"
  // without the engine having to guess.
  // Assigned, not defaulted: npm sets INIT_CWD to the directory `npm run` was
  // invoked from, which for this console is the console — so `??=` changed
  // nothing and the key stayed unset. Measured before this line was corrected.
  // The engine's root is what this variable must say here, and only the door
  // knows it.
  const engineRoot = enginePath.replace(/\/packages\/.*$/, '');
  if (engineRoot !== enginePath) process.env['INIT_CWD'] = engineRoot;

  const held = capture();

  try {
    const core = (await import(enginePath)) as {
      ApplicationRuntime: {
        create(o: {config: unknown; middleware?: unknown[]}): Promise<Record<string, unknown>>;
      };
      loadRuntimeConfigFromEnv(): unknown;
      MiddlewareControlSignal: new (message: string) => Error;
    };
    const config = core.loadRuntimeConfigFromEnv();
    // The engine's own signal class, handed to the host's own middleware — the
    // engine tests the thrown value with `instanceof`, so it has to be this one.
    const cancellation = makeCancellation(core.MiddlewareControlSignal);
    const app = await core.ApplicationRuntime.create({
      config,
      middleware: [cancellation.middleware]
    });

    return {
      watch: handler =>
        (app['watchExecutions'] as (h: (e: unknown) => void) => () => void)(event => {
          // The engine's envelope is wider than this console reads. Narrowing
          // here, once, is what keeps `adapter.ts` free of engine types.
          const e = event as {eventType?: unknown; goalId?: unknown; payload?: unknown};
          if (typeof e.eventType !== 'string' || typeof e.goalId !== 'string') return;
          handler({
            eventType: e.eventType,
            goalId: e.goalId,
            payload: (e.payload ?? {}) as Record<string, unknown>
          });
        }),
      // `executeGoal`, not `submitGoal`: ApplicationRuntime:64 is the host's
      // entry point and MainBrain's `submitGoal` is behind it. Checked rather
      // than assumed — the wrong name would have compiled, since the runtime is
      // reached through an index signature.
      // A cancelled goal REJECTS with the signal this console threw — the
      // engine hands the host's own error back untouched (main-brain.ts:290),
      // by design. It has already recorded `stopped` and published
      // completion.finished before rethrowing, so the screen is told by the
      // event; here the signal is simply absorbed by the one who threw it.
      // Anything else still rejects, and the caller still sees it.
      submit: async (goal, goalId) => {
        try {
          const result = await (
            app['executeGoal'] as (r: {
              goal: string;
              id: string;
            }) => Promise<{success: boolean; status: string}>
          )({goal, id: goalId});
          return {success: result?.success ?? false, status: result?.status ?? 'unknown'};
        } catch (error) {
          if (!cancellation.owns(error)) throw error;
          return {success: false, status: 'stopped'};
        }
      },
      cancel: goalId => cancellation.cancel(goalId),
      shutdown: () => (app['shutdown'] as () => Promise<void>)()
    };
  } catch (error) {
    return {failed: true, reason: message(error), captured: [...held.lines]};
  } finally {
    held.restore();
  }
}

export const isFailure = (e: Engine | EngineFailure): e is EngineFailure =>
  (e as EngineFailure).failed === true;
