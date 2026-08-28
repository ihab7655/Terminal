import type {Change, Item} from './console.js';
import {en} from './i18n/en.js';
import {fill, type Catalogue} from './i18n/catalogue.js';

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

/** Lines of a string, without the empty one a trailing newline leaves behind. */
const linesOf = (text: string): string[] => {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/**
 * The change a tool call made, as the call itself stated it.
 *
 * Only for calls that say what they changed. A tool that writes through some
 * other shape says nothing here rather than being guessed at — the engine's own
 * rule about not inferring from a workspace, applied to a display.
 */
function diffOf(tool: string, args: Record<string, unknown>): Change[] | undefined {
  if (tool === 'write_file') {
    const content = str(args['content']);
    return content === undefined ? undefined : linesOf(content).map(text => ({sign: '+' as const, text}));
  }
  if (tool === 'edit_file') {
    const before = str(args['old_string']);
    const after = str(args['new_string']);
    if (before === undefined && after === undefined) return undefined;
    return [
      ...linesOf(before ?? '').map(text => ({sign: '-' as const, text})),
      ...linesOf(after ?? '').map(text => ({sign: '+' as const, text}))
    ];
  }
  return undefined;
}
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
export function toItem(event: EngineEvent, say: Catalogue = en): Item | undefined {
  const p = event.payload;

  switch (event.eventType) {
    // ── where the engine is ────────────────────────────────────────────────
    case 'goal.started':
      return {kind: 'phase', since: now(), id: id('phase'), text: say.phases.starting};
    case 'classification.completed':
      return {kind: 'phase', since: now(), id: id('phase'), text: say.phases.reading};
    case 'planning.started':
      return {kind: 'phase', since: now(), id: id('phase'), text: say.phases.planning};
    case 'planning.finished': {
      const waves = num(p['wavesCount']);
      return {
        kind: 'phase',
        id: id('phase'),
        text: say.phases.planned,
        ...(waves !== undefined ? {detail: `${waves} wave${waves === 1 ? '' : 's'}`} : {})
      };
    }
    case 'execution.wave.started': {
      const wave = num(p['waveIndex']);
      return {
        kind: 'phase',
        id: id('phase'),
        text: say.phases.executing,
        ...(wave !== undefined ? {detail: `wave ${wave + 1}`} : {})
      };
    }
    case 'execution.wave.finished':
      return {kind: 'phase', since: now(), id: id('phase'), text: say.phases.waveFinished};
    case 'worker.spawned':
      return {kind: 'phase', since: now(), id: id('phase'), text: say.phases.working};
    case 'checkpoint.saved':
      // Real, and it happens between the phases above — as its own line it would
      // only flicker. Kept as a phase so it is not silently dropped.
      return {kind: 'phase', since: now(), id: id('phase'), text: say.phases.checkpoint};

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
      // WHAT THE ENGINE ACTUALLY CHANGED, when the call changed a file.
      //
      // A person watching an engine write code wants to see the code, and the
      // event already carries it — write_file's args hold the whole `content`,
      // edit_file's hold `old_string` and `new_string`. Rendering only
      // "✓ write_file print_numbers.py" threw that away and left the reader to
      // trust a filename.
      //
      // Nothing is computed here that the payload does not state. A write is
      // all additions because that is what a write is; an edit is its removal
      // and its addition. This console does not diff files — it shows what the
      // call said it was doing.
      // ONLY FOR A CALL THAT SUCCEEDED. The arguments say what a write WOULD
      // have contained; whether it happened is the result's to say. Observed
      // live on 2026-08-28: a write refused by this console's own policy still
      // read `Wrote 1 file · +1 line`, which is the console asserting a change
      // that never occurred — the one thing a display of an execution may
      // never do.
      const changes = ok ? diffOf(verb, args) : undefined;
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
        output: out.flatMap(s => s.split('\n')).filter(l => l.length > 0),
        changes
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
      return {kind: 'spoke', id: id('spoke'), text: reason ?? say.outcome.failed};
    }

    // No `clarification.requested`. The engine has no clarification state: when
    // it needs something from the person it says so in its answer, and that
    // arrives as `completion.finished` like any other ending.

    case 'verification.completed': {
      if (p['passed'] === true) return undefined; // a pass is the absence of news
      const reason = str(p['reason']);
      return {
        kind: 'noted',
        id: id('noted'),
        // The engine's own reason is kept verbatim — it names requirements by
        // their ids, which are identifiers and not phrases to translate.
        lines: [reason ? `${say.outcome.verificationFailed} — ${reason}` : say.outcome.verificationFailed]
      };
    }
    case 'retry.triggered': {
      const attempt = num(p['attempt']);
      const reason = str(p['reason']);
      return {
        kind: 'noted',
        id: id('noted'),
        lines: [
          `${say.outcome.retrying}${attempt !== undefined ? ` — ${attempt + 1}` : ''}${reason ? `: ${reason}` : ''}`
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
        return {kind: 'noted', id: id('noted'), lines: [`${say.outcome.missingCapability}: ${text ?? ''}`.trim()]};
      }
      if (to === 'ACQUIRING') {
        return {kind: 'phase', since: now(), id: id('phase'), text: say.outcome.buildingCapability};
      }
      if (to === 'ABANDONED') {
        return {
          kind: 'noted',
          id: id('noted'),
          lines: [cause ? `${say.outcome.couldNotBuild} — ${cause}` : say.outcome.couldNotBuild]
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
    // ── an amendment, and what became of it ────────────────────────────────
    //
    // Six events for one row. The console does not merge them or guess a state
    // between them: each arrives when the engine has concluded something, and
    // the row shows the last one. `not_delivered` is an honest terminal state
    // the engine declares rather than falling silent, so it is drawn like any
    // other rather than hidden as a non-event.
    case 'directive.received':
    case 'directive.scoped':
    case 'directive.delivered':
    case 'directive.admitted':
    case 'directive.superseded':
    case 'directive.not_delivered': {
      const directiveId = str(p['directiveId']);
      const text = str(p['text']);
      if (directiveId === undefined || text === undefined) return undefined;
      const state = event.eventType.slice('directive.'.length);
      const scope = str(p['scope']);
      return {
        kind: 'steer',
        // The SAME id for all six, so a later state replaces the row rather
        // than adding a second one about the same sentence.
        id: `steer-${directiveId}`,
        text,
        state,
        ...(scope === undefined ? {} : {scope})
      };
    }

    // ── a worker finished, and what a retry re-planned ─────────────────────
    case 'worker.done': {
      const role = str(p['role']) ?? str(p['workerRole']);
      return {kind: 'phase', since: now(), id: id('phase'),
              text: say.phases.working, ...(role === undefined ? {} : {detail: role})};
    }
    case 'retry.plan_changed': {
      const reason = str(p['reason']) ?? str(p['summary']);
      return {kind: 'noted', id: id('noted'),
              lines: [reason ? `${say.outcome.replanned}: ${reason}` : say.outcome.replanned]};
    }

    case 'capability.evolution': {
      const phase = str(p['phase']);
      const capability = str(p['capability']) ?? '';
      // `needed` is a CONCLUSION, not work, and not an event in this goal — the
      // engine has judged a capability unreliable from its whole history. The
      // earlier wording ("noticed a problem with X") read as something that had
      // just gone wrong here, and appeared five times at the top of a run in
      // which nothing went wrong at all.
      //
      // LIMIT OF CURRENT ENGINE SURFACE, recorded because it explains what a
      // person will see: a call this console REFUSES is recorded by the engine
      // as a failed tool call — ToolCallRecord has no field separating "the
      // host denied it" from "it broke". Measured 2026-08-28: 7 of 9 write_file
      // calls in two hours failed, every one of them a refusal by this
      // console's own policy, and the engine's capability health then judged
      // write_file unreliable. Nothing here hides that conclusion; it is the
      // engine's and it is honestly reported. What is fixed is the console
      // saying WHAT it is.
      const said: Record<string, string> = {
        needed: fill(say.outcome.judgesUnreliable, {tool: capability}),
        started: fill(say.outcome.repairing, {tool: capability}),
        succeeded: fill(say.outcome.repaired, {tool: capability}),
        failed: `could not repair ${capability}`,
        awaiting_permission: `a repair for ${capability} is waiting on permission`
      };
      const line = phase ? said[phase] : undefined;
      return line ? {kind: 'noted', id: id('noted'), lines: [line]} : undefined;
    }

    default:
      // goal.completed (completion.finished already said it), worker.done,
      // directive.* — each either repeats something already shown or is the
      // engine's own bookkeeping. Silence is a decision, recorded here.
      return undefined;
  }
}
