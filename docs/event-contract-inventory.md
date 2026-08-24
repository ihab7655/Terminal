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

## The problem

`ToolCalledEventPayload = Omit<ToolCallRecord, 'id' | 'createdAt'>`
(`workers/tool-caller.ts:31`), where `ToolCallRecord` is a persistence interface
in `core/interfaces/istorage.ts`. Exporting it as-is makes a database row shape
the engine's public event contract.

## The reality, measured

- `ToolCallRecord` **is already exported** — `engine-core/src/index.ts:404`. The
  storage model is on the public surface today; this is not a boundary about to
  be crossed, it is one already crossed.
- **Three internal subscribers already depend on the alias**:
  `observability/tool-call-recorder.ts:14`, `needs/need-consumption-recorder.ts:31`,
  `tools/investigation/tool-call-failure-trigger.ts:62`. It is a working contract,
  not a dormant one.
- The published object matches the type field for field — verified at `:246`.
- **`createdAt` does not exist on `ToolCallRecord`.** The `Omit` removes a key
  that is not there. Harmless, and evidence the alias has already drifted once
  from the record it tracks.

## The alternatives

| | what it does | effect |
|---|---|---|
| **A. Export the alias unchanged** | one line | zero risk, zero work. Freezes "the event is the row" as the public contract, and a future storage migration silently changes what consumers are promised |
| **B. Declare an independent interface with the same fields** | ~15 lines | the event contract becomes its own thing. TypeScript is structural, so the three existing subscribers and every future consumer are unaffected — **this is not a breaking change**. Cost: two shapes that must stay in step |
| **C. B, plus a type-level test asserting the two remain assignable** | B + one test | keeps the independence and makes the drift impossible to ship silently. The stale `createdAt` shows drift is not hypothetical |

## Recommendation — C

The event and the row answer different questions and already disagree by one
key. B alone replaces a coupling with a duplication; the test is what makes the
duplication safe, and it fails loudly the day storage changes.

It also stays inside this stage's rule. **No runtime value changes**: the same
object is published, the same fields arrive, no publish moves, no behaviour
differs. Only a type declaration and a test are added.

## What changes, and what does not

**Changes:** `ToolCalledEventPayload` stops being an alias and becomes an
interface with the fourteen fields it already carries; one type-level test.

**Does not change:** the published object, the publish site, the three
subscribers (structural typing — no edit, no recompile break), `ToolCallRecord`
itself, `istorage.ts`, and every other event.

**Not decided here:** whether `ToolCallRecord` should remain exported from
`index.ts` at all. That is a storage-surface question, not an event question,
and it does not block this.

---

Nothing above has been acted on. Next: the Contract Export Plan — 25 mechanical
declarations in one change, and this decision in a second, separate one.
