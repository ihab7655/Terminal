# The engine's live surface: all 26 events, and what a consumer can actually do with each

**Scope of this stage — Contract Export Audit.** Read only. No event added, none
removed, no publish time changed, no runtime payload changed, no engine
behaviour changed, no interface designed. The single question per row:
**can a consumer understand this event without opening engine internals?**

Every payload below was read at its publish site, not inferred.

---

## The nine bus events

| event | payload type | exported | payload as published | consumer-ready |
|---|---|:-:|---|:-:|
| `goal.started` | — | — | `{goalId, goal, resumed?, originGoalId?, parentGoalId?}` — `brain/main-brain.ts:200` | ✗ |
| `goal.completed` | — | — | `{goalId}` — `completion.coordinator.ts:109`, `:246` | ✗ |
| `goal.failed` | — | — | `{goalId, reason}` — `completion.coordinator.ts:168`, `:248` | ✗ |
| `worker.spawned` | `WorkerSpawnedEventPayload` | **no** | typed — `factory/worker-factory.ts:144` | ✗ |
| `worker.done` | — | — | `{goalId, wave, workerIndex, workerId, …}` — `execution.coordinator.ts:257` | ✗ |
| `tool.called` | `ToolCalledEventPayload` | **no** | typed — `workers/tool-caller.ts:246` | ✗ |
| `tool.args.normalized` | `ToolArgsNormalizedPayload` | **no** | typed — `workers/tool-caller.ts:144` | ✗ |
| `checkpoint.saved` | — | — | `{goalId, attempt, nextWaveIndex}` — `services/checkpoint.service.ts:33` | ✗ |
| `capability.evolution` | `CapabilityEvolutionNotification` | **yes** | typed — `observability/capability-evolution-notification.ts:71` | **✓** |

## The seventeen cognitive events

All seventeen are declared as `payload: Record<string, unknown>`
(`reflection/types.ts:31`). `CognitiveEvent` itself is not exported. **Every
payload nonetheless has a definite shape at its emit site** — they are inline
object literals, so the shape exists and is stable; it is simply not written
down as a type.

| event | payload as emitted | site |
|---|---|---|
| `classification.completed` | `{goalType, confidence}` | `classification.coordinator.ts:57` |
| `clarification.requested` | at `:122` | `clarification.coordinator.ts:125` |
| `clarification.resolved` | at `:179` | `clarification.coordinator.ts:182` |
| `planning.started` | `{attempt, isRetry, startedAt}` | `planning.coordinator.ts:353` |
| `planning.finished` | `{attempt, wavesCount, finishedAt, …}` | `planning.coordinator.ts:668` |
| `execution.wave.started` | `{…, attempt}` | `execution.coordinator.ts:109` |
| `execution.wave.finished` | at `:242` | `execution.coordinator.ts:245` |
| `verification.completed` | `{passed, reason}` | `verification.coordinator.ts:144` |
| `retry.triggered` | `{attempt, reason}` | `retry.coordinator.ts:49` |
| `retry.plan_changed` | at `:106` | `retry.coordinator.ts:109` |
| `completion.finished` | `{success, durationMs, attempts, …}` | `completion.coordinator.ts:251` |
| `directive.received` | one shape, six types | `steering/steering-ledger.ts:276` |
| `directive.scoped` | ″ | ″ |
| `directive.delivered` | ″ | ″ |
| `directive.admitted` | ″ | ″ |
| `directive.superseded` | ″ | ″ |
| `directive.not_delivered` | ″ | ″ |

Consumer-ready: **none of the seventeen.**

## Totals

| | count |
|---|---:|
| events on the stream | **26** |
| with an exported, typed payload | **1** |
| typed but unexported | 3 |
| shaped at the publish site but untyped | 22 |
| whose shape does not exist anywhere | **0** |

**The last row is the finding that matters.** Nothing here is undefined — every
one of the 26 publishes a definite object. The gap is entirely that the shapes
are not written down and not exported. This is why the stage is a pure export
job with no behaviour change: there is nothing to decide about *what* an event
carries, only to declare what it already carries.

## What "consumer-ready" would require

Three things per event, and only the third is missing for 25 of them:

1. a name a consumer can reference — **all 26 have this** (`EVENTS` is exported)
2. an envelope with declared meaning — **all 26 have this** (`ExecutionEvent`,
   and `ADR-011` decides what it is keyed on)
3. a payload type, exported, that `eventType` discriminates to — **1 of 26**

The third is what makes this possible for a consumer:

```ts
switch (event.eventType) {
  case EVENTS.TOOL_CALLED:
    event.payload.toolName   // known, no cast
}
```

instead of `event.payload as SomeTypeIFoundByReadingTheEngine`.

That requires `ExecutionEvent` to become a discriminated union over
`eventType` — today it is generic in `P` with `P = unknown` at the call site, so
the compiler has nothing to narrow on.

## Proposed shape of the work — for review before anything is written

**Not decided. This is the part to argue with before code.**

```
engine-core/src/observability/events/
  ├── execution-event.ts     the envelope + the discriminated union
  ├── goal-events.ts         goal.started | completed | failed
  ├── worker-events.ts       worker.spawned | done
  ├── tool-events.ts         tool.called | args.normalized
  ├── checkpoint-events.ts   checkpoint.saved
  ├── capability-events.ts   re-export of the existing notification
  ├── cognitive-events.ts    the seventeen
  └── index.ts               one import for a consumer
```

Constraints this shape must respect, from the constitution and from the stream's
own header:

- **no new logic** — these are type declarations and re-exports only
- **the owner keeps owning the shape.** A payload type moved away from its
  publisher and edited in a central file is the "central union" General Engine
  First forbids. Either each type stays with its owner and this directory
  re-exports, or the type moves and its owner imports it back — a decision to
  make deliberately, not by habit.
- **`execution-event-stream.ts` is not edited.** Its header states it holds no
  knowledge of any individual event; a union of event types *in that file* would
  break exactly that. The union belongs beside the contracts, not in the stream.
- **the 17 cognitive payloads are the real work.** Each needs its shape read off
  its emit site and declared. That is 17 small interfaces, each owned by the
  coordinator that emits it — not one central file of seventeen.

## Open questions for this stage

1. **Where does a payload type live** — beside its publisher with a re-export
   here, or moved here with the publisher importing it? The first keeps
   ownership where the fact is; the second gives a consumer one file to read.
   They are not equally correct and the constitution leans to the first.
2. **`ExecutionEvent<P>` is generic today.** Turning it into a discriminated
   union changes a public type. Is a `ExecutionEventOf<T extends EventName>`
   helper alongside it safer than changing the existing one?
3. **`sessionId` on cognitive events** is on `CognitiveEvent` but not on
   `ExecutionEvent`'s envelope. It is dropped on the way through the stream.
   Deliberate (ADR-011 §4 says the session is not the journey key) or an
   omission? Worth confirming before a consumer discovers it.
