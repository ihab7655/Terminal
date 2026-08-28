import type {EngineEvent} from './adapter.js';
import {makeControl, type Control, type Live} from './policy/middleware.js';

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

// ── The optional second door ────────────────────────────────────────────────
//
// `official-runtime` is a SEPARATE package that consumes the engine's public
// SDK exactly as any host does — it is not part of engine-core and it is not
// required for the console to run. It holds the Reliability & Cost Guardian,
// which computes an advisory report about one execution and is, in its own
// words, "advisory only — a report, never an action".
//
// Loaded by path like the engine, and its absence is an ORDINARY STATE: the
// Inspector simply shows no guardian section. A console that refused to open
// because an optional package was missing would have made it a requirement.
const DEFAULT_RUNTIME =
  process.env['OFFICIAL_RUNTIME_PATH'] ??
  '/home/spark/agent-engine/packages/official-runtime/dist/index.js';

const DEFAULT_ENGINE =
  process.env['ENGINE_PATH'] ?? '/home/spark/agent-engine/packages/engine-core/dist/index.js';

import type {Standing} from './session.js';

/** What one goal submission carries. The console names the goal itself. */
export type Submission = Standing & {
  readonly goal: string;
  /**
   * The console's own id for this run, honoured by the engine as given
   * (main-brain.ts:263, `req.id || randomUUID()`) — which is what lets Esc
   * stop a goal before a single event has arrived.
   */
  readonly id: string;
};

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
  submit(req: Submission): Promise<{success: boolean; status: string}>;
  /**
   * What the engine was GIVEN — read for display, never written.
   *
   * The engine resolves its configuration from `.env` at import and holds it
   * for the life of the process, so changing a provider or a key is a restart
   * and not a settings change. This console therefore READS it and says where
   * it lives; it does not write that file.
   */
  configuration(): ReadonlyArray<readonly [string, string]>;
  /**
   * What the engine can reach for right now.
   *
   * Read from the registry it actually holds — `context.toolRegistry` — not
   * from a list kept here, so a capability the engine grew or generated shows
   * up without this console being edited.
   */
  capabilities(): ReadonlyArray<{name: string; category: string}>;
  /** Every goal on record, newest first — `listGoals()` on the engine's store. */
  goals(limit?: number): Promise<readonly GoalRow[]>;
  /**
   * The conversations on record, newest first.
   *
   * A conversation IS the engine's session: the id it keys its own memory on —
   * summary, compacted context, recent turns. So this groups goals by that id
   * rather than inventing a thread of its own, and continuing one means
   * submitting the next goal with the same id, which is all the engine ever
   * needed to read a message in its conversation.
   */
  conversations(limit?: number): Promise<ReadonlyArray<{
    id: string; goals: number; last: string; at: string;
  }>>;
  /**
   * The whole record of ONE execution — `replay()`, a public engine export.
   *
   * Assembled on demand from storage, never held live: it is the counterpart of
   * the event stream, which is live-only and does not survive the process.
   */
  record(goalId: string): Promise<ExecutionRecord | null>;
  /**
   * What the Guardian concluded about one execution, if it is available.
   *
   * Advisory only, and optional: an empty list means the report said nothing or
   * the package is not there, and the Inspector draws neither differently from
   * the other, because a reader is owed neither a false alarm nor a false calm.
   */
  guardian(goalId: string): Promise<readonly string[]>;
  /**
   * Amend a goal that is already running (ADR-012).
   *
   * It stops nothing and restarts nothing: the engine records what was said,
   * reads what it changes, and routes it. What became of it arrives as the six
   * `directive.*` events, so nothing here has to report it.
   */
  steer(goalId: string, text: string): Promise<void>;
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

/** One row of history, as the engine's store returns it. */
export type GoalRow = {
  readonly id: string;
  readonly goal: string;
  readonly status: string;
  readonly createdAt: Date;
};

/** One execution, read whole. Narrowed here so nothing above sees engine types. */
export type ExecutionRecord = {
  readonly goalId: string;
  readonly status: string;
  readonly attempts: number | null;
  readonly durationMs: number | null;
  readonly workspace: string | null;
  readonly tasks: readonly string[];
  readonly evidence: readonly string[];
  readonly workers: ReadonlyArray<{role: string; status: string; steps: number | null}>;
  readonly retries: readonly string[];
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
export async function openEngine(
  live: Live,
  enginePath = DEFAULT_ENGINE
): Promise<Engine | EngineFailure> {
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
      replay(goalId: string, storage: unknown): Promise<unknown>;
    };
    const config = core.loadRuntimeConfigFromEnv();
    // The engine's own signal class, handed to the host's own middleware — the
    // engine tests the thrown value with `instanceof`, so it has to be this one.
    const control = makeControl(core.MiddlewareControlSignal, live);
    const app = await core.ApplicationRuntime.create({
      config,
      middleware: [control.middleware]
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
      submit: async req => {
        const goalId = req.id;
        try {
          const result = await (
            app['executeGoal'] as (r: {
              goal: string;
              id: string;
              sessionId: string;
              workspaceDir: string;
            }) => Promise<{success: boolean; status: string}>
          )({
            goal: req.goal,
            id: req.id,
            // Both are DECLARED on GoalRequest already (brain/types.ts:45), and
            // `sessionId` is declared required there. Sending them is host work
            // and changes nothing in the engine — what changes is that the
            // engine can now read this console's messages as a conversation,
            // and that where work lands is stated rather than defaulted.
            sessionId: req.sessionId,
            workspaceDir: req.workspace
          });
          return {success: result?.success ?? false, status: result?.status ?? 'unknown'};
        } catch (error) {
          if (!control.owns(error)) throw error;
          // Plan mode is an ENDING, not a stop: the engine produced the plan,
          // reported it, and ran nothing. Said apart so the console never
          // draws one as the other.
          return {success: false, status: control.planOnly(goalId) ? 'planned' : 'stopped'};
        }
      },
      // `steerGoal` lives on ApplicationRuntime (checked, not assumed — the
      // wrong name would compile through the index signature). It returns the
      // Directive with the engine's conclusion on it; the console reads that
      // conclusion from the events instead, which is the one account.
      steer: async (goalId, text) => {
        await (app['steerGoal'] as (g: string, t: string) => Promise<unknown>)(goalId, text);
      },
      configuration: () => {
        const c = config as Record<string, unknown>;
        const llm = (c['llm'] ?? {}) as Record<string, unknown>;
        const key = typeof llm['apiKey'] === 'string' ? llm['apiKey'] : '';
        return [
          ['provider', String(llm['provider'] ?? '—')],
          ['model', String(llm['model'] ?? 'the provider default')],
          // Never the key itself. Its LAST characters, which is enough to tell
          // one key from another and not enough to be one.
          ['api key', key === '' ? 'not set' : `set · …${key.slice(-4)}`],
          ['database', String((c['persistence'] as Record<string, unknown> | undefined)?.['type'] ?? '—')],
          ['redis', String(c['redisUrl'] ?? '—')],
          ['engine', enginePath.replace(/\/packages\/.*$/, '')],
          ['config', `${engineRoot}/.env — read here, never written`]
        ] as ReadonlyArray<readonly [string, string]>;
      },
      capabilities: () => {
        // BOUND, not detached. These are methods on a class and they use
        // `this`; pulling one out of the object and calling it loses the
        // receiver, and `this.tools` is then undefined. It failed silently the
        // first time — the catch below turned a TypeError into an empty list,
        // and Capabilities read "nothing on record yet" for an engine holding
        // eleven tools.
        const reg = (app['context'] as {toolRegistry: Record<string, unknown>}).toolRegistry;
        const names = (reg['list'] as () => string[]).call(reg);
        const get = (n: string) =>
          (reg['get'] as (x: string) => {planning?: {category?: string}} | undefined).call(reg, n);
        return names.map(name => ({
          name,
          // The engine's own grouping, when it declares one. Never guessed
          // from the name — a tool the engine generates would be grouped by a
          // rule this console invented, which is exactly the closed table the
          // engine removed.
          category: get(name)?.planning?.category ?? 'other'
        })).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      },
      guardian: async goalId => {
        try {
          const rt = (await import(DEFAULT_RUNTIME)) as {
            createGuardian(storage: unknown, recorder: unknown): {
              observe(id: string): Promise<Record<string, unknown>>;
            };
            InMemoryFlightRecorder: new () => unknown;
          };
          if (typeof rt.createGuardian !== 'function') return [];
          const storage = (app['context'] as {storage: unknown}).storage;
          const report = await rt.createGuardian(storage, new rt.InMemoryFlightRecorder()).observe(goalId);
          const headline = typeof report['headline'] === 'string' ? report['headline'] : '';
          const efficiency = typeof report['efficiency'] === 'string' ? report['efficiency'] : '';
          const recs = Array.isArray(report['recommendations'])
            ? (report['recommendations'] as unknown[]).map(String)
            : [];
          return [efficiency ? `${efficiency} — ${headline}` : headline, ...recs].filter(Boolean);
        } catch {
          // Absent, or unable to report. Both are silence, and silence here is
          // honest: the Guardian says nothing rather than the console inventing
          // a verdict on its behalf.
          return [];
        }
      },
      conversations: async limit => {
        const storage = (app['context'] as {storage: Record<string, unknown>}).storage;
        const rows = await (storage['listGoals'] as (n?: number) => Promise<GoalRow[]>)
          .call(storage, limit ?? 60);

        // LIMIT OF CURRENT ENGINE SURFACE, worked around with declared surface
        // rather than papered over: `listGoals()` selects id, goal, status and
        // createdAt — and NOT sessionId (infra/persistence.service.ts:342). So
        // the goal-to-conversation link is read one goal at a time through
        // `getGoalRecord()`, which does carry it.
        //
        // Bounded by the same limit, and only when this place is opened. A
        // cheaper read would need a column `listGoals` does not return, and
        // inventing the grouping from anything else — the goal's text, its
        // timing — would be a thread this console made up rather than the one
        // the engine actually keys its memory on.
        // IN PARALLEL, not one after another. The first version awaited each
        // record inside the loop: sixty round trips in series, and the place
        // sat on "reading the record…" until it gave up. The reads do not
        // depend on each other, so they are all in flight at once.
        const record = (storage['getGoalRecord'] as (id: string) => Promise<{sessionId?: string | null} | null>);
        const metas = await Promise.all(
          (rows ?? []).map(r => record.call(storage, r.id).catch(() => null))
        );
        const byId = new Map<string, {id: string; goals: number; last: string; at: string}>();
        (rows ?? []).forEach((r, i) => {
          const id = metas[i]?.sessionId;
          // A goal with no session belongs to no conversation. Skipped rather
          // than gathered into an invented one: goals sent before this console
          // carried an id genuinely cannot see each other, and a thread that
          // pretended otherwise would claim something about the engine's memory
          // that is not true.
          if (typeof id !== 'string' || id === '') return;
          const seen = byId.get(id);
          if (seen) { seen.goals += 1; return; }
          byId.set(id, {
            id,
            goals: 1,
            last: r.goal.split('\n')[0] ?? r.goal,
            at: new Date(r.createdAt).toISOString().replace('T', ' ').split('.')[0] ?? ''
          });
        });
        return [...byId.values()];
      },
      goals: async limit => {
        const storage = (app['context'] as {storage: Record<string, unknown>}).storage;
        const rows = await (storage['listGoals'] as (n?: number) => Promise<GoalRow[]>).call(storage, limit);
        return rows ?? [];
      },
      record: async goalId => {
        const storage = (app['context'] as {storage: unknown}).storage;
        const data = (await core.replay(goalId, storage)) as Record<string, unknown>;
        if (!data) return null;
        const rec = (data['goalRecord'] ?? {}) as Record<string, unknown>;
        const snaps = (data['planningSnapshots'] ?? []) as Array<Record<string, unknown>>;
        // The tasks of the LAST attempt: an earlier attempt's plan is history
        // the retry rows already carry, and showing every attempt's tasks at
        // once reads as one plan far larger than any that existed.
        const last = snaps[snaps.length - 1]?.['snapshot'] as Record<string, unknown> | undefined;
        const plan = (last?.['taskPlan'] ?? last) as Record<string, unknown> | undefined;
        const children = (plan?.['childTasks'] ?? []) as Array<Record<string, unknown>>;
        return {
          goalId,
          status: String(rec['status'] ?? 'unknown'),
          attempts: (rec['attempts'] as number | null) ?? null,
          durationMs: (rec['durationMs'] as number | null) ?? null,
          workspace: (rec['workspacePath'] as string | null) ?? null,
          tasks: children.map(t => String(t['title'] ?? '')).filter(Boolean),
          evidence: ((data['evidence'] ?? []) as Array<Record<string, unknown>>)
            .map(e => String(e['type'] ?? '')).filter(Boolean),
          workers: ((data['workers'] ?? []) as Array<Record<string, unknown>>).map(w => ({
            role: String(w['role'] ?? ''),
            status: String(w['status'] ?? ''),
            steps: (w['stepsCount'] as number | null) ?? null
          })),
          retries: ((data['retryHistory'] ?? []) as Array<Record<string, unknown>>)
            .map(r => String(r['lesson'] ?? r['reason'] ?? '')).filter(Boolean)
        };
      },
      cancel: goalId => control.cancel(goalId),
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
