# ExecutionEventStream — audit of the engine's live read boundary

**Why this exists.** Building one console required reading `NeedLedger`,
`ResolutionOrchestrator`, `CapabilityLifecycleService`, both resolvers,
`capability-assessor`, the middleware, two ADRs and a state-machine document —
and then querying Postgres — to learn what the engine does while it works. The
next interface would repeat all of it. That is the defect, and it is larger than
the capability path that surfaced it.

**The rule this audit measures the engine against.** Proposed, not yet adopted:

> No interface, host or SDK reads inside the engine to learn what is happening.
> The only permitted source of live execution state is `ExecutionEventStream`.

The rule is only honest if the stream can carry it. This audit asks whether it
can, on the four questions, and answers each with counts rather than opinion.

---

## Q1 — What reaches the stream today

`ExecutionEventStream` merges two buses and holds no table of event names
(`execution-event-stream.ts:23`), so its content is exactly the union of what the
two declare: **26 events.**

**`EVENTS` — 9** (`services/event-bus.service.ts`): `goal.started`,
`goal.completed`, `goal.failed`, `worker.spawned`, `worker.done`, `tool.called`,
`tool.args.normalized`, `checkpoint.saved`, `capability.evolution`.

**`CognitiveEventType` — 17** (`reflection/types.ts`):
`classification.completed`, `clarification.requested`, `clarification.resolved`,
`planning.started`, `planning.finished`, `execution.wave.started`,
`execution.wave.finished`, `verification.completed`, `retry.triggered`,
`retry.plan_changed`, `completion.finished`, and six `directive.*`.

So a consumer can see: the cognitive loop, tool calls, workers, checkpoints, and
capability *repair*.

## Q2 — What does not reach it

**20 of the engine's 28 subsystems publish nothing at all.** Counted by looking
for any publish or emit under each directory of `engine-core/src`:

| publishes | subsystem (files) |
|---|---|
| yes | `brain` (8/18) · `composition` (2/7) · `services` (2/13) · `runtime` (2/8) · `factory` · `infra` · `observability` · `reflection` · `steering` · `workers` |
| **no** | `tools` (49) · `planning` (28) · `intelligence` (23) · `core` (21) · `acceptance` (18) · `reasoning` (9) · `session` (9) · `verification` (4) · `adapters` (5) · `validation` (3) · `certification` (3) · `workflow` (3) · `needs` (2) · `automation` (2) · `bootstrap` (2) · `policy` · `repair` · `understanding` · plus 2 more |

Silence is not automatically a defect — most of those hold no fact that should
cross a boundary. What matters is that **the largest subsystems in the engine are
entirely absent from its live surface**, and at least one of them was measured to
hold a public fact: `needs`, whose nine-state machine is a declared contract in
`05-state-machines.md` §1 and emits nothing (see
`capability-lifecycle-events.md`).

Each remaining silent subsystem needs the same treatment that document applied —
find the settled facts, filter for public — before anything is added. This audit
does not pre-judge them.

## Q3 — Do the events that do arrive have contracts

**One of 26 has a payload type a consumer can import.**

| | count | detail |
|---|---:|---|
| named payload type **and exported** | **1** | `CapabilityEvolutionNotification` |
| named payload type, **not exported** | 3 | `ToolCalledEventPayload`, `WorkerSpawnedEventPayload`, `ToolArgsNormalizedPayload` — all `0` occurrences in `engine-core/src/index.ts` |
| no named payload at all | 5 | `goal.started`, `goal.completed`, `goal.failed`, `worker.done`, `checkpoint.saved` |
| `payload: Record<string, unknown>` | 17 | every cognitive event — `reflection/types.ts:31` |

`CognitiveEvent` itself is also unexported (`0` in `index.ts`), so the type of
17 of the 26 is unreachable from outside as well.

The envelope is well specified — `ExecutionEvent` documents `eventId`, `goalId`,
`originGoalId`, `parentGoalId`, `occurredAt`, `sequence` and `terminal`
carefully, and `ADR-011` decides what it is keyed on. **The envelope is a
contract; the contents are not.**

## Q4 — Could a new interface be built on the stream alone

**No**, and for two independent reasons, either of which is sufficient:

1. **Contracts.** A consumer receives `payload: unknown` for 25 of 26 events. To
   render `tool.called` it must open `workers/tool-caller.ts`. To render any
   cognitive event it must find the coordinator that emitted it. That is the
   forensic search the rule is meant to abolish, and no amount of new events
   fixes it.
2. **Coverage.** Whole phases of what the engine does are absent. The capability
   path is the measured example: up to 209 seconds of work with nothing emitted.

## What this changes about the work in front of us

The capability-path events are **not the gap** — they are one instance of it. The
gap is that `ExecutionEventStream` is described as the live view of an execution
and is not yet a public surface.

That reorders the work, and the order matters because the second item is cheap
only after the first:

**A — make the existing 26 consumable.** Export the three named payload types and
`CognitiveEvent`; give the five unnamed bus payloads a declared type; decide what
a cognitive payload is, per event type, rather than `Record<string, unknown>`.
No new event, no behaviour change, no new fact — this is publishing contracts for
facts already crossing the boundary. It is also what makes the proposed rule
truthful rather than aspirational.

**B — close the measured coverage gap.** The two capability events, already
derived and filtered in `capability-events-plan-and-lld.md`.

**C — audit the remaining silent subsystems**, one at a time, with the same two
steps: what fact does this component settle and who owns it, then does that fact
cross the boundary. Never "what does the interface want".

A is larger than B and has no dependency on it. B does not become wrong if A is
never done — but the rule cannot be adopted until A is, because until then every
consumer must read the engine to use the stream.

## What this audit does not claim

It does not say the 20 silent subsystems should publish. It does not name a
single event to add beyond the two already derived. It does not propose a shape
for cognitive payloads — that is per event type and belongs with each owner.
And it does not touch the constitution's General Engine First: everything above
is judged on whether an arbitrary consumer can use the stream, with no interface
named anywhere in it.
