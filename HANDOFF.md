# Where this is, and what was decided

## The console

Owns the screen. **Five** rules in `ARCHITECTURE.md`. Rule 3 — scroll, never
shed — is the one the project before this broke. Rule 5 — the content decides
the layout — is the one this project broke, and it is why the last two days
were thrown away. Read both before adding anything.

`npm run dev` to use it, `npm test` for the four checks, `.preview/use-it.sh`
to drive it in a pty and `.preview/verdict.mjs` to judge the recording.

Working: the opening (dragon, sky, greeting, name), the scrollable console,
resize, `fitStyled`, the cell compositor in `cells.ts`. Nothing is dead: every
file under `src/` has a live consumer.

## What was deleted, and why it matters more than what was built

A second screen — ENGINE DIAGNOSTICS — was built, wired to the real engine,
rebuilt on a reference sheet, and deleted. So was the Tech HUD as a design
language. Six files went with them: `diagnostics.ts`, `telemetry.ts`,
`art/gauges.ts`, `art/core.ts`, `art/emblemFrames.ts`, `engine.ts`. They are in
git at `ddc0344` if any of it is ever wanted literally.

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

**Still not connected here** — the console does not import it, boot it or read
it, and that stays true until the console is built. What changed is what it
would connect *to*.

Work on the engine itself, 2026-08-24/25, all on `origin/master`:

  * **all 26 live events now have exported payload contracts** (`7e2aff9`).
    A consumer imports `KnownExecutionEvent` and `asKnown` from `engine-core`,
    switches on `eventType`, and reads `payload` typed — no cast. Before this,
    one of 26 had a contract a consumer could import.
  * **two events that did not exist** (`ada99ba`): `need.transition` announces
    every move through the nine-state Need machine, and `capability.attempt`
    narrates what happens inside ACQUIRING — measured at up to 209 seconds of
    silence before this.
  * the investigation behind both lives in the engine repo now, under
    `docs/lld/` and `docs/lld/discovery/` — moved there by `724be32` because
    `WORKING-METHOD.md` §3 requires it, and the copies that were here are gone.

So when the console is wired, the question "what does the engine publish, and
what shape is it?" is answered by one import rather than by reading the engine.

Measured while it was connected, so it does not have to be re-measured:

  * boots from the terminal in ~1.3s with no LLM call
  * reports 11 tools and 6 categories — the old frozen telemetry said 21
  * **the store refuses** as of 2026-08-24: `the store reported that it is not
    ready`. Something outside this project changed.
  * it prints to stdout, and anything that captures those streams must not
    capture the console's own frames with them — that happened, and three boot
    frames out of forty-one reached the screen. If the engine is ever wired in,
    `screen.ts` has to hold its own `process.stdout.write`, taken at load.
  * the store refuses because `.env` was not being found under
    `npm --workspaces` — fixed in the engine (`770d000`), not here.

## The direction

Not "how do we make it look like a spaceship" but **"how do we make using the
engine feel extraordinary"**. The identity comes from typography, spacing,
hierarchy, colour, how events arrive, live execution, how detail folds and
unfolds, small transitions — and ASCII/Unicode where it earns its place. Not
from turning every message into a panel.

That is not a plain CLI. It is a console with a strong character built on
content and flow rather than on decoration that needs arithmetic.

## Open

  1. Build the console renderer and the real console. Look at actual use before
     deciding it needs a visual identity; if it does, add it on top of a
     correct system rather than drawing a spaceship and wedging the engine in.
  2. `╲` `╱` was a font question and is now moot — nothing needs a cut corner.

## Not ours

  * The engine is unchanged and stays unchanged. No new package: each UI writes
    its own adapter. That was settled after an audit — `ExecutionView` mixes
    engine truth with English phrasing, and the truth half is what an adapter
    must re-encode (a failed `tool.called` is a failure; `waveIndex` is
    zero-based; `capability.evolution/needed` is a conclusion, not work;
    `completion.finished` alone carries the ending; one ask is walked via
    `originGoalId`/`parentGoalId`).
  * DeepSeek is out of scope. No credit, and it is a runtime concern.
  * A progress bar for a tool would be invention: the engine publishes
    `tool.called` after the call and gives no progress. An indeterminate
    activity mark is honest.
