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

## 4. The final table: every real event, its owner, and the fields present at it

**Both levels use the existing bus.** `execution-event-stream.ts` already merges
two buses and holds no table of event names, so a new name flows into
`ExecutionEvent` with no edit outside its owner. A third bus would buy nothing.

**Every level-2 occurrence carries `needId`.** It is in hand: `gap.id` is the
same value `resolution-orchestrator.ts:70` moves through the ledger. Without it
the two levels are two parallel streams; with it a consumer nests the attempts
under the state they belong to. `gap.id` is optional in the type — an attempt
for a gap with no id carries none, and a consumer must tolerate that rather than
assume it.

### Level 1 — one owner, one funnel

| | |
|---|---|
| **owner** | `NeedLedger.moveTo` — `engine-core/src/needs/need-ledger.ts:86` |
| **when** | after the legality check and the storage write, on a transition that actually occurred. `moveTo` returns `false` and writes nothing for an illegal or a no-op transition; neither is an occurrence |
| **fields in hand** | `needId`; `from` = `current.state`; `to`; `detail.metBy?`; `detail.cause?` — and, from the `NeedRecord` it already loaded at `:90`: `goalId`, `originGoalId`, `text` (immutable), `reason?`, `evidence[]` |

`text` is the field that makes this legible to a person: the need in the words it
was captured in. Nothing has to be looked up to render a level-1 event.

### Level 2 — inside `ACQUIRING`, all in `resolution-orchestrator.ts`

| # | occurrence | line | fields present at that point |
|---|---|---|---|
| 1 | a strategy is selected | `:141` | `resolver.id`, `gap.id?`, `gap.capability`, `canonicalId?` |
| 2 | an attempt starts | `:159` | as above, plus `attemptsThisResolver`, `priorAttempts[]` (`{summary, reason}`), `workspaceDir?` |
| 3 | the attempt returned | `:178` | `ResolverOutcome`: `resolved` → `tools[]`, `goalId?`; `failed` → `reason`, `goalId?`; `declined` → nothing; `awaiting_permission` → `decision`, `artifacts?` |
| 4 | a candidate was judged | `:208` | `{adopt: true, persisted?}` or `{adopt: false, reason}` |
| 5 | adoption returned | `:213` | `AdoptionOutcome`: `adopted`, `reason?`, `alreadyPresent?`, `registeredAs?` |
| 6 | a rejection was recorded | `:266` | `reason` (immediately), `statedCause`; `failureAnalysis` `{category, rootCauses[]}` **only after an LLM review** |
| 7 | the budget is spent | `:303` | `attemptsThisResolver`, `budget` |
| 8 | a reason repeated | `:313` | the repeated `verdict.reason` |

Two things this table settles. `goalId` on 3 is what joins an attempt's cost to
`llm_calls`, and it is **absent for a resolver that runs no goal** — an installed
pack. And 6 is the only point whose full payload is not available synchronously.

## 5. The smallest set that makes the story visible

Not eight events. Most of the table is either already carried by another event or
is an internal step with no consequence a reader can act on.

**Two events.**

### `need.transition` — level 1, published by `NeedLedger.moveTo`

Carries `{needId, from, to, text, goalId, originGoalId, metBy?, cause?}`.

Nine states, so at most nine kinds of statement, and it alone answers *what
happened to my task*: the gap was found (`UNRESOLVED`), the engine started trying
(`ACQUIRING`), it worked or it did not (`ACQUIRED` / `ABANDONED`, with `cause`),
the task resumed (`MET`), the capability was used (`CONSUMED`).

Adoption needs no event of its own: `ACQUIRED` is that fact, and `metBy` is the
tool. Abandonment needs no reason event: `cause` is already the reason, and rows
7 and 8 are what set it.

### `capability.attempt` — level 2, published in `resolution-orchestrator.ts`

Carries `{needId?, capability, resolverId, attempt, phase, reason?, toolName?}`,
with `phase` one of `started` (row 2) and `settled` (rows 3 and 5 collapsed).

One event with a phase rather than two names, following the precedent the engine
already set for `capability.evolution` and its stated reason
(`event-bus.service.ts:23`): *"a host that renders 'starting' without rendering
how it ended has misinformed the user. Separate names make that partial
subscription the easy mistake."*

`settled` carries what happened in one field, from the values already in hand at
`:178` and `:213`: adopted, already-present, rejected, declined, or
awaiting-permission — the same distinctions the lifecycle log already draws, so
nothing new is named.

### What is deliberately left out, and why

| left out | why |
|---|---|
| strategy selected (1) | `resolverId` is on every attempt. A separate event says only that a loop iterated |
| candidate judged (4) | its outcome is the `settled` reason. A validation that passes has no consequence a reader can act on |
| budget spent (7), reason repeated (8) | both are why acquisition ended, and that is `ABANDONED.cause` |
| `failureAnalysis` | it lands after an LLM review. The rejection is already published with `reason`; the analysis is a later detail against the same attempt, and `capability_attempts` already stores it |

Two events, one of them phased. Everything a reader needs to follow the story —
gap found, strategy tried, attempt failed and why, next attempt, adopted or
given up, task resumed — and no internal line turned into an event.

## 4. What is decided and what is not

Decided by the record: the live stream is driven by the state machine, not by
`capability_attempts`; and the two levels are distinct, because `moveTo` alone
cannot narrate a state that lasts minutes.

Decided in §4 and §5: the existing bus for both levels; `needId` on every
level-2 occurrence; and two events, `need.transition` and `capability.attempt`.

Not decided, and the only thing left before code:

- `gap.id` is optional, so some attempts will carry no `needId` and cannot be
  nested. Whether that is acceptable, or whether the gap should be given an id
  earlier, is a question about the resolution path and not about events.

`observability/execution-event-stream.ts:23` records the mechanism either way:
*"A new event is a new EVENTS entry plus a publish at its owner — this file is
not edited."* The stream holds no table of event names, so it carries new ones
with no edit outside their owners.
