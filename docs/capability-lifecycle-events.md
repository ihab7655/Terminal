# Capability resolution: the state machine, and the two levels of event a consumer needs

Read before proposing any change to the engine. Nothing here is invented: every
state, transition, line reference and count was read out of the engine source
and out of `agent_engine_v1` on 2026-08-24.

**The gap in one sentence.** The path a need travels is fully modelled, owned by
one component and documented as a state machine — and it publishes nothing, so
no external consumer can know the engine entered it at all.

**The correction this document exists to record.** An earlier version of it was
built from `capability_attempts` alone and treated `generated → rejected →
adopted` as the path. That is not the path. It is the log of attempts made
inside ONE state of it.

---

## 1. The path: the Need state machine

Declared in `agent-engine/docs/architecture/05-state-machines.md` §1, transcribed
into `engine-core/src/needs/need-ledger.ts:22`. Nine states. The document states
that **a transition not listed there does not exist**, and the table names the
engine as the mover of all nine.

```
CAPTURED ──► RESOLVING ──────────────► MET ──────────► CONSUMED (terminal)
                │                       ▲
                ▼                       │
           UNRESOLVED                   │
              │     │                   │
              ▼     ▼                   │
        ACQUIRING   NOT_REQUIRED        │
              │      (terminal)         │
              ▼                         │
         ACQUIRED ────────────────────► │
              │
              ▼
         ABANDONED (terminal)
```

| state | what it means for the task | moved by |
|---|---|---|
| `CAPTURED` | the need was stated and stored. Its text never changes | `NeedLedger.captureOnce` (`:54`) |
| `RESOLVING` | existing capabilities are being matched against it | `NeedLedger.resolved` / `.unresolved` (`:112`, `:120`) |
| `MET` | a capability answers it — the task proceeds | `NeedLedger` (`:113`), and again from `ACQUIRED` at `resolution-orchestrator.ts:83` |
| `NOT_REQUIRED` | nothing answers it and nothing needs to: met by reasoning, not by a capability | `NeedLedger` (`:113`) |
| `UNRESOLVED` | **the capability gap** | `NeedLedger` (`:121`) |
| `ACQUIRING` | **self-development: the engine is trying to obtain it** | `resolution-orchestrator.ts:70` |
| `ACQUIRED` | something was adopted for it | `resolution-orchestrator.ts:73` |
| `ABANDONED` | acquisition ended with nothing, and no further attempt is justified | `resolution-orchestrator.ts:73` |
| `CONSUMED` | the capability was actually used | `need-consumption-recorder.ts:36` |

`ACQUIRED → MET` is the return to the original task. `need-ledger.ts:25` calls it
*"the transition that carries the design"*.

**Every one of these is silent.** `need-ledger.ts`, `resolution-orchestrator.ts`,
`capability-assessor.ts`, `installed-capability-resolver.ts`,
`generation-capability-resolver.ts`, `capability-resolution-middleware.ts` and
`goal-restart-coordinator.ts` contain zero `publish`, `emit` or `eventBus`.

### Three corrections to the remembered path

**There is no "3 attempts".** Two rules bound the loop and whichever fires first
ends it (`resolution-orchestrator.ts:152` and `:302`): a rejection that repeats a
reason already seen buys nothing, and `policy.maxResolverAttemptsPerGap`
**defaults to 1**. The comment gives the reason — *"a rejected capability was
never a failed goal"* — and cites 2026-08-07, where the goal produced the user's
answer in 66,780 tokens after a rejected candidate.

**Searching the local catalog is not a stage before development.** Both
`InstalledCapabilityResolver` and `GenerationCapabilityResolver` sit in the same
`for (const resolver of this.resolvers)` loop (`:141`). They are strategies tried
in sequence, each with its own budget — not two phases.

**There is no named "self-recovery mode" on this path.** What exists is
`ABANDONED` plus `onAnyFailed: 'proceed_anyway'`, which lets the goal continue
with the tools it has. Behaviourally that is "continue with existing
capabilities"; there is no mode to enter.

---

## 2. The two levels, and why one is not enough

`NeedLedger.moveTo` (`need-ledger.ts:86`) is the single funnel for every
transition. It already holds `from`, `to` and `detail { metBy?, cause? }`, and it
already refuses illegal transitions. It is the natural backbone.

**But a backbone is not a narrative.** `ACQUIRING` is one state and, measured
below, the engine can sit in it for over three minutes across several attempts
and more than one strategy. A consumer told only "entered ACQUIRING / left
ABANDONED" learns nothing about the three minutes in between — which is exactly
the stretch a user is sitting through with no explanation.

So two levels, deliberately distinct:

### Level 1 — lifecycle: where the path has got to

One transition, one event. Source: `NeedLedger.moveTo`, which every mover already
goes through. Payload available at that point with no new plumbing: `needId`,
`from`, `to`, `metBy?`, `cause?`, and the need's own text (stored on the row).

Nine states, so at most nine kinds of statement, and they answer *what happened
to my task*.

### Level 2 — attempt / progress: what is happening inside `ACQUIRING`

These do not exist as transitions and must not be forced into the state machine —
`05-state-machines.md` says a transition not listed does not exist. They are
occurrences inside one state. Each already has an exact point in
`resolution-orchestrator.ts`:

| occurrence | line | what is in hand there |
|---|---|---|
| a strategy is chosen | `:141` | `resolver.id` |
| an attempt starts | `:159` | `resolver.id`, `gap.capability`, `attemptsThisResolver`, `priorAttempts` |
| the attempt returned | `:178` | `ResolverOutcome` — `resolved` \| `failed` \| `declined` \| `awaiting_permission` |
| a candidate is validated | `:208` | `verdict`, `verdict.reason` |
| adopted | `:213` | `registeredAs`, `alreadyPresent` |
| rejected, with cause | `:266` | `reason` immediately; `failureAnalysis` after an LLM review |
| budget spent | `:303` | `attempts`, `budget` |
| reason repeated, giving up on this strategy | `:313` | the repeated reason |

**The `failureAnalysis` timing question answers itself at this level.** A
rejection is an occurrence that happens *before* the review; the analysis is a
detail that lands later against the same attempt. There is no need to choose
between "publish late" and "publish without the analysis" — they are two things,
and only one of them is the event.

### What `capability_attempts` is, then

The durable log of level 2, inside `ACQUIRING`. It is not the narrative and must
not shape the live stream. Details of its contents are in §3, kept because they
say what a payload can honestly carry.

---

## 3. What the attempt log actually contains

Two write sites, both in `official-runtime/src/capability-lifecycle.ts`:
`record()` at `:77` (synchronous, no `failureAnalysis`) and `recordRejection()`
at `:200` (**awaits an LLM review before writing**, and writes one).

`CapabilityEventKind` (`engine-core/src/core/interfaces/istorage.ts:73`) declares
eight kinds. Over 54 rows spanning 29 distinct needs, four have never been
written:

| event | rows | written by |
|---|---:|---|
| `rejected` | 23 | `recordAttemptOutcome` case `failed` · `recordRejection` · `adopt` when adoption declines |
| `generated` | 22 | `recordAttemptOutcome` cases `resolved` and `awaiting_permission` |
| `adopted` | 5 | `adopt` |
| `already_present` | 4 | `adopt` |
| `evolved` · `validated` · `accepted` · `retired` | 0 | `evolved` is reachable via `adopt` with `override`; the other three have no writer at all |

`ResolverOutcome.declined` writes no row by design (`capability-lifecycle.ts:114`).

Field fill, all 54 rows:

| field | filled | note |
|---|---|---|
| `capability` | 54/54 | **a need in plain language, not a tool name** — e.g. `ensure the file content is exactly the single word repl with no extra characters`. This is the field a human-facing consumer wants |
| `event`, `source`, `goal_id` | 54/54 | `source` has one value in practice: `generation` |
| `tool_name` | 43/54 | absent on 11 of 23 rejections — `recordAttemptOutcome` case `failed` passes none (`:141`). On `adopt` it may be `registeredAs`, which can differ from the declared name (ADR-002) |
| `reason` | 27/54 | every `rejected` and `already_present`; **never** on `generated` or `adopted` |
| `failure_analysis` | 10/54 | `rejected` only, via `recordRejection`. Shape `{category, rootCauses[]}` |

### Timings — which occurrence a consumer actually needs

`generated` → terminal, same capability, within five minutes:

| ended as | n | mean | max |
|---|---:|---:|---:|
| `adopted` | 5 | **0.5 s** | 1.0 s |
| `rejected` | 12 | 17.4 s | 34.1 s |
| `already_present` | 5 | 42.0 s | **209.1 s** |

Success is instantaneous and needs no live signal. **The silence is the failure
paths**, and the longest of them ends in `already_present` — three and a half
minutes to conclude the registry already held it, which is not a failure at all.

### Two facts that contradict the obvious UI

**A generated tool is never used in the goal that produced it.** For every
adopted capability, `capability_attempts.goal_id = tool_calls.goal_id` is false,
without exception. Adoption happens in an internal sub-goal; use happens
elsewhere — which is `goal-restart-coordinator.ts`, and its own header explains
that it is a **restart**, not a resume.

**Most adopted tools are never called.** Of five: `extract` 35 calls,
`extract_link_targets` 1, and `print_hello`, `run_python_script`,
`write_repl_content` none.

---

## 4. What is decided and what is not

Decided by the record: the live stream is driven by the state machine, not by
`capability_attempts`; and the two levels are distinct, because `moveTo` alone
cannot narrate a state that lasts minutes.

Not decided here, and needing a deliberate choice before any code:

- whether level 2 publishes on the existing bus alongside level 1, or is a
  separate concern with its own owner;
- whether a level-2 occurrence carries the `needId` (it is available: `gap.id`
  is what `resolution-orchestrator.ts:70` moves), which is what would let a
  consumer nest the attempts under the state they belong to.

`observability/execution-event-stream.ts:23` records the mechanism either way:
*"A new event is a new EVENTS entry plus a publish at its owner — this file is
not edited."* The stream holds no table of event names, so it carries new ones
with no edit outside their owners.
