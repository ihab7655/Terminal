# Contract Export Plan — 26 event contracts, zero behaviour change

**Status:** plan only. Nothing implemented. Follows `WORKING-METHOD.md` §2 and §4.

**Where this document belongs.** `WORKING-METHOD.md` §3 requires design documents
to live in the engine repository. This one lives in `Terminal/docs/` only because
the engine has not been touched; **on approval it moves to the engine repo as the
first commit of the work**, so the next agent can reach it.

---

## 1. Reuse Checklist (§2 — mandatory, answered before any design)

**1. What already exists?** All 26 events, published and consumed today.
`EVENTS`, `CognitiveEventType`, `ExecutionEvent`, `ExecutionEventStream`, and
four named payload types. Every payload has a definite shape at its publish site
— audited one by one in `event-contract-inventory.md`.

**2. What is actually missing?** Per §2's own table, this is the **export** row:
*"it exists and is correct, but the module that needs it cannot import it."*
Three named types are unexported; 22 shapes are real but undeclared;
`CognitiveEvent` is unexported. **Zero shapes are missing.**

**3. Can the existing thing be reused as it stands?** Yes, entirely. No publish
site moves, no payload changes, no event is added or removed,
`execution-event-stream.ts` is not edited, `ExecutionEvent<P>` keeps its current
form.

**4. Who consumes the result?** `cli-execution-view.ts` — **today, inside the
engine.** At `:93` it does `const p = event.payload as Record<string, unknown>`,
which is the exact defect this work removes. It is the first consumer and its
cast disappearing is the observable behaviour that ends the phase (§4: *a phase
ends at observable behaviour or an API production code actually calls*).
The Terminal console and a future web UI are second and third — not the
justification.

**5. Stop condition — not triggered.** A real consumer exists and is edited in
this same change.

## 2. What changes and what does not

```
26 events, already published        no new events
zero runtime behaviour change       no publish site moves
no payload value changes            execution-event-stream.ts untouched
each payload declared at its owner  a central index only RE-EXPORTS
ExecutionEvent<P> kept as-is        KnownExecutionEvent added beside it
```

**Why the payload type stays with its owner.** Decided already, not by this
plan: `docs/lld/execution-event-stream.md:222` — *"The payload's type is owned
and declared by whoever publishes it … the 'declared contract, not a shared
assumption' rule from CLAUDE.md."* A central file holding the shapes would be
the central union `General Engine First` forbids. The new directory re-exports;
it declares nothing of its own except the union.

**Why `ExecutionEvent<P>` is not converted.** It is exported (`index.ts:343`) and
consumed. Converting it edits a live public type for no gain a second type does
not give. `KnownExecutionEvent` is a pure addition: new consumers narrow on
`eventType`; existing ones are untouched.

**What this plan deliberately does NOT do:**
- does not add `sessionId` to the envelope — `execution-event-stream.md:231`
  gives three documented reasons, any one sufficient
- does not add `attempt`/`wave` to the envelope — same section, same reasoning
- does not add a `source` discriminator — same section
- does not split `ToolCalledEventPayload` from `ToolCallRecord` — traced to
  `0a3fda6`; the alias states the bridge relationship and the compiler guards it
- does not touch `ToolCallRecord`, `istorage.ts`, or any schema
- does not publish anything for the capability path — that is the next stage

## 3. Files that change, and why

| # | file | change | why |
|--:|---|---|---|
| 1 | `workers/tool-caller.ts` | comment on the alias; no code | records why it is `Omit<ToolCallRecord,…>` so the trace is not repeated |
| 2 | `brain/main-brain.ts` | declare + export `GoalStartedEventPayload` | shape at `:200` is `{goalId, goal, resumed?, originGoalId?, parentGoalId?}` |
| 3 | `brain/coordinators/completion.coordinator.ts` | declare `GoalCompletedEventPayload`, `GoalFailedEventPayload`, + `CompletionFinishedPayload` | three shapes, two publish sites each for the bus pair — verified identical |
| 4 | `brain/coordinators/execution.coordinator.ts` | declare `WorkerDoneEventPayload` + the two wave payloads | `:257`, `:109`, `:242` |
| 5 | `services/checkpoint.service.ts` | declare `CheckpointSavedEventPayload` | `{goalId, attempt, nextWaveIndex}` at `:33` |
| 6 | `brain/coordinators/planning.coordinator.ts` | two cognitive payloads | `:353`, `:668` |
| 7 | `brain/coordinators/classification.coordinator.ts` | one | `:57` |
| 8 | `brain/coordinators/clarification.coordinator.ts` | two | both verified identical across their two sites each |
| 9 | `brain/coordinators/retry.coordinator.ts` | two | `:49`, `:106` |
| 10 | `brain/coordinators/verification.coordinator.ts` | one | `:144` |
| 11 | `steering/steering-ledger.ts` | one payload shared by the six `directive.*` | one emit site, six types — the discriminator is `eventType` |
| 12 | `reflection/types.ts` | export `CognitiveEvent` and `CognitiveEventType` — **no shape change** | `payload: Record<string, unknown>` stays; per-event narrowing lives in the union |
| 13 | **new** `observability/events/index.ts` | re-exports + `KnownExecutionEvent` | the one import path for any consumer |
| 14 | `index.ts` | re-export `observability/events` | the public surface |
| 15 | `cli-execution-view.ts` | replace the `as Record<string, unknown>` at `:93` with narrowing on `KnownExecutionEvent` | the first consumer; this is the observable result |

Fifteen files. Fourteen add declarations and one removes a cast.

## 4. The union

```ts
// observability/events/index.ts — declares nothing but this
type Envelope<T, P> = Omit<ExecutionEvent<P>, 'eventType'> & { readonly eventType: T }

export type KnownExecutionEvent =
  | Envelope<typeof EVENTS.TOOL_CALLED, ToolCalledEventPayload>
  | Envelope<typeof EVENTS.WORKER_SPAWNED, WorkerSpawnedEventPayload>
  | … 26 members
```

so a consumer writes `switch (event.eventType)` and the payload narrows with no
cast.

## 5. Acceptance criteria — mechanically checkable

1. `git diff --stat` shows **zero lines** changed in
   `observability/execution-event-stream.ts`, `core/interfaces/istorage.ts`, and
   `infra/database/schema.ts`.
2. No line containing `publish(` or `.emit({` appears in the diff.
3. `cli-execution-view.ts` contains no `as Record<string, unknown>`.
4. All three test tiers pass with **no test file edited** — behaviour is
   unchanged, so no test should need to change.
5. A consumer file outside `engine-core` compiles against
   `KnownExecutionEvent` with zero casts. (The Terminal console proves this
   without being wired to the engine at runtime.)

## 6. Step 0 — done. All five now VERIFIED

Each read from the opening brace of the emitted object to its closing brace, and
every publish site of each event counted.

| event | payload, complete | sites |
|---|---|---|
| `worker.done` | `{goalId, wave, workerIndex, workerId, success}` | 1 |
| `execution.wave.started` | `{waveIndex, workersCount, attempt}` | 1 |
| `execution.wave.finished` | `{waveIndex, success, toolCallsCount, tokenCost, attempt}` | 1 |
| `planning.finished` | `{attempt, wavesCount, finishedAt, startedAt}` | 1 |
| `completion.finished` | see below | **3** |

### What step 0 found

**`completion.finished` has three emit sites and two shapes.**

- `:114` — `{success: true, durationMs, attempts, terminal: true}`
- `:176` — `{success: false, durationMs, attempts, terminal: true}`
- `:254` — `{success, durationMs, attempts, status, reason, terminal: true}`

So `status` and `reason` arrive from one site of three. The type declares them
**optional** — which is a declaration of what is published, not a unification of
two shapes into an invented one. This is the case the audit was watching for,
and it was found only by counting sites rather than reading one.

**`terminal` is a payload field, lifted by the stream.**
`execution-event-stream.ts` reads `fields['terminal'] === true` to set
`ExecutionEvent.terminal`. It is part of `completion.finished`'s contract, not
something the envelope invents — and the LLD's "not a list of event names" claim
about `terminal` is what this implements. It must appear in the declared type.

**A miscount, corrected before it mattered.** A first pass reported
`TOOL_CALLED` with three publish sites. Two are comments that mention it
(`worker-context.ts:116`, `worker-factory.ts:69`); there is one real publisher.
Counting with grep counts prose.

### Effect on the plan

**File count unchanged: 15.** All five belong to files already listed (3, 4, 6).

**One declaration changes:** `CompletionFinishedPayload` carries
`status?: string`, `reason?: string` and `terminal: true`.

**No UNVERIFIED premise remains.** §4's block is lifted.

## 7. Order

1. Declare the 22 missing types at their owners (files 1–12).
2. Add `observability/events/` and the union (13), export it (14).
3. Remove the cast in `cli-execution-view.ts` (15) — the phase ends here.

One commit, or one per group of three, but **one review**: every line is a
declaration except the last file.
