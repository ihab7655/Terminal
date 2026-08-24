# Where this is, and what was decided

## The console

Owns the screen. Four rules in `ARCHITECTURE.md`; the third — **scroll, never
shed** — is the one the previous project broke and the one every layout choice
still answers to. 77 tests. `npm run dev` to use it, `.preview/use-it.sh` to
drive it in a pty and `.preview/verdict.mjs` to judge the recording.

Working: the opening (dragon, sky, greeting, name), the scrollable console,
resize, `fitStyled`, the cell compositor in `cells.ts`.

## The engine

`src/engine.ts` — and now `src/booting.ts` draws it. Five real checks with real
elapsed times: CONFIG, ENGINE, STORAGE, TOOLS, EVENT STREAM.

Measured, not assumed:

  * the engine boots from the terminal in ~1.3s with no LLM call
  * it reports 11 tools and 6 categories
  * **the store now refuses** — `the store reported that it is not ready`,
    every run on 2026-08-24. It was ready when this file was first written, so
    something outside this project changed. The screen reports it correctly;
    nothing here is broken by it.
  * the old frozen telemetry said 21 tools — it was already lying
  * the engine prints to stdout; both streams are captured before the import,
    so nothing reaches the screen we own. Proved: nothing leaked.

Loaded by path (`ENGINE_PATH`), not as a dependency. The project stays at zero.

## The second screen — built and looked at

`src/booting.ts`. A third state of the same loop, after the opening and before
the console: `show()` picks the rows, there is no handover. It draws what
`bootEngine` has FOUND and nothing else — a check that has not run carries no
time and no claim, and the only things that move are the spinner beside the one
check in flight and the grain behind it.

Settled by drawing it and looking, not by reasoning:

  * the grain keeps out of every ROW the readout occupies, not just its
    rectangle — clearing the rectangle put dust on both ends of a line being
    read
  * a failure hangs under the NAME and wraps, never in the detail column: at a
    narrow window that column was nine characters and tore the error into
    slivers
  * a window too short for the whole readout drops to the FAILURE, not to the
    gauge — "3 / 5" and nothing about the check that refused is the screen
    withholding the one fact it exists for
  * both instruments count what PASSED, not what settled. A failure settles
    too, so the dial read "5 / 5" in the same picture as "the engine did not
    wake"
  * a stalled gauge is red. The count is the truth; the colour is what stops it
    being misread
  * the boot clock stops when a failure settles — grain drifting over a refused
    connection suggests something is still being tried

The engine is asked to wake AFTER the opening. It answers in about a second and
a half, so starting it behind the opening would show a screen with every check
already green — a reported wait nobody had. `startBoot()` moves up to
`takeScreen()` for the other answer; nothing else changes. **That is open
question 2, answered provisionally by which one is worth looking at.**

`.preview/boot.mjs` draws every state at every size. `.preview/see-boot.sh` +
`.preview/frames.mjs` run the real thing in a pty and replay what landed.

## The instruments

Rebuilt on the reference sheet the owner chose — the 76%/89% bar and the 36/67
dial (`.preview/gauges.mjs` shows both alone).

  * **The bar is a gradient, not a fill.** Lit segments run in three graded
    bands with a bright head and cut caps (`▞ … ▚`). A cell can only be one
    colour, so the gradient IS the segments: it is what makes a row of
    identical marks read as a swept instrument.
  * **The dial is ticks, not an arc.** Separate radial strokes on two radii.
    It had to grow to 23×11 — at 17×8 the circumference gave each tick three
    dots and no room for the gap, and it read as a solid ring, which is the one
    thing the sheet's dial is not. The size is what the form costs.
  * Neither knows a colour. They name their parts; the screen decides.
  * **A screen never carries both.** The sheet pairs them because they read
    different quantities; here there is one — how much of the boot is done —
    and drawing it twice is the clutter. Wide enough (88 columns) the dial
    replaces the bar and the title, carrying the count with the state under it.
  * `segments()` is gone, replaced by `bar()`. `meter()` and `graduation()`
    have never had a consumer — left alone, not defended.

## The visual identity — decided, not built

**Tech HUD, and it is the content's display language, not decoration around
it.** Seven primitives, one per content type: Input Bracket, Process Track,
Operation Module, Completion Mark, Alert Module, Data Channel, Indicator.

The rule that makes it compatible with rule 3:

> **No primitive may close on the right.** Everything anchors left. Horizontal
> rules may extend; nothing encloses. An open bracket needs no width
> arithmetic on its right edge and stacks without limit, which is why the
> conversation can scroll through it. A box cannot hold 400 rows.

Loud at boot, quiet in the console: scan lines and glow belong to the eight
second screen, not the one someone sits in for an hour.

Bars: the segmented `▰▱` readout in `art/gauges.ts`, never solid `█`. Lit in
cyan, head in ink, unlit in dim — the colours stop the smear more than the
glyph does.

## Open

  1. `╲` `╱` — still a font question. The bar's caps use `▞` `▚` instead,
     which are block elements and safe, so nothing is blocked on it; the cut
     corner has not entered the language, it has been approximated.
  2. **Answered provisionally**: after the opening. See above.
  3. The seven primitives and their gallery — not started. The owner paused it:
     the design had got dense, and the welcome screens come first.
  4. The boot screen holds on a failure until a key is pressed, then hands the
     console one ENGINE block with each check's finding. What the engine
     PRINTED (`facts.captured`) is still dropped — HANDOFF says that becomes
     console content, and nothing consumes it yet.

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
