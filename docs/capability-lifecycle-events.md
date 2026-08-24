# Capability lifecycle: what is already recorded, and what a live consumer is missing

Read before proposing any change to the engine. Nothing here is a proposal and
nothing here is invented: every transition, field and count below was read out
of `packages/official-runtime/src/capability-lifecycle.ts` and out of the
`capability_attempts` table in `agent_engine_v1` on 2026-08-24.

**The gap in one sentence.** The engine records a capability's whole lifecycle
faithfully and publishes none of it, so an external consumer cannot know the
engine has entered the capability path at all — including a stretch measured at
up to 209 seconds during which nothing is emitted.

---

## The two write sites

There are exactly two calls to `saveCapabilityAttempt` outside the persistence
layer, both in `capability-lifecycle.ts`:

| Line | Method | Synchronous? | Writes `failureAnalysis`? |
|---|---|---|---|
| 77  | `record(capability, event, ctx, reason?)` | yes | no |
| 200 | `recordRejection(capability, ctx, reason, gapDescription?)` | **no — awaits an LLM review first** | yes |

`record()` is the one every other method funnels through. `adopt()` and
`recordAttemptOutcome()` both call it; `recordRejection()` is the single
exception and writes its own row.

That asynchrony matters and is the one real design question here — see
**Where a publish would go** below.

## The transitions that actually occur

`CapabilityEventKind` (`engine-core/src/core/interfaces/istorage.ts:73`)
declares eight. Four of them have never been written:

| Event | Rows | Written by | Condition |
|---|---:|---|---|
| `rejected` | 23 | `recordAttemptOutcome` case `failed` · `recordRejection` · `adopt` when adoption declines | a gate or a resolver refused |
| `generated` | 22 | `recordAttemptOutcome` cases `resolved` and `awaiting_permission` | a candidate exists |
| `adopted` | 5 | `adopt` when `result.adopted` and not `override` | the registry now holds it |
| `already_present` | 4 | `adopt` when `result.alreadyPresent` | same structural id already registered |
| `evolved` | 0 | `adopt` when `result.adopted` **and** `override` | reachable, never reached |
| `validated` | 0 | nobody | declared only |
| `accepted` | 0 | nobody | declared only |
| `retired` | 0 | nobody | declared only |

`ResolverOutcome.declined` deliberately writes **no row** — a resolver declining
work that is not its kind is not an event about the capability
(`capability-lifecycle.ts:114`).

54 rows across 29 distinct needs. Adoption is the rare outcome: **9%**, against
43% rejected.

## The payload, as it is actually filled

Column fill measured over all 54 rows:

| Field | Filled | Notes |
|---|---|---|
| `capability` | 54/54 | **A NEED IN PLAIN LANGUAGE, NOT A TOOL NAME.** e.g. `ensure the file content is exactly the single word repl with no extra characters`. This is the field a human-facing consumer wants. |
| `event` | 54/54 | one of the four above |
| `source` | 54/54 | only value present: `generation`. `installed` and `evolution` are declared in `LifecycleContext` and unseen here |
| `goal_id` | 54/54 | joins the attempt to its internal sub-goal and to `llm_calls` |
| `tool_name` | 43/54 | **absent on 11 of 23 rejections** — `recordAttemptOutcome` case `failed` passes no `toolName` (`capability-lifecycle.ts:141`). On `adopt` it is `result.registeredAs ?? ctx.toolName ?? record.tools[0]?.name`, and `registeredAs` can differ from the declared name (ADR-002) |
| `reason` | 27/54 | every `rejected` and every `already_present`. **Never on `generated` or `adopted`** — those carry no reason at all |
| `failure_analysis` | 10/54 | `rejected` only, and only via `recordRejection`. Shape: `{category, rootCauses[]}` |

A real `failure_analysis`:

```json
{
  "category": "internal",
  "rootCauses": ["The repair attempt on 'search' resulted in output that contains no URL, returning 'No results found' instead of web search results with links, indicating the search did not perform a real web search."]
}
```

## What the timings say about which transition a consumer needs

Measured over the pairs in the table (`generated` → terminal, same capability,
within five minutes):

| Ended as | n | mean | max |
|---|---:|---:|---:|
| `adopted` | 5 | **0.5 s** | 1.0 s |
| `rejected` | 12 | 17.4 s | 34.1 s |
| `already_present` | 5 | 42.0 s | **209.1 s** |

Success is instantaneous and needs no live signal at all. **The silence a user
experiences is the failure paths** — and the longest of them ends in
`already_present`, which is not a failure: three and a half minutes to conclude
the registry already held the thing.

## Two facts that contradict the obvious UI

**A generated tool is not used in the goal that produced it.** For every adopted
capability, `capability_attempts.goal_id = tool_calls.goal_id` is false, without
exception. Adoption happens in an internal sub-goal; use happens elsewhere.

**Most adopted tools are never called.** Of the five, `extract` has 35 calls and
`extract_link_targets` has 1. `print_hello`, `run_python_script` and
`write_repl_content` have none.

## Where a publish would go, and the one problem with it

The minimum that makes the path observable is **one `EVENTS` entry published at
the two existing write sites** — no new transitions, no lifecycle change, no
second vocabulary. The payload already exists: it is the object being handed to
`saveCapabilityAttempt`.

`observability/execution-event-stream.ts:23` states this is how an event is
added: *"A new event is a new EVENTS entry plus a publish at its owner — this
file is not edited."* The stream holds no table of event names, so it carries a
new one with no edit anywhere else.

**The problem is `recordRejection`.** It awaits an LLM review before it writes.
Publishing from the write site would mean the rejection reaches a consumer
*after* that review — tens of seconds late, on the exact path where the user is
already waiting with no signal. Publishing before the review means the event
carries no `failureAnalysis`.

That is a real decision, not a detail, and it is the only one this document
cannot settle from the record:

- publish at the write site — one publish point, consistent payload, late on
  the slowest path; or
- publish the transition when it is decided and let `failureAnalysis` arrive
  with the stored row — timely, but the live event and the stored row are no
  longer the same object.

Everything else needed to decide is above.
