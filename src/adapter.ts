import type {Item} from './console.js';

// ── The engine's events, as things a person reads ────────────────────────────
//
// The console does not import the engine. This file states the shape of what it
// consumes, and `engine-core` publishes exactly that: `KnownExecutionEvent`,
// a discriminated union over `eventType` with a typed payload per name. A host
// that wires the two passes events straight in — no cast, because the contract
// is exported (`asKnown`).
//
// WHY AN ADAPTER AND NOT A SHARED LAYER. Settled after an audit and recorded in
// HANDOFF: each UI writes its own. `ExecutionView` mixes engine truth with
// English phrasing, and the truth half is what an adapter must re-encode. The
// wording below is this console's, not the engine's, and a web UI would write
// different wording over the same facts.
//
// THE MAPPING IS DERIVED FROM THE EVENTS, NOT FROM A DESIGN. The 28 events were
// grouped by what they mean to a reader, and the grouping produced the content
// types — not the other way round, which is the mistake that cost a whole
// screen once:
//
//   phase   goal.started · classification.completed · planning.started/.finished
//           execution.wave.started/.finished · worker.spawned · checkpoint.saved
//   did     tool.called · worker.done
//   spoke   completion.finished · goal.completed · goal.failed
//   asked   clarification.requested · clarification.resolved
//   noted   verification.completed · retry.* · need.transition
//           capability.attempt · capability.evolution · directive.*

/** Only what this console reads. Typing it to the engine's own union would make
 *  a display depend on the engine's entry point. */
export type EngineEvent = {
  readonly eventType: string;
  readonly goalId: string;
  readonly payload: Record<string, unknown>;
};

/** When a phase began, so the frame can say how long it has been going on.
 *  Read here, at the one place an event becomes an item, rather than while
 *  drawing — a frame must stay a pure function of state. */
const now = () => Date.now();

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

let seq = 0;
const id = (kind: string) => `${kind}-${seq++}`;

/**
 * One event in, zero or one item out.
 *
 * Zero is a real answer: `tool.args.normalized` records that the engine
 * repaired a call's arguments, which is observability for the engine's own
 * tuning and not something a person watching their goal needs. An adapter that
 * rendered every event would be a log viewer, which this is not.
 */
export function toItem(event: EngineEvent): Item | undefined {
  const p = event.payload;

  switch (event.eventType) {
    // ── where the engine is ────────────────────────────────────────────────
    case 'goal.started':
      return {kind: 'phase', since: now(), id: id('phase'), text: 'starting'};
    case 'classification.completed':
      return {kind: 'phase', since: now(), id: id('phase'), text: 'reading the request'};
    case 'planning.started':
      return {kind: 'phase', since: now(), id: id('phase'), text: 'planning'};
    case 'planning.finished': {
      const waves = num(p['wavesCount']);
      return {
        kind: 'phase',
        id: id('phase'),
        text: 'planned',
        ...(waves !== undefined ? {detail: `${waves} wave${waves === 1 ? '' : 's'}`} : {})
      };
    }
    case 'execution.wave.started': {
      const wave = num(p['waveIndex']);
      return {
        kind: 'phase',
        id: id('phase'),
        text: 'executing',
        ...(wave !== undefined ? {detail: `wave ${wave + 1}`} : {})
      };
    }
    case 'execution.wave.finished':
      return {kind: 'phase', since: now(), id: id('phase'), text: 'wave finished'};
    case 'worker.spawned':
      return {kind: 'phase', since: now(), id: id('phase'), text: 'working'};
    case 'checkpoint.saved':
      // Real, and it happens between the phases above — as its own line it would
      // only flicker. Kept as a phase so it is not silently dropped.
      return {kind: 'phase', since: now(), id: id('phase'), text: 'saved a checkpoint'};

    // ── what it did, and how it went ───────────────────────────────────────
    case 'tool.called': {
      const verb = str(p['toolName']) ?? 'tool';
      const ok = p['success'] !== false;
      // stderr first: a failed call's reason is what a reader needs, and
      // tool-caller falls back to `error` when a non-process tool has no stderr.
      const out = [str(p['stderrSummary']), str(p['stdoutSummary'])].filter(
        (s): s is string => s !== undefined && s.length > 0
      );
      // The object is what the call was ABOUT, and the payload says it in a
      // different field per tool — `path` for the filesystem tools, `command`
      // for the process ones, `query` for search. Falling back to the verb
      // printed `write_file  write_file`, which was visible the moment a
      // session was drawn and invisible to the compiler.
      const args = (p['args'] ?? {}) as Record<string, unknown>;
      const about =
        str(args['path']) ??
        str(args['command']) ??
        str(args['query']) ??
        str(args['url']) ??
        str(args['file']) ??
        '';
      return {
        kind: 'did',
        id: id('did'),
        verb,
        object: about,
        state: ok ? 'ok' : 'failed',
        output: out.flatMap(s => s.split('\n')).filter(l => l.length > 0)
      };
    }

    // ── the engine's own voice ─────────────────────────────────────────────
    case 'completion.finished': {
      // What the engine said, when it said anything — a conversation's reply, a
      // finished goal's own account of what it produced. The status word is the
      // fallback, not the answer: a person who typed a greeting and read
      // `completed` was shown the engine's bookkeeping instead of its reply,
      // which is what this console exists to avoid.
      //
      // A stopped run is the one ending whose status IS the whole message, and
      // it is not lost here: its summary is the stop's reason, which is what a
      // reader wants over the bare word.
      const text =
        str(p['summary']) ??
        str(p['status']) ??
        (p['success'] === true ? 'completed' : 'finished');
      return {kind: 'spoke', id: id('spoke'), text};
    }
    case 'goal.failed': {
      const reason = str(p['reason']);
      return {kind: 'spoke', id: id('spoke'), text: reason ?? 'the goal failed'};
    }

    // ── a question that stopped the goal ───────────────────────────────────
    case 'clarification.requested': {
      const question = str(p['question']);
      // The goal is the envelope's, not the payload's — it is what an answer is
      // addressed to.
      return question
        ? {kind: 'asked', id: id('asked'), question, goalId: event.goalId}
        : undefined;
    }

    // ── stumble, and recovery ──────────────────────────────────────────────
    case 'verification.completed': {
      if (p['passed'] === true) return undefined; // a pass is the absence of news
      const reason = str(p['reason']);
      return {
        kind: 'noted',
        id: id('noted'),
        lines: [reason ? `verification failed — ${reason}` : 'verification failed']
      };
    }
    case 'retry.triggered': {
      const attempt = num(p['attempt']);
      const reason = str(p['reason']);
      return {
        kind: 'noted',
        id: id('noted'),
        lines: [
          `retrying${attempt !== undefined ? ` — attempt ${attempt + 1}` : ''}${reason ? `: ${reason}` : ''}`
        ]
      };
    }

    // ── the engine extending itself ────────────────────────────────────────
    case 'need.transition': {
      // Nine states; three of them are what a person watching would want said.
      // The rest are internal bookkeeping of the same journey.
      const to = str(p['to']);
      const text = str(p['text']);
      const cause = str(p['cause']);
      if (to === 'UNRESOLVED') {
        return {kind: 'noted', id: id('noted'), lines: [`missing a capability: ${text ?? ''}`.trim()]};
      }
      if (to === 'ACQUIRING') {
        return {kind: 'phase', since: now(), id: id('phase'), text: 'building a capability it does not have'};
      }
      if (to === 'ABANDONED') {
        return {
          kind: 'noted',
          id: id('noted'),
          lines: [cause ? `could not build it — ${cause}` : 'could not build it']
        };
      }
      return undefined;
    }
    case 'capability.attempt': {
      const capability = str(p['capability']) ?? '';
      const resolver = str(p['resolverId']) ?? '';
      const attempt = num(p['attempt']);
      if (p['phase'] === 'started') {
        return {
          kind: 'phase',
          id: id('phase'),
          text: `trying ${resolver}`,
          ...(attempt !== undefined ? {detail: `attempt ${attempt}`} : {})
        };
      }
      const outcome = str(p['outcome']);
      const reason = str(p['reason']);
      const tool = str(p['toolName']);
      // Adoption's three endings are three; "already present" is not a failure.
      const said =
        outcome === 'adopted'
          ? `built ${tool ?? capability}`
          : outcome === 'already_present'
            ? `already had ${tool ?? capability}`
            : outcome === 'declined'
              ? `${resolver} had nothing for it`
              : `${resolver} did not produce one${reason ? `: ${reason}` : ''}`;
      return {kind: 'noted', id: id('noted'), lines: [said]};
    }
    case 'capability.evolution': {
      const phase = str(p['phase']);
      const capability = str(p['capability']) ?? '';
      // `needed` is a conclusion, not work — the engine noticed a defect. Saying
      // "repairing" here would claim work that is not happening, which is the
      // defect capability-evolution-notification.ts documents.
      const said: Record<string, string> = {
        needed: `noticed a problem with ${capability}`,
        started: `repairing ${capability}`,
        succeeded: `repaired ${capability}`,
        failed: `could not repair ${capability}`,
        awaiting_permission: `a repair for ${capability} is waiting on permission`
      };
      const line = phase ? said[phase] : undefined;
      return line ? {kind: 'noted', id: id('noted'), lines: [line]} : undefined;
    }

    default:
      // goal.completed (completion.finished already said it), worker.done,
      // tool.args.normalized, clarification.resolved, retry.plan_changed and
      // directive.* — each either repeats something already shown or is the
      // engine's own bookkeeping. Silence is a decision, recorded here.
      return undefined;
  }
}
