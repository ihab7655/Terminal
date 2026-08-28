# Engine follow-ups found while building the console

Found from the console, **owned by the engine**, and deliberately not acted on
here. `HANDOFF.md`'s "Not ours" draws the line: a real defect found from here is
fixed *in the engine*, but the decision to open engine work is its own, and this
project's scope is the console.

Each entry is a FACT with the evidence that established it. None is a proposal.

---

## 1 · A host denial is recorded as a tool failure

**What is true.** When this console's middleware returns `{allow: false}` from
`beforeToolCall`, the engine builds a `ToolResult` with `success: false` and an
error of `[ERROR] Blocked: <reason>` (`workers/tool-caller.ts:203-209`), and the
call is then recorded like any other. `ToolCallRecord`
(`core/interfaces/istorage.ts:196`) carries `success`, `exitCode`,
`stderrSummary` and `error` — **and no field that separates "the host refused
it" from "it broke"**.

**What follows, measured.** On 2026-08-28, running with `fs:write: forbidden`,
**7 of 9 `write_file` calls in two hours failed** — every one of them a refusal
by this console's own policy. The engine's capability health then concluded that
`write_file`, `bash`, `edit_file`, `read_file` and `run_artifact` were
unreliable, and published `capability.evolution/needed` for each. That
conclusion is correct on the evidence the engine has.

**So:** a host that uses approval or forbid policies teaches the engine that its
own tools are unreliable, in proportion to how much it refuses. Nothing in the
engine is wrong on its own terms; the information needed to tell the two apart
is not in the record.

**What the console does about it.** Nothing that hides it. The conclusion is the
engine's and is reported as the engine's, and the console only says what KIND of
statement it is — a standing judgement from a capability's record, not something
that happened in the current goal (`adapter.ts`, `capability.evolution`).

**Not evaluated here:** whether the engine should distinguish them, where such a
field would live, or what reads it. That is an engine question with its own
blast radius.

---

## 2 · `awaiting_clarification` is a status nothing produces

**What is true.** 9 goals carry it, none newer than 2026-08-25 — the day before
the clarification path was deleted (`3a9a6bf`). It remains a legal value in the
`goals` table.

**Console impact:** none. Recorded because a status that cannot be produced is a
thing a future reader will try to handle.

---

## 3 · A single-wave plan cannot be stopped once it starts

**What is true, and already documented by the engine.** A wave is one
`await spawnAll(...)`, so a cancellation raised at wave level is not observed
until every worker in that wave has finished. `cancel.ts` in this console
records the same fact and behaves accordingly: Esc says *stopping*, and only
`completion.finished` says *stopped*.

**Console impact:** a person pressing Esc on a single-wave plan waits, with the
console honestly saying it is stopping rather than claiming it stopped. This is
the limit most likely to be felt as "the console is broken" when it is not.
