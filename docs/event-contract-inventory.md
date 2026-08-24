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
| 4 | `worker.spawned` | `WorkerFactory` | `factory/worker-factory.ts:144` | `{goalId, workerId, role, workerType, wave, attempt}` | `WorkerSpawnedEventPayload` (`:27`) | **no** | **MISMATCH — see below** |
| 5 | `worker.done` | `ExecutionCoordinator` | `execution.coordinator.ts:257` | `{goalId, wave, workerIndex, workerId, …}` | — | — | shape exists, type missing |
| 6 | `tool.called` | `ToolCaller` | `workers/tool-caller.ts:246` | 14 fields, all declared | `ToolCalledEventPayload` (`:31`) | **no** | matches · **derived from storage — see below** |
| 7 | `tool.args.normalized` | `ToolCaller` | `workers/tool-caller.ts:144` | `{goalId, workerId, toolName, transform, reason, confidence}` | `ToolArgsNormalizedPayload` | **no** | matches · export missing |
| 8 | `checkpoint.saved` | `CheckpointService` | `services/checkpoint.service.ts:33` | `{goalId, attempt, nextWaveIndex}` | — | — | shape exists, type missing |
| 9 | `capability.evolution` | `publishCapabilityEvolution` | `observability/capability-evolution-notification.ts:71` | typed, 2 call sites through one helper | `CapabilityEvolutionNotification` | **yes** | **ready** |

### The two findings in this table

**#4 `worker.spawned` — the type promises fields that are never published.**
`WorkerSpawnedEventPayload` declares eight; the single publish site sends six.
`goalSummary?` and `executionWave?` are **never populated by anyone**. Both are
optional, so the compiler is satisfied and the defect is invisible — but a
consumer reading the type is promised data that does not arrive. Note also that
the published `wave` takes its value from `options.executionWave`, which reads
like an incomplete rename that left the declared `executionWave` stranded.
**This is not an export job.** It is a contract that disagrees with reality and
must be decided — drop the two fields, or populate them — before it is exported.

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
| 11 | `clarification.requested` | `ClarificationCoordinator` | `:122` **and** `:222` | `{question, confidence, settled, …}` — **two sites, agreement unverified** |
| 12 | `clarification.resolved` | `ClarificationCoordinator` | `:179` **and** `:258` | `{confidence, settled, …}` — **two sites, agreement unverified** |
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

**#11 and #12 each have two emit sites, and their agreement is not verified.**
Site B of `clarification.requested` sends `missingInformation`; site A's payload
could not be confirmed to include it from the excerpt read. **No unified type may
be written for either until both sites are read in full.** This is exactly the
case where one interface would be invented rather than declared.

**#21–26 are the opposite case and are healthy:** six event *types* sharing one
emit site and one payload shape, which is a discriminated set already — the type
is written once, and the discriminator is `eventType`.

## Classification

| category | count | events |
|---|---:|---|
| already correctly exported | **1** | `capability.evolution` |
| type exists, matches, export missing | **2** | `tool.called`, `tool.args.normalized` |
| **type exists, disagrees with runtime** | **1** | `worker.spawned` |
| runtime shape exists, type missing | **20** | 5 bus + 15 cognitive |
| **shape unverified across multiple sites** | **2** | `clarification.requested`, `clarification.resolved` |
| payload intentionally generic | **0** | — |

**Zero intentionally generic.** Every one of the 26 publishes a definite object.
No payload is polymorphic by design; the two uncertain ones are uncertain because
they have not been read in full, not because they vary on purpose.

## What this changes about the next stage

The stage was named "Contract Export". Three of the 26 are **not** exports:

- `worker.spawned` needs a decision (drop two dead fields or populate them)
- `tool.called` needs a decision (keep the storage alias or declare its own)
- `clarification.*` need both sites read before any type is written

The remaining 23 are declarations of shapes that already exist, with no decision
in them. **Those two groups should not travel in the same change.** The 23 are
mechanical and reviewable at a glance; the 3 each carry a judgement that deserves
its own argument.

Nothing above has been acted on. The next document is the Contract Export
Plan — zero behaviour changes — and it needs the three decisions above settled
first.
