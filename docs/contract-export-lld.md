# LLD — Event Contract Export

**Status:** written before implementation, per `WORKING-METHOD.md` §6b. Nothing
in the engine has been touched. Moves to the engine repo on approval (§3).
**Plan:** `contract-export-plan.md` beside this — scope and justification.
**Audit:** `event-contract-inventory.md` — every payload read at its site.
**UNVERIFIED premises:** none. Step 0 closed the last five.

---

## 1. The 22 payload contracts

Each declared **in the file that publishes it**, per
`docs/lld/execution-event-stream.md:222` — *"The payload's type is owned and
declared by whoever publishes it."* Nothing below is invented: every field was
read at its publish site.

### 1a. Bus events (5 new types; 4 already typed)

| type | owner file | shape |
|---|---|---|
| `GoalStartedEventPayload` | `brain/main-brain.ts` | `{goalId: string; goal: string; resumed?: true; originGoalId?: string; parentGoalId?: string}` |
| `GoalCompletedEventPayload` | `brain/coordinators/completion.coordinator.ts` | `{goalId: string}` |
| `GoalFailedEventPayload` | `brain/coordinators/completion.coordinator.ts` | `{goalId: string; reason: string}` |
| `WorkerDoneEventPayload` | `brain/coordinators/execution.coordinator.ts` | `{goalId: string; wave: number; workerIndex: number; workerId: string; success: boolean}` |
| `CheckpointSavedEventPayload` | `services/checkpoint.service.ts` | `{goalId: string; attempt: number; nextWaveIndex: number}` |
| *(existing)* `WorkerSpawnedEventPayload` | `factory/worker-factory.ts:27` | unchanged |
| *(existing)* `ToolCalledEventPayload` | `workers/tool-caller.ts:31` | unchanged — alias kept, comment added |
| *(existing)* `ToolArgsNormalizedPayload` | `workers/tool-caller.ts` | unchanged |
| *(existing)* `CapabilityEvolutionNotification` | `observability/capability-evolution-notification.ts` | unchanged, already exported |

`resumed?: true` — not `boolean`. The publish site spreads `...(req.resume ? { resumed: true } : {})`, so `false` never occurs.

### 1b. Cognitive events (12 new types covering 17 event names)

| type | owner file | shape |
|---|---|---|
| `ClassificationCompletedPayload` | `classification.coordinator.ts` | `{goalType: string; confidence: number}` |
| `ClarificationRequestedPayload` | `clarification.coordinator.ts` | `{question: string; confidence: number; missingInformation: string[]; settled: string[]}` |
| `ClarificationResolvedPayload` | `clarification.coordinator.ts` | `{effectiveGoal: string; confidence: number; missingInformation: string[]; settled: string[]}` |
| `PlanningStartedPayload` | `planning.coordinator.ts` | `{attempt: number; isRetry: boolean; startedAt: number}` |
| `PlanningFinishedPayload` | `planning.coordinator.ts` | `{attempt: number; wavesCount: number; finishedAt: number; startedAt: number}` |
| `ExecutionWaveStartedPayload` | `execution.coordinator.ts` | `{waveIndex: number; workersCount: number; attempt: number}` |
| `ExecutionWaveFinishedPayload` | `execution.coordinator.ts` | `{waveIndex: number; success: boolean; toolCallsCount: number; tokenCost: number; attempt: number}` |
| `VerificationCompletedPayload` | `verification.coordinator.ts` | `{passed: boolean; reason: string}` |
| `RetryTriggeredPayload` | `retry.coordinator.ts` | `{attempt: number; reason: string}` |
| `RetryPlanChangedPayload` | `retry.coordinator.ts` | `{attempt: number}` |
| `CompletionFinishedPayload` | `completion.coordinator.ts` | **see §8** |
| `DirectiveEventPayload` | `steering/steering-ledger.ts` | `{directiveId: string; text: string; state: string; waitedMs: number; scope?: string; rationale?: string; deliveredTo?: string[]; attempt?: number; reason?: string}` |

`DirectiveEventPayload` serves all six `directive.*` names: **one emit site,
one object, six values of `type`.** The optionals are optional because the site
spreads them conditionally — read, not assumed.

The exact TypeScript types of `settled` / `missingInformation` / `scope` /
`state` are taken from the expressions that fill them at each site during
implementation; where an expression's type is not literally `string[]` the
declaration follows the expression, never this table.

## 2. Exports and re-exports

**Two hops, and only two.**

```
owner file            ── export type ──►  observability/events/index.ts
                                                    │
                                          ── export type ──►  engine-core/src/index.ts
```

`observability/events/index.ts` **declares nothing** except `KnownExecutionEvent`
and its two helpers (§3). Everything else is a re-export. This is what keeps it
from being the central union `General Engine First` forbids: the shapes live
with their owners; this file is an index.

Already exported and untouched: `EVENTS` (`index.ts:375`), `EventName` (`:376`),
`ExecutionEvent` / `ExecutionEventStream` / `ExecutionEventHandler` (`:342-344`),
`CapabilityEvolutionNotification`, `ToolCallRecord` (`:404`).

Newly exported: the 17 payload types above, plus `CognitiveEvent` and
`CognitiveEventType` from `reflection/types.ts` — **type-only, no shape change**.

## 3. `KnownExecutionEvent`

```ts
// observability/events/index.ts

/** The envelope, with `eventType` narrowed to one literal. */
type Envelope<T extends EventName | CognitiveEventType, P> =
  Omit<ExecutionEvent<P>, 'eventType'> & { readonly eventType: T }

export type KnownExecutionEvent =
  // bus
  | Envelope<typeof EVENTS.GOAL_STARTED, GoalStartedEventPayload>
  | Envelope<typeof EVENTS.GOAL_COMPLETED, GoalCompletedEventPayload>
  | Envelope<typeof EVENTS.GOAL_FAILED, GoalFailedEventPayload>
  | Envelope<typeof EVENTS.WORKER_SPAWNED, WorkerSpawnedEventPayload>
  | Envelope<typeof EVENTS.WORKER_DONE, WorkerDoneEventPayload>
  | Envelope<typeof EVENTS.TOOL_CALLED, ToolCalledEventPayload>
  | Envelope<typeof EVENTS.TOOL_ARGS_NORMALIZED, ToolArgsNormalizedPayload>
  | Envelope<typeof EVENTS.CHECKPOINT_SAVED, CheckpointSavedEventPayload>
  | Envelope<typeof EVENTS.CAPABILITY_EVOLUTION, CapabilityEvolutionNotification>
  // cognitive
  | Envelope<'classification.completed', ClassificationCompletedPayload>
  | Envelope<'clarification.requested', ClarificationRequestedPayload>
  | Envelope<'clarification.resolved', ClarificationResolvedPayload>
  | Envelope<'planning.started', PlanningStartedPayload>
  | Envelope<'planning.finished', PlanningFinishedPayload>
  | Envelope<'execution.wave.started', ExecutionWaveStartedPayload>
  | Envelope<'execution.wave.finished', ExecutionWaveFinishedPayload>
  | Envelope<'verification.completed', VerificationCompletedPayload>
  | Envelope<'retry.triggered', RetryTriggeredPayload>
  | Envelope<'retry.plan_changed', RetryPlanChangedPayload>
  | Envelope<'completion.finished', CompletionFinishedPayload>
  | Envelope<'directive.received', DirectiveEventPayload>
  | Envelope<'directive.scoped', DirectiveEventPayload>
  | Envelope<'directive.delivered', DirectiveEventPayload>
  | Envelope<'directive.admitted', DirectiveEventPayload>
  | Envelope<'directive.superseded', DirectiveEventPayload>
  | Envelope<'directive.not_delivered', DirectiveEventPayload>
```

26 members, one per event name.

### 3a. Exhaustiveness, enforced by the compiler

```ts
// Adding an EVENTS entry or a CognitiveEventType without a member here is a
// build error. This is what makes asKnown() below honest rather than hopeful.
type _Uncovered = Exclude<EventName | CognitiveEventType, KnownExecutionEvent['eventType']>
const _exhaustive: _Uncovered extends never ? true : never = true
```

### 3b. `asKnown` — one cast, in one place, made safe by 3a

`ExecutionEventStream.watchExecutions` hands out `ExecutionEvent` and **is not
being changed**. Narrowing therefore needs one assertion, and the design choice
is *where it lives*: in every consumer, or once here.

```ts
/**
 * The same event, typed. The envelope is identical — only `eventType` is
 * narrowed and `payload` bound to it — so this is a re-typing, not a
 * conversion. It is sound because _exhaustive above proves every event name
 * has a member, and because each payload's type is declared by the site that
 * publishes it.
 */
export const asKnown = (event: ExecutionEvent): KnownExecutionEvent =>
  event as KnownExecutionEvent
```

**Why not a runtime type guard:** it would have to re-check 26 payload shapes
the publishers already guarantee, and a guard that returns false would drop a
real event — `execution-event-stream.ts` already refuses to drop events for a
policy of its own.

## 4. Why `ExecutionEvent<P>` is unchanged

It is exported (`index.ts:343`) and consumed (`cli-execution-view.ts:26`,
`ApplicationRuntime.watchExecutions`). Converting it to a union would edit a
live public type, and would put a per-event table inside
`execution-event-stream.ts` — whose header states it *"holds no knowledge of any
individual event"*, the Open/Closed property `General Engine First` requires.

`KnownExecutionEvent` is a pure addition. Existing consumers compile unchanged;
new ones opt in.

## 5. `cli-execution-view.ts` — the exact edit

**Before** (`:85`, `:93`):

```ts
accept(event: ExecutionEvent): boolean {
  …
  const p = event.payload as Record<string, unknown>
  const nested = event.goalId !== this.rootGoalId
  if (nested && event.eventType === 'goal.started') this.nested = short(p['goal'])
  switch (event.eventType) {
    case 'planning.started':
      this.attempt = typeof p['attempt'] === 'number' ? p['attempt'] : this.attempt
```

**After:**

```ts
accept(raw: ExecutionEvent): boolean {
  …
  const event = asKnown(raw)
  const nested = event.goalId !== this.rootGoalId
  if (nested && event.eventType === 'goal.started') this.nested = short(event.payload.goal)
  switch (event.eventType) {
    case 'planning.started':
      this.attempt = event.payload.attempt
```

The signature stays `ExecutionEvent` — no caller changes. The `as Record<string,
unknown>` is gone, and with it every `typeof p['x'] === 'number'` guard, because
the type now says so. **Behaviour is identical**: the same fields are read and
the same phases set; the runtime guards only ever protected against a shape the
publisher already guarantees.

## 6. Order of implementation

| step | what | verify before continuing |
|--:|---|---|
| 1 | declare the 5 bus payload types at their owners | `tsc` clean; `git diff` touches 4 files, additions only |
| 2 | declare the 12 cognitive payload types at their owners | `tsc` clean; no `emit({` line in the diff |
| 3 | export `CognitiveEvent` / `CognitiveEventType` (type-only) | `tsc` clean; `reflection/types.ts` diff is the `export` keyword only |
| 4 | add `observability/events/index.ts` — re-exports, `Envelope`, `KnownExecutionEvent`, `_exhaustive`, `asKnown` | `tsc` clean; **`_exhaustive` compiles** = all 26 covered |
| 5 | re-export it from `engine-core/src/index.ts` | `tsc` clean |
| 6 | rewrite `cli-execution-view.ts` per §5 | `tsc` clean; no `as Record` in the file; all three test tiers green |

Steps 1–3 are inert: nothing imports the new types yet. Step 4 is where the
compiler starts checking them against reality — **if a declared shape is wrong,
step 6 is where it fails**, at the one consumer that reads payload fields.

## 7. The 15 files

| # | file | exact edit | why this file |
|--:|---|---|---|
| 1 | `brain/main-brain.ts` | + `GoalStartedEventPayload` | publishes `goal.started` |
| 2 | `brain/coordinators/completion.coordinator.ts` | + 3 types | publishes `goal.completed`, `goal.failed`, emits `completion.finished` |
| 3 | `brain/coordinators/execution.coordinator.ts` | + 3 types | publishes `worker.done`, emits both wave events |
| 4 | `services/checkpoint.service.ts` | + `CheckpointSavedEventPayload` | publishes `checkpoint.saved` |
| 5 | `brain/coordinators/planning.coordinator.ts` | + 2 types | emits both planning events |
| 6 | `brain/coordinators/classification.coordinator.ts` | + 1 type | emits `classification.completed` |
| 7 | `brain/coordinators/clarification.coordinator.ts` | + 2 types | emits both clarification events |
| 8 | `brain/coordinators/retry.coordinator.ts` | + 2 types | emits both retry events |
| 9 | `brain/coordinators/verification.coordinator.ts` | + 1 type | emits `verification.completed` |
| 10 | `steering/steering-ledger.ts` | + `DirectiveEventPayload` | emits all six `directive.*` |
| 11 | `reflection/types.ts` | `export` on 2 existing declarations | owns `CognitiveEvent` / `CognitiveEventType` |
| 12 | `workers/tool-caller.ts` | comment only | records why the alias is an alias |
| 13 | **new** `observability/events/index.ts` | the index + union + helpers | the single import path |
| 14 | `index.ts` | one re-export line | the public surface |
| 15 | `cli-execution-view.ts` | §5 | the consumer; the observable result |

**Why only these:** every file is either the owner of a payload with no declared
type, the index, or the one consumer. No file that publishes, stores or routes
an event is edited — see §10.

## 8. Special case — `completion.finished`

Three emit sites, two shapes (`completion.coordinator.ts:114`, `:176`, `:254`):

```ts
export interface CompletionFinishedPayload {
  readonly success: boolean
  readonly durationMs: number
  readonly attempts: number
  /** Lifted onto ExecutionEvent.terminal by the stream. Always true here. */
  readonly terminal: true
  /** From :254 only — the terminal decision's own status and reason. Absent
   *  from :114 and :176, which are the plain success and failure endings. */
  readonly status?: string
  readonly reason?: string
}
```

`status` and `reason` are optional **because two of three sites do not send
them** — a declaration of what is published, not a unification. A consumer must
handle their absence, and the type says so.

`terminal: true` is declared because the stream reads
`fields['terminal'] === true` to set `ExecutionEvent.terminal`. It is part of
this payload's contract, not an envelope invention.

**Other multi-site events, all verified identical and needing no special case:**
`goal.completed` (2), `goal.failed` (2), `clarification.requested` (2),
`clarification.resolved` (2). `tool.called` has one publisher — an earlier count
of three counted two comments.

## 9. Acceptance

**Per step:** the table in §6.

**Final, mechanically checkable:**

1. `git diff --stat` shows **0 lines** in `observability/execution-event-stream.ts`,
   `core/interfaces/istorage.ts`, `infra/database/schema.ts`,
   `services/event-bus.service.ts`, `reflection/cognitive-event-bus.ts`.
2. `git diff | grep -E '(publish|\.emit)\('` returns **nothing**.
3. `grep -c 'as Record<string, unknown>' cli-execution-view.ts` = **0**.
4. All three test tiers green with **no test file modified**.
5. `_exhaustive` compiles — proof all 26 names are covered.
6. A file outside `engine-core` compiles against `KnownExecutionEvent` with zero
   casts.

Criterion 4 is the strongest: behaviour is unchanged, so a test that needs
editing means something changed that should not have.

## 10. What will not be touched

`observability/execution-event-stream.ts` · `services/event-bus.service.ts` ·
`reflection/cognitive-event-bus.ts` · `core/interfaces/istorage.ts` ·
`infra/database/schema.ts` · every `saveX` / persistence path ·
`ToolCallRecord` and the `ToolCalledEventPayload` alias's definition ·
any publish or emit call · any payload value · the Need machine and
`need-ledger.ts` · `resolution-orchestrator.ts` and the capability path ·
any test file · `ExecutionEvent<P>`'s declaration · `CognitiveEvent`'s shape
(only its `export` keyword) · `EVENTS`' contents.

**No new event. No new fact. No behaviour change.**
