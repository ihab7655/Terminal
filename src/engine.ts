// ── The terminal's one door to the engine ────────────────────────────────────
//
// The console does not depend on engine-core as a package. It loads it by path
// at run time, which keeps this project at zero dependencies and makes the
// coupling something a reader can see and a user can point elsewhere. A console
// that cannot find an engine is a console reporting that, not a crash.
//
// NOTHING THE ENGINE PRINTS MAY REACH THE SCREEN. It logs through pino, whose
// quietest level is `error`, and dotenvx writes a banner at import — either one
// lands in the middle of a frame we own and tears it. Both streams are captured
// for as long as the engine is loaded, and what they wrote becomes content this
// console can show rather than damage it has to survive.
//
// Every check below is a real call with a real elapsed time. A spinner that
// turns while nothing is being asked is a screen claiming work it did not do,
// which is the same defect the engine caught in its own CLI view: it printed
// "repairing a capability" while nothing was being repaired.

export type CheckState = 'waiting' | 'running' | 'ok' | 'failed';

export type Check = {
  readonly id: string;
  readonly label: string;
  readonly state: CheckState;
  /** What the check FOUND. Empty until it has found it. */
  readonly detail: string;
  readonly elapsedMs: number;
};

export type ToolFact = {readonly name: string; readonly category: string};

export type EngineFacts = {
  readonly checks: readonly Check[];
  readonly tools: readonly ToolFact[];
  readonly captured: readonly string[];
  /** Present only once every check has passed. */
  readonly runtime: EngineRuntime | null;
};

/** Only what this console actually calls. Typing it to the whole runtime would
 *  make a display depend on the engine's entry point. */
export type EngineRuntime = {
  watchExecutions(handler: (event: unknown) => void): () => void;
  shutdown(): Promise<void>;
};

const DEFAULT_ENGINE =
  process.env['ENGINE_PATH'] ?? '/home/spark/agent-engine/packages/engine-core/dist/index.js';

const PLAN: ReadonlyArray<{id: string; label: string}> = [
  {id: 'config', label: 'CONFIG'},
  {id: 'engine', label: 'ENGINE'},
  {id: 'storage', label: 'STORAGE'},
  {id: 'tools', label: 'TOOLS'},
  {id: 'stream', label: 'EVENT STREAM'}
];

export const waitingChecks = (): Check[] =>
  PLAN.map(p => ({...p, state: 'waiting' as const, detail: '', elapsedMs: 0}));

/** Swallow both output streams and hand back what they were given. */
function capture(): {lines: string[]; restore: () => void} {
  const lines: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  const take =
    () =>
    (chunk: unknown, ...rest: unknown[]): boolean => {
      lines.push(String(chunk));
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
 * Wake the engine, reporting each step as it happens.
 *
 * `onProgress` is called after every state change, so the screen animates
 * because work is finishing and not because a clock is running.
 */
export async function bootEngine(
  onProgress: (facts: EngineFacts) => void,
  enginePath = DEFAULT_ENGINE
): Promise<EngineFacts> {
  const checks = waitingChecks();
  let tools: ToolFact[] = [];
  let runtime: EngineRuntime | null = null;
  const held = capture();

  const report = () =>
    onProgress({checks: [...checks], tools: [...tools], captured: [...held.lines], runtime});

  const step = async <T>(index: number, run: () => Promise<T> | T): Promise<T | undefined> => {
    const started = Date.now();
    checks[index] = {...checks[index]!, state: 'running'};
    report();
    try {
      const value = await run();
      checks[index] = {...checks[index]!, state: 'ok', elapsedMs: Date.now() - started};
      return value;
    } catch (error) {
      checks[index] = {
        ...checks[index]!,
        state: 'failed',
        detail: message(error),
        elapsedMs: Date.now() - started
      };
      return undefined;
    } finally {
      report();
    }
  };

  const found = (index: number, detail: string) => {
    checks[index] = {...checks[index]!, detail};
  };

  try {
    // The engine's logger has no silent level; `error` is as quiet as it goes,
    // and anything it still writes is captured above.
    process.env['LOG_LEVEL'] ??= 'error';

    const core = await step(0, async () => {
      const loaded = (await import(enginePath)) as {
        ApplicationRuntime: {create(o: {config: unknown}): Promise<Record<string, any>>};
        loadRuntimeConfigFromEnv(): unknown;
      };
      const config = loaded.loadRuntimeConfigFromEnv();
      found(0, 'loaded from the environment');
      return {loaded, config};
    });
    if (!core) return {checks, tools, captured: held.lines, runtime: null};

    const app = await step(1, async () => {
      const built = await core.loaded.ApplicationRuntime.create({config: core.config});
      found(1, 'built');
      return built;
    });
    if (!app) return {checks, tools, captured: held.lines, runtime: null};

    const context = app['context'] as Record<string, any>;

    await step(2, () => {
      const ready = context['storage'].isReady() as boolean;
      if (!ready) throw new Error('the store reported that it is not ready');
      found(2, 'connected');
      return ready;
    });

    await step(3, () => {
      const registry = context['toolRegistry'];
      tools = (registry.getPlanningInfo() as Array<{name: string; category: string}>).map(t => ({
        name: t.name,
        category: t.category
      }));
      const categories = new Set(tools.map(t => t.category)).size;
      found(3, `${registry.count()} registered · ${categories} categories`);
      return tools;
    });

    await step(4, () => {
      // Subscribing and letting go proves the stream is wired without holding
      // a handler this function has no use for.
      const stop = app['watchExecutions'](() => {}) as () => void;
      stop();
      found(4, 'watching');
      return true;
    });

    if (checks.every(c => c.state === 'ok')) {
      runtime = {
        watchExecutions: h => app['watchExecutions'](h) as () => void,
        shutdown: () => app['shutdown']() as Promise<void>
      };
    }
  } finally {
    held.restore();
  }

  const facts = {checks, tools, captured: held.lines, runtime};
  onProgress(facts);
  return facts;
}
