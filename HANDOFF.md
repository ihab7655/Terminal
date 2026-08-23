# Where this is, and what was decided

## The console

Owns the screen. Four rules in `ARCHITECTURE.md`; the third — **scroll, never
shed** — is the one the previous project broke and the one every layout choice
still answers to. 77 tests. `npm run dev` to use it, `.preview/use-it.sh` to
drive it in a pty and `.preview/verdict.mjs` to judge the recording.

Working: the opening (dragon, sky, greeting, name), the scrollable console,
resize, `fitStyled`, the cell compositor in `cells.ts`.

## The engine

`src/engine.ts` — written, typechecks, **not drawn by anything yet**. Five real
checks with real elapsed times: CONFIG, ENGINE, STORAGE, TOOLS, EVENT STREAM.

Measured, not assumed:

  * the engine boots from the terminal in ~1.3s with no LLM call
  * it reports 11 tools and 6 categories, and the store is ready
  * the old frozen telemetry said 21 tools — it was already lying
  * the engine prints to stdout; both streams are captured before the import,
    so nothing reaches the screen we own. Proved: nothing leaked.

Loaded by path (`ENGINE_PATH`), not as a dependency. The project stays at zero.

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

  1. `╲` `╱` — a font question, not a taste one. Judge them by eye in the real
     terminal (`python3 ~/التنزيلات/dragon_hud_preview.py` draws them) before
     the cut corner enters the language.
  2. Does the engine boot when the terminal opens, or on the first goal? It
     decides whether diagnostics interrupt you or are asked for.
  3. Build the seven primitives with a gallery showing all of them at once,
     and look at it, before any surface is built on top. Twice today a thing
     was built and only then looked at.

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
