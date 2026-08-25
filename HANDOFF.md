# Where this is, and what was decided

## The console

Owns the screen. **Five** rules in `ARCHITECTURE.md`. Rule 3 — scroll, never
shed — is the one the project before this broke. Rule 5 — the content decides
the layout — is the one this project broke, and it is why the last two days
were thrown away. Read both before adding anything.

`npm run dev` to use it, `DEMO=1 npm run dev` to play a recorded session,
`npm test` for the five suites plus the repaint proof, `.preview/use-it.sh` to
drive it in a pty and `.preview/verdict.mjs` to judge the recording.
`.preview/see-live.sh` and `.preview/see-stop.sh` record real runs against the
real engine; `.preview/frames.mjs` replays a recording frame by frame, which is
how anything here is proved.

Working: the opening (dragon, sky, greeting, name), the scrollable console,
resize, `fitStyled`, the cell compositor in `cells.ts`, the engine connection,
the question bridge and Esc-stops. Nothing is dead: every file under `src/` has
a live consumer.

## What was deleted, and why it matters more than what was built

A second screen — ENGINE DIAGNOSTICS — was built, wired to the real engine,
rebuilt on a reference sheet, and deleted. So was the Tech HUD as a design
language. Six files went with them: `diagnostics.ts`, `telemetry.ts`,
`art/gauges.ts`, `art/core.ts`, `art/emblemFrames.ts`, `engine.ts`. They are in
git at `ddc0344` if any of it is ever wanted literally. (`engine.ts` exists
again and is unrelated to the deleted one: it is the door described below, not
the diagnostics screen's reader.)

The reasons, because they are the only thing worth carrying forward:

  * **It was a barrier in front of a goal nobody had typed yet.** Nine seconds
    of opening, then a screen asking for a keypress before the user reaches the
    thing they opened the terminal for.
  * **No decision rested on its numbers.** "66.9% tool success" at the moment a
    terminal opens changes nothing anyone does next — and they were frozen
    readings from 19 August, one of which (`21 registered`) was already known
    to be false.
  * **The tell was in the work itself.** Two days on the shape of a circle,
    none on what the circle was for. When all of the argument is about how a
    thing looks and none of it is about what it does, it is ornament looking
    for a justification.
  * **It was dragging the project back into fixed geometry** — widths, heights,
    left edges, sections dropped at small sizes — which is the exact thing the
    console renderer exists to escape. That is now rule 5.

Kept from it: nothing in code. Kept as knowledge: braille is wrong for a curve
(2×4 sub-dots scatter a stroke into specks); half blocks double the vertical
resolution and are the only way a circle curves in a terminal; a value drawn on
a static readout must not carry a moving "head", because a head claims an
advance that is not happening.

## The engine

**Connected since `63cc0b4`.** `src/engine.ts` is the one door: it loads the
engine **by path** (`ENGINE_PATH`, defaulting to the local checkout's
`dist/index.js`), so the console keeps zero dependencies and the coupling is
something a reader can see. A failure to open is a **value**, not a throw —
`EngineFailure` carrying a reason and whatever the engine printed on the way.
Not finding an engine is an ordinary state for a console to be in and to report.

Three things the door does that are not obvious, each of them measured:

  * **It says where the engine's configuration lives.** engine-core resolves
    `.env` by walking up from `INIT_CWD` or cwd; run from here that walk starts
    in the console's directory and finds nothing. So the door sets `INIT_CWD` to
    the engine's own root — assigned, not defaulted, because npm already sets it
    to wherever `npm run` was invoked. Before this the engine came up with no
    API key and no database.
  * **It swallows both output streams while importing.** The engine logs through
    pino and dotenvx writes a banner at import; either one lands mid-frame and
    tears it. What they wrote becomes content the console can show rather than
    damage it has to survive. `screen.ts` holding its own
    `process.stdout.write`, taken at load, is what keeps the console's own
    frames out of that capture — without it, three frames out of forty-one
    reached the screen and the boot looked frozen.
  * **It narrows the engine's envelope once.** The engine's own contracts are
    wider than this console reads; narrowing in the door is what keeps
    `adapter.ts` free of engine types.

`ApplicationRuntime` is the host surface: `executeGoal`, `watchExecutions`,
`create({config, middleware})`. Two things are reached through `context`
instead, and both were checked rather than assumed — `executeGoal` was already
one wrong guess on this surface:

  * `answerClarification` lives on **MainBrain** (`context.mainBrain`), which is
    what `engine-rest`'s own controller does. There is no second call: the brain
    resumes and returns the full result.
  * `MiddlewareControlSignal` is exported from `engine-core` and handed to
    `cancel.ts`, because the engine tests a thrown value with `instanceof`.

### The question bridge

`clarification.requested` becomes an `asked` item carrying `goalId` — which is
on the **envelope**, not the payload (ADR-011). The next typed line answers it
instead of starting a goal: an unanswered question outranks a new goal, read
from the items that already exist, with no mode flag anywhere. Proved live.

### Stopping a goal

**The engine cannot cancel itself** and does not pretend to — in its own words,
*"there is no AbortController anywhere"*. What it offers is a way for a **host**
to abort a run as control flow: a middleware hook that throws
`MiddlewareControlSignal`. This console is the host, so cancellation lives in
`src/cancel.ts` — a set of goal ids and two hooks — and the engine learned
nothing new.

Esc stops the last running goal. Ctrl+C still quits. With nothing running, Esc
does nothing at all: no message, no log line, because a key that does nothing
should not answer as though it did. The footer offers `Esc stops` only while
there is something to stop.

Two things here are load-bearing and were both proved, not reasoned:

  * **The console names each goal itself** (`randomUUID` passed as
    `GoalRequest.id`, which the engine honours) rather than learning the id from
    an event. That is what lets Esc work in the window where a stop is worth
    most — while the engine is still planning and nothing is on screen yet.
  * **`beforePlanExecution`, not just `beforeWave`, is what actually stops a
    goal.** On the first live run the planner produced ONE wave, so `beforeWave`
    fires once, before the only wave, and never again. Had this been built on
    `beforeWave` alone — the obvious reading — the first real press of Esc would
    have done nothing.

The ending is the engine's to announce. Esc's own line says *"stopping"*; the
word `stopped` arrives only with `completion.finished` and goes through the
adapter like any other event. The console never announces an ending it has not
been told about.

Work on the engine itself, all on its `origin/master`:

  * **all 26 live events have exported payload contracts** (`7e2aff9`). A
    consumer imports `KnownExecutionEvent` and `asKnown`, switches on
    `eventType`, and reads `payload` typed — no cast. Before this, one of 26 had
    a contract a consumer could import.
  * **two events that did not exist** (`ada99ba`): `need.transition` announces
    every move through the nine-state Need machine, and `capability.attempt`
    narrates what happens inside ACQUIRING — measured at up to 209 seconds of
    silence before this.
  * **a defect this console's normal path exposed** (`5378dc4`): a host that
    stopped a goal resumed through `answerClarification` left the row saying
    `running`, published no ending and ran no `afterGoal` hook. Both entry
    points now end through one boundary. The reading behind it is in the
    engine repo at `docs/lld/host-cancellation-lld.md`.
  * the investigations live in the engine repo under `docs/lld/` and
    `docs/lld/discovery/` — moved there by `724be32` because `WORKING-METHOD.md`
    §3 requires it, and the copies that were here are gone.

Measured, so it does not have to be re-measured:

  * boots from the terminal in ~1.3s with no LLM call
  * reports 11 tools and 6 categories — the old frozen telemetry said 21
  * the store's refusal on 2026-08-24 (`the store reported that it is not
    ready`) was `.env` not being found under `npm --workspaces`. Fixed in the
    engine, not here.
  * a real goal can plan for over a minute before its first wave, and a goal a
    person would call multi-step can still be a **single wave**.

## The direction

Not "how do we make it look like a spaceship" but **"how do we make using the
engine feel extraordinary"**. The identity comes from typography, spacing,
hierarchy, colour, how events arrive, live execution, how detail folds and
unfolds, small transitions — and ASCII/Unicode where it earns its place. Not
from turning every message into a panel.

That is not a plain CLI. It is a console with a strong character built on
content and flow rather than on decoration that needs arithmetic.

## Open

  1. **Input history.** Up/down still scroll the viewport; there is nowhere to
     recall what was typed before.
  2. Look at actual use before deciding this needs a visual identity; if it
     does, add it on top of a correct system rather than drawing a spaceship and
     wedging the engine in.
  3. `╲` `╱` was a font question and is now moot — nothing needs a cut corner.

## Not ours

  * The engine gains nothing for this console's sake. No new package, no shared
    UI layer: each UI writes its own adapter. That is not the same as "never
    touch the engine" — a real defect found from here is fixed **in the engine**
    (`5378dc4` was one, and cancellation itself is a host middleware precisely
    because the engine already had the mechanism). The line is between fixing
    what is broken at its source and teaching the engine about a console.
    The no-shared-layer half was settled after an audit — `ExecutionView` mixes
    engine truth with English phrasing, and the truth half is what an adapter
    must re-encode (a failed `tool.called` is a failure; `waveIndex` is
    zero-based; `capability.evolution/needed` is a conclusion, not work;
    `completion.finished` alone carries the ending; one ask is walked via
    `originGoalId`/`parentGoalId`).
  * DeepSeek is out of scope. No credit, and it is a runtime concern.
  * A progress bar for a tool would be invention: the engine publishes
    `tool.called` after the call and gives no progress. An indeterminate
    activity mark is honest.
