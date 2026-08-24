# Making capability resolution observable — plan and LLD

**Status:** written before implementation. No engine file has been touched.
**Investigation:** `capability-lifecycle-events.md` beside this. Everything below
cites it or the source directly; nothing is assumed.

---

# Part 1 — The plan

## 1.1 What already exists and is reused unchanged

| existing thing | why it is the right vehicle |
|---|---|
| `NeedLedger.moveTo` — `need-ledger.ts:86` | the single funnel every one of the nine Need transitions passes through. It already loads the `NeedRecord`, already refuses illegal transitions, already returns `false` for a no-op |
| `EventBusService` — `event-bus.service.ts` | already isolates publishers from subscriber faults (`:44`), which the header says was made reachable by ordinary host code precisely for capability notifications |
| `ExecutionEventStream` — `execution-event-stream.ts` | merges both buses, holds **no table of event names** (`:23`), so it carries a new name with no edit |
| the `capability.evolution` precedent | one event carrying a `phase`, and the stated reason for it (`event-bus.service.ts:23`) |
| the ledger's existing place on the bus | `wireNeedConsumption` (`coordinator-factory.ts:164`) already drives `CONSUMED` from `TOOL_CALLED`. The ledger is already a bus participant; this adds the other direction |

## 1.2 What is actually missing

Not a lifecycle, not a state, not a record. **Only the announcement.** The path
is modelled (`05-state-machines.md` §1), owned (`NeedLedger`), stored (`needs`,
`capability_attempts`) and silent: zero `publish` across `need-ledger.ts`,
`resolution-orchestrator.ts`, `capability-assessor.ts`, both resolvers,
`capability-resolution-middleware.ts` and `goal-restart-coordinator.ts`.

Measured consequence: the engine can sit in `ACQUIRING` for **209 seconds**
emitting nothing.

## 1.3 What changes, exactly

Three files. Two `EVENTS` entries. Three publish sites. No new component, no new
state, no new record, no signature change.

1. `engine-core/src/services/event-bus.service.ts` — `NEED_TRANSITION` and
   `CAPABILITY_ATTEMPT` added to `EVENTS`.
2. `engine-core/src/needs/need-ledger.ts` — one publish inside `moveTo`, after
   `updateNeedState`.
3. `official-runtime/src/resolution-orchestrator.ts` — two publishes, `started`
   before `resolver.attempt` and `settled` after the outcome is known.

## 1.4 What is deliberately not touched

`execution-event-stream.ts` (holds no name table — editing it would break the
Open/Closed property its own header claims). `capability-lifecycle.ts` and
`capability_attempts` (the attempt log is not the narrative). The Need state
machine and `LEGAL` (no state is added; `05-state-machines.md` §1 says a
transition not listed does not exist). Any storage schema. Any public signature.
`goal-restart-coordinator.ts`. The resolvers. `CapabilityAssessor`.

## 1.5 Impact on architecture, contracts and the SDK

**Architecture — none.** Both publishes sit at owners that already establish the
fact, which is F4's rule as `execution-event-stream.ts:17` states it. No
component learns about another.

**The `ExecutionEvent` contract — satisfied, not extended.** `eventType` is
declared as `EventName | CognitiveEventType` (`:36`), a union over the two buses'
own declarations: a new `EVENTS` entry flows in with no edit. `goalId`,
`occurredAt`, `sequence` and `terminal` are read generically. Both new events
carry `goalId`, and `terminal` is absent — neither ends an execution.

**ADR-011 — followed, and it decides two things for us.** The stream is keyed on
`goalId`, so both events carry the execution they occur in, not the need.
§5 — *"The engine never invents either pointer"* — is the reason the missing-id
question below is answered by publishing nothing rather than by minting one.

**ADR-005 — untouched.** The Need remains an artifact with one owner. Announcing
a transition is not moving one.

**SDK / host — additive only.** A host that subscribes to nothing behaves
identically, which is the guarantee `capability-evolution-notification.ts:12`
already makes for its own notifications.

## 1.6 The `needId` question, and why nothing is generated

`gap.id` is optional. Its own comment (`capability-assessor.ts:30`) says why:
*"assigned by the engine when the need is captured … **Absent only when storage
is unavailable**"*.

Traced to one branch. `planning.coordinator.ts:764` returns the assessor's raw
requests when `!this.needLedger`; `:777` otherwise maps every request from a
`NeedRecord` whose `id` came from `randomUUID()` at `need-ledger.ts:69`. The
ledger is constructed in exactly one place — `coordinator-factory.ts:163`,
`new NeedLedger(storage)` — and injected into the orchestrator and the middleware
from the same instance (`bootstrap.ts:167-168`).

**Therefore: no ledger ⇒ no `needId` AND no Need transitions at all.** An attempt
without a `needId` can only occur in a run that emits no level-1 events either.
The invariant needs no defensive check and no generated id:

> **A level-2 event is published only where a level-1 event is published.**
> Both are conditioned on the same object.

Expressed in code as `if (gap.id)` at the publish site — the same guard
`resolution-orchestrator.ts:70` and `capability-resolution-middleware.ts:124`
already use for the same reason.

## 1.7 Alternatives considered

| alternative | rejected because |
|---|---|
| publish from `capability-lifecycle.ts`'s write sites | the attempt log is not the narrative; and `recordRejection` (`:200`) awaits an LLM review before writing, so the rejection would reach a consumer tens of seconds late on the one path where the user is already waiting |
| a third bus for lifecycle events | `execution-event-stream.ts` already merges two and holds no name table. A third buys nothing and adds a merge |
| one event per occurrence (eight) | most are already carried: `resolverId` rides every attempt; a passing validation has no consequence a reader can act on; budget-spent and reason-repeated are both `ABANDONED.cause` |
| separate `started` / `settled` names | the engine already rejected this shape for `capability.evolution` and stated the reason (`event-bus.service.ts:23`): a host rendering "starting" without rendering the ending has misinformed the user, and separate names make partial subscription the easy mistake |
| generate a `needId` when absent | ADR-011 §5 — the engine never invents a pointer. And there is nothing to point at: no ledger means no need row |

---

# Part 2 — LLD

## 2.1 Responsibilities

| component | responsibility | changes |
|---|---|---|
| `NeedLedger` | owns the Need's state, and now announces the transitions it makes | one publish |
| `ResolutionOrchestrator` | owns the acquisition attempt loop, and now announces each attempt | two publishes |
| `EventBusService` | carries both | two constants |
| `ExecutionEventStream` | observes | **none** |
| every consumer | subscribes or does not | none required |

## 2.2 Data flow

```
PlanningCoordinator :771 ─ captureOnce ─► NeedRecord{id, goalId, originGoalId, text}
                                              │
                    :777 ─ requests[{id: n.id, capability: n.text, …}]
                                              │
CapabilityResolutionMiddleware :124 ──────────┼─► ledger.resolved()/.unresolved()
                                              │        └─► moveTo ──► ① NEED_TRANSITION
                                              ▼
ResolutionOrchestrator :70 ── moveTo(ACQUIRING) ─────────► ① NEED_TRANSITION
                    :141   for each resolver
                    :159     ► ② CAPABILITY_ATTEMPT {phase:'started'}
                    :178     outcome known
                    :213     adoption known
                             ► ② CAPABILITY_ATTEMPT {phase:'settled'}
                    :73    moveTo(ACQUIRED|ABANDONED) ────► ① NEED_TRANSITION
                    :83    moveTo(MET) ──────────────────► ① NEED_TRANSITION
```

## 2.3 Contracts

```ts
// engine-core/src/services/event-bus.service.ts
NEED_TRANSITION:    'need.transition',
CAPABILITY_ATTEMPT: 'capability.attempt',
```

```ts
// Published by NeedLedger.moveTo. One transition that actually occurred.
export interface NeedTransitionNotification {
  readonly needId: string
  readonly from: NeedState
  readonly to: NeedState
  // ADR-011: the execution this occurred in, and the ask it belongs to.
  readonly goalId: string
  readonly originGoalId: string
  // The need in the words it was captured in. Immutable (ADR-004).
  readonly text: string
  // Only on the transitions that carry them, exactly as `detail` does today.
  readonly metBy?: string
  readonly cause?: string
}
```

```ts
// Published by ResolutionOrchestrator, inside ACQUIRING only.
export interface CapabilityAttemptNotification {
  readonly needId: string          // never optional — see §1.6
  readonly goalId: string          // the execution whose planning found the gap
  readonly capability: string      // gap.capability
  readonly resolverId: string
  readonly attempt: number         // 1-based; attemptsThisResolver + 1
  readonly phase: 'started' | 'settled'
  // `settled` only. Values drawn from what is already in hand at :178/:213 —
  // no new vocabulary is introduced.
  readonly outcome?: 'adopted' | 'already_present' | 'rejected' | 'declined' | 'awaiting_permission'
  readonly reason?: string         // ResolverOutcome.reason | verdict.reason | AdoptionOutcome.reason
  readonly toolName?: string       // AdoptionOutcome.registeredAs ?? the candidate's name
  // The internal sub-goal that produced the candidate, when one ran. Absent for
  // a resolver that runs no goal (an installed pack) — types.ts:100.
  readonly producedByGoalId?: string
}
```

`failureAnalysis` is deliberately absent: it lands after an LLM review and is
already stored on `capability_attempts` against the same attempt.

## 2.4 Edit points

| # | file | line | edit |
|---|---|---|---|
| 1 | `engine-core/src/services/event-bus.service.ts` | in `EVENTS` | two constants + the comment saying what they are |
| 2 | `engine-core/src/needs/need-ledger.ts` | after `updateNeedState` (`:103`) | `this.eventBus?.publish(...)` — **after** the legality check, so a refused or no-op transition publishes nothing |
| 3 | `engine-core/src/needs/need-ledger.ts` | constructor | optional `eventBus?: EventBusService`, matching how `storage` is optional throughout this path |
| 4 | `engine-core/src/composition/coordinator-factory.ts` | `:163` | pass the existing `eventBus` into `new NeedLedger(storage)` |
| 5 | `official-runtime/src/resolution-orchestrator.ts` | before `:159` | `started`, guarded by `gap.id` |
| 6 | `official-runtime/src/resolution-orchestrator.ts` | after `:213` / on each non-adopted exit | `settled`, guarded by `gap.id` |

Six edits, three files plus one wiring line. No signature is broken: every new
parameter is optional and every publish is `?.`.

## 2.5 Tests

| # | test | asserts |
|---|---|---|
| T1 | a legal transition publishes once | payload equals the record's own fields; `from`/`to` correct |
| T2 | an illegal transition publishes nothing | `moveTo` returns `false` and the bus saw no event |
| T3 | a no-op transition (`current.state === to`) publishes nothing | early return at `:97` |
| T4 | no `eventBus` ⇒ the ledger behaves exactly as today | graceful degradation |
| T5 | a throwing subscriber does not affect the transition | already guaranteed by `EventBusService.publish`; asserted here because this is a new publisher |
| T6 | an attempt with `gap.id` publishes `started` then `settled`, in order | `attempt` numbering 1-based and increasing |
| T7 | an attempt with no `gap.id` publishes nothing at either phase | §1.6's invariant |
| T8 | each `ResolverOutcome` status maps to the documented `outcome` value | no invented vocabulary |
| T9 | both names reach `ExecutionEventStream` unmodified | proves the Open/Closed claim, and that the two name spaces stay disjoint (the stream already has a test for that) |

## 2.6 Acceptance criteria

1. A run that resolves a gap by generation produces, in order: `UNRESOLVED` →
   `ACQUIRING` → *n* × (`started`, `settled`) → `ACQUIRED` → `MET`, every one
   carrying the same `needId`.
2. A run with no storage produces none of them and behaves identically to today.
3. No event is published for a transition the ledger refused.
4. `execution-event-stream.ts` is unmodified and both events appear in its output.
5. All existing tests pass with no edit to any of them.

## 2.7 Migration and compatibility

No migration. No schema change, no stored shape changes, nothing is backfilled —
these are live announcements of facts already recorded, and history stays
readable from `needs` and `capability_attempts` exactly as it is now.

Compatibility is additive in both directions: a host that subscribes to neither
name is unaffected, and `ExecutionEvent`'s `eventType` union widens by two
values, which is a source-compatible change for any consumer that switches on it
with a default.
