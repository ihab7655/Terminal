# Making capability resolution observable — plan and LLD

**Status:** written before implementation. No engine file has been touched.
**Investigation:** `capability-lifecycle-events.md` beside this. Everything below
cites it or the source directly; nothing is assumed.

---

# Part 0 — Derivation, and the public-fact filter

**Why this part exists.** An earlier version of §1.3 listed events derived from
lines of console output we wanted. That inverts the constitution's General
Engine First: *"Every architectural decision is judged first on whether it
generalizes — never on whether it resolves the case in front of you."* The list
below is re-derived by asking each component one question — **what fact does it
settle, and who owns it?** — with no interface named. Then a second filter is
applied, because a settled fact is not automatically a public event.

## 0.1 The six settled facts

| # | fact settled | owner | site |
|---|---|---|---|
| F1 | the Need moved from one state to another | `NeedLedger` — sole owner of all nine | `need-ledger.ts:86` |
| F2 | an acquisition attempt began, under a strategy | `ResolutionOrchestrator` — it decides the sequence | `:159` |
| F3 | the resolver produced a candidate / failed / declined | the resolver; the orchestrator relays | `:178` |
| F4 | the candidate passed or failed acceptance and validation, and why | `_validateBeforeAdoption` | `:208` |
| F5 | the capability was registered / was already present / was refused | `Adoption` | `:213` |
| F6 | effort on this strategy ended, and why | `ResolutionOrchestrator` | `:303`, `:313` |

**What the re-derivation already caught.** The earlier list had one phase called
`judged` covering both F4 and F5. They have **different owners**, and the engine
itself names three outcomes at F5 and says so: *"Three outcomes, recorded as
three. 'Already present' is not a rejection"* (`capability-lifecycle.ts:230`).
A single phase would have shipped that conflation.

## 0.2 The filter

A settled fact becomes a public event only if it passes all four:

1. must it be announced **outside** the component that settled it?
2. does it have a **stable, self-contained meaning**?
3. can another consumer use it **without knowing implementation detail**?
4. **would it survive if Console, Web and the SDK were all deleted?**

| fact | 1 | 2 | 3 | 4 | verdict |
|---|:-:|:-:|:-:|:-:|---|
| F1 transition | ✓ | ✓ | ✓ | ✓ | **PUBLIC** |
| F2 attempt began | ✓ | ✓ | ✓ | ✓ | **PUBLIC** |
| F3 resolver outcome | ✗ | ✗ | ✗ | ✗ | internal |
| F4 validation verdict | ✗ | ✓ | ✗ | ✗ | internal |
| F5 adoption outcome | ✓ | ✓ | ✓ | ✓ | **public — carried by F2's ending** |
| F6 strategy exhausted | ✗ | ✓ | ✗ | ✗ | internal |

**F1 passes on the documents.** The nine states are a declared contract
(`05-state-machines.md` §1), stored in `needs`, and the transition names no
resolver and no strategy. Without any interface it still serves an acceptance
test, an investigation and a restart.

**F2 passes on the engine's own precedent.** `capability-evolution-notification.ts:26`
keeps a `started` phase for a stated reason — *"This is the one that explains an
unexpected pause and unexpected token spend"* — and that reason holds with every
interface deleted: without a beginning, no consumer can measure a duration or
know the engine is busy.

**F3 fails on 3.** `ResolverOutcome` is not exported from `official-runtime`'s
public surface; its vocabulary (`resolved` / `declined` / `awaiting_permission`)
is the resolver contract's, not the engine's. And its meaning is incomplete — a
candidate was produced, with its fate unknown. What a consumer needs is the
attempt's *ending*, which F5 gives.

**F4 fails on 1 and 3.** `_validateBeforeAdoption` is private, and the
orchestrator states it owns no validation logic: *"the orchestrator is a CLIENT
of the Lab"* (`:195`). A client relaying a verdict is not the owner of the fact,
and the verdict is consumed immediately by the adoption decision. Its **reason**
survives — as a field on the attempt's ending, which is where a consumer needs
it — but the verdict is not an event.

*This is the one the earlier list had wrongly promoted, and it is the strongest
evidence the filter earns its place.*

**F6 fails on 3.** Budget-spent versus reason-repeated is the loop's own
governance. A consumer needs *the capability was not acquired, and why* — which
is `ABANDONED.cause`. That `cause` does not currently carry it (`:78` writes the
last rejection's reason or a generic sentence) is a **defect in the cause**, to
be fixed where the cause is written — not a new event.

## 0.3 Result: two public events, one deferred candidate

**`need.transition`** (F1) and **`capability.attempt`** (F2 + F5 as its ending).

F5 is carried rather than separate because `ACQUIRED` already announces that the
need was satisfied and the attempt's ending already names the tool; a third event
would publish one fact twice.

**Deferred candidate — `capability.registry.changed`.** "The tool registry now
holds something it did not" is genuinely independent of any need: it is also true
on the evolution path, and a consumer maintaining a tool list would want it
without caring about needs. It is deferred rather than rejected because adopting
it widens the scope to the repair path, and that is a separate decision.

## 0.4 The general layer, and what it is not

```
ENGINE  ──facts + typed contracts──►  ExecutionEventStream
                                              │
                        ┌─────────────────────┼─────────────────────┐
                        ▼                     ▼                     ▼
                     Console                 Web                   SDK
                   own wording          own wording           own usage
```

Shared: the fact, the event name, the contract, the meaning of each field.
**Not shared: the wording.** "Attempt 1 failed because validation failed" is a
consumer's reading, not the engine's fact, and `HANDOFF.md` records that a shared
presentation layer was already rejected for exactly this — `ExecutionView` mixed
engine truth with English phrasing.

So the general layer is not a package. It is the exported contract plus one
publish helper per event, following `publishCapabilityEvolution`'s stated reason:
*"One publish site for all five phases, so the event name and payload shape
cannot drift between the two packages that emit them."* That also answers the
multiple-owner problem: several sites publish, one function fixes the shape.

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

**Four files**, not three — an earlier count omitted the wiring line. Two
`EVENTS` entries, two events, no new component, no new state, no new record, no
signature change.

1. `engine-core/src/services/event-bus.service.ts` — `NEED_TRANSITION` and
   `CAPABILITY_ATTEMPT` added to `EVENTS`.
2. `engine-core/src/needs/need-ledger.ts` — an optional `eventBus`, and one
   publish inside `moveTo` after `updateNeedState`.
3. `engine-core/src/composition/coordinator-factory.ts:163` — pass the existing
   `eventBus` into `new NeedLedger(storage)`.
4. `official-runtime/src/resolution-orchestrator.ts` — `started` before
   `resolver.attempt`, and `settled` at every ending of an attempt.

**Open design point for §2.4.** `settled` must fire on every exit of the attempt
loop, and the loop has several. Publishing inside branches is what
`resolution-orchestrator.ts:170` warns against — the `generated` record once
lived inside the `resolved` branch and an attempt that failed the shape guard
left nothing at all. Either one publish point covering all endings, or a single
helper called from each, with a test that no exit can omit it.

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
  // `settled` only, and it is F5 — the adoption outcome — not F3. The engine
  // names three at :230 and this keeps all three distinct. `declined` is the
  // resolver never producing a candidate; it is included because without it a
  // consumer would have to infer "the catalog did not match" from the absence
  // of anything between two `started` events.
  readonly outcome?: 'adopted' | 'already_present' | 'rejected' | 'declined' | 'awaiting_permission'
  // The verdict's reason (F4) travels here rather than as its own event: the
  // reason is what a consumer needs, the verdict is not a public fact.
  readonly reason?: string
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
