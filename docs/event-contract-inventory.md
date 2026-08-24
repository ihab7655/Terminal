# Contract Export Audit — all 26 live events, read at their publish sites

**Stage rule.** Read only. No event added or removed, no publish time changed,
no runtime payload changed, no engine behaviour changed, no interface designed.
Every row below was read at the publish site, not from the `EVENTS` list.

**The question per row:** can a consumer understand this event without opening
engine internals — and does the type, where one exists, match what is published?

---

## The nine bus events

| # | event | owner / publisher | publish site | runtime payload | existing type | exported | contract status |
|--:|---|---|---|---|---|:-:|---|
| 1 | `goal.started` | `MainBrain` | `brain/main-brain.ts:200` | `{goalId, goal, resumed?, originGoalId?, parentGoalId?}` | — | — | shape exists, type missing |
| 2 | `goal.completed` | `CompletionCoordinator` | `completion.coordinator.ts:109`, `:246` | `{goalId}` | — | — | shape exists, type missing · **two sites, identical** |
| 3 | `goal.failed` | `CompletionCoordinator` | `completion.coordinator.ts:168`, `:248` | `{goalId, reason}` | — | — | shape exists, type missing · **two sites, identical** |
| 4 | `worker.spawned` | `WorkerFactory` | `factory/worker-factory.ts:144` | `{goalId, workerId, role, workerType, wave, attempt}` | `WorkerSpawnedEventPayload` (`:27`) | **no** | matches · export missing |
| 5 | `worker.done` | `ExecutionCoordinator` | `execution.coordinator.ts:257` | `{goalId, wave, workerIndex, workerId, …}` | — | — | shape exists, type missing |
| 6 | `tool.called` | `ToolCaller` | `workers/tool-caller.ts:246` | 14 fields, all declared | `ToolCalledEventPayload` (`:31`) | **no** | matches · **derived from storage — see below** |
| 7 | `tool.args.normalized` | `ToolCaller` | `workers/tool-caller.ts:144` | `{goalId, workerId, toolName, transform, reason, confidence}` | `ToolArgsNormalizedPayload` | **no** | matches · export missing |
| 8 | `checkpoint.saved` | `CheckpointService` | `services/checkpoint.service.ts:33` | `{goalId, attempt, nextWaveIndex}` | — | — | shape exists, type missing |
| 9 | `capability.evolution` | `publishCapabilityEvolution` | `observability/capability-evolution-notification.ts:71` | typed, 2 call sites through one helper | `CapabilityEvolutionNotification` | **yes** | **ready** |

### The finding in this table

**A correction to an earlier draft of this document, recorded because the method
is the point.** This audit first reported `worker.spawned` as a mismatch —
"declares eight fields, publishes six". It does not. `WorkerSpawnedEventPayload`
declares exactly the six that are published. The two extra fields, `goalSummary`
and `executionWave`, belong to `SpawnOptions`, the **next interface in the same
file** (`worker-factory.ts:37`), and were swept in by reading a fixed number of
lines after the declaration instead of reading the declaration.

The claim was made from an excerpt and withdrawn on reading the source. Its only
cost was one round of investigation — which is what the read-only stage is for.

**#6 `tool.called` — the public contract is an alias of a storage row.**
`ToolCalledEventPayload = Omit<ToolCallRecord, 'id' | 'createdAt'>`, and
`ToolCallRecord` is a persistence interface in `core/interfaces/istorage.ts`.
The fields match what is published today, so there is no live defect. But the
engine's public event contract is currently coupled to a database row shape:
changing the storage record silently changes what every consumer is promised.
Worth an explicit decision at export time, not a silent inheritance.

*(Unrelated but found on the way: two different interfaces named `ToolCallRecord`
exist — `core/interfaces/istorage.ts` (the tool call) and `brain/types.ts:652`
(a worker result). Not a defect in the events; a name collision worth knowing
about before writing `import type { ToolCallRecord }`.)*

## The seventeen cognitive events

All declared as `payload: Record<string, unknown>` (`reflection/types.ts:31`).
`CognitiveEvent` itself is unexported. Every payload has a definite shape at its
emit site.

| # | event | owner | emit site | runtime payload |
|--:|---|---|---|---|
| 10 | `classification.completed` | `ClassificationCoordinator` | `:57` | `{goalType, confidence}` |
| 11 | `clarification.requested` | `ClarificationCoordinator` | `:122` **and** `:222` | `{question, confidence, missingInformation, settled}` — **two sites, verified identical** |
| 12 | `clarification.resolved` | `ClarificationCoordinator` | `:179` **and** `:258` | `{effectiveGoal, confidence, missingInformation, settled}` — **two sites, verified identical** |
| 13 | `planning.started` | `PlanningCoordinator` | `:353` | `{attempt, isRetry, startedAt}` |
| 14 | `planning.finished` | `PlanningCoordinator` | `:668` | `{attempt, wavesCount, finishedAt, …}` |
| 15 | `execution.wave.started` | `ExecutionCoordinator` | `:109` | `{…, attempt}` |
| 16 | `execution.wave.finished` | `ExecutionCoordinator` | `:242` | — |
| 17 | `verification.completed` | `VerificationCoordinator` | `:144` | `{passed, reason}` |
| 18 | `retry.triggered` | `RetryCoordinator` | `:49` | `{attempt, reason}` |
| 19 | `retry.plan_changed` | `RetryCoordinator` | `:106` | `{attempt}` |
| 20 | `completion.finished` | `CompletionCoordinator` | `:251` | `{success, durationMs, attempts, …}` |
| 21–26 | the six `directive.*` | `SteeringLedger` | `steering-ledger.ts:276` | one shape for all six: `{text, state, …}` — **one emit site, six types** |

### The finding in this table

**#11 and #12 were flagged unverified and are now verified.** All four emit
sites were read in full. Both events are **identical across their two sites**,
field for field. One type each, declared not invented. They move to the
mechanical group.

**#21–26 are the opposite case and are healthy:** six event *types* sharing one
emit site and one payload shape, which is a discriminated set already — the type
is written once, and the discriminator is `eventType`.

## Classification

| category | count | events |
|---|---:|---|
| already correctly exported | **1** | `capability.evolution` |
| type exists, matches, export missing | **3** | `tool.called`, `tool.args.normalized`, `worker.spawned` |
| type exists, disagrees with runtime | **0** | — |
| runtime shape exists, type missing | **22** | 5 bus + 17 cognitive |
| shape unverified across multiple sites | **0** | — |
| payload intentionally generic | **0** | — |
| **carries an architectural decision** | **1** | `tool.called` — see the decision report |

**Zero intentionally generic.** Every one of the 26 publishes a definite object.
No payload is polymorphic by design; the two uncertain ones are uncertain because
they have not been read in full, not because they vary on purpose.

## What this changes about the next stage

Three events were suspected of carrying decisions. After reading every publish
site in full, **one does.**

- `worker.spawned` — no mismatch. Mechanical.
- `clarification.requested` / `.resolved` — verified identical across both
  sites. Mechanical.
- `tool.called` — the public contract is an alias of a storage interface. This
  one is real, and it is the subject of the decision report below.

So the split is **25 mechanical, 1 decision** — not 23 and 3.

---

# Decision report — `tool.called` and the storage alias

**Outcome: keep the alias. Export it unchanged. The earlier recommendation in
this document is withdrawn.**

## Why the design exists — traced, not guessed

The alias was created in `0a3fda6`, *"LLD-1 — Execution Observability (real
tool_calls persistence)"*. Its own commit body states the intent:

> "A new `observability/tool-call-recorder.ts` subscriber **bridges
> EVENTS.TOOL_CALLED to persistence**"

And the bridge is one line (`tool-call-recorder.ts:21`):

```ts
storage.saveToolCall({ ...payload, id: randomUUID(), createdAt: Date.now() })
```

**The payload IS the row**, minus the two keys the subscriber mints. So
`Omit<ToolCallRecord, 'id' | 'createdAt'>` is not a borrowed shape — it is an
exact statement of that relationship, enforced by the compiler.

## Two claims from the earlier draft, both withdrawn

**"`createdAt` does not exist on `ToolCallRecord`, so the alias has already
drifted."** False. `createdAt: number` is the record's last field. The claim came
from reading a fixed number of lines after the declaration, which cut the
interface short — **the same reading error that produced the `worker.spawned`
mismatch earlier in this document.** Two false findings from one habit. The
method changes: a type is read from its opening brace to its closing brace, never
from an excerpt.

**"Exporting the alias freezes a database row as the public contract."** True in
form, wrong in substance. The event and the row are one artifact by design, not
by accident, and `ToolCallRecord` is already exported (`index.ts:404`).

## What separation would cost

The compiler guard on the bridge. Today, adding a required field to
`ToolCallRecord` breaks the build at the publish site, which is where it must be
fixed. After separation the two shapes drift independently: the addition
compiles, and `saveToolCall` is called with an object missing a required field —
a build error today, a silent one after.

**Gain from separating: none that is real.** The theoretical risk — storage
changes the public contract — is the intended behaviour here.

## And the pattern says so

`PATTERNS.md` P7 — *Permanent Structure Is the Last Resort*: solve with what you
have, extend what you have, create a new lasting artifact only when nothing else
reaches. A second interface duplicating an existing one, plus a test to keep the
duplicate honest, is a permanent structure invented to solve a problem that the
trace shows does not exist.

## Decision

Export `ToolCalledEventPayload` as it stands. Add a comment at its declaration
recording *why* it is an alias — that the payload is the stored row minus the
minted keys — so the next reader does not repeat this investigation.

**So all 26 events are mechanical.** There is no second, decision-carrying
change. One stage, one review.

---

Nothing above has been acted on. Next: the Contract Export Plan — 26 mechanical
declarations, zero behaviour change.
