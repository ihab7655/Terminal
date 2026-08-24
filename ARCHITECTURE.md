# The console owns the screen

Read this before changing anything under `src/`. It is short, and every line of
it was paid for.

---

## The decision

**This program takes the alternate screen and paints it. It does not print into
the terminal's scrollback.**

That is the same choice Claude Code makes, and it was verified rather than
assumed — its own binary, driven as a user in a real pty on 2026-08-23:

```
ESC[?1049h ESC[2J ESC[H          takes the alternate screen at startup
ESC[?1000h 1002h 1003h 1006h     mouse tracking
ESC[?1049l                       gives it back on exit
```

and every frame it paints is:

```
ESC[?2026h  ESC[H  … ESC[<col>G …  … ESC[<n>B …  ESC[J  ESC[?2026l
```

Synchronized output, home the cursor, place text by **absolute column**, move
down by **jumping rows**, and erase to the end of the display **once, at the
end**. There is no `cursor-up` in it and no `erase-line`. On a resize it writes
`ESC[2J` and repaints the whole frame — measured, once per resize.

## Why not the other way

The other way — history printed into the terminal's own scrollback, a small
live region redrawn beneath it — was built and measured, and it fails on
resize. The reason is not a bug in the app:

> A live region is erased by counting the lines it wrote. The terminal shows
> **rows**. When the window narrows, a line longer than the new width becomes
> two rows, the erase reaches one of them, and the other stays on screen.

Proved on a virtual screen: at 100 columns a 96-character line is one row; at
60 it is two; erasing "one line" leaves one row behind, **every resize**. Six
zoom steps left six stale rules across the window.

Claude Code does not use that model. Its 327MB binary contains four uses of
`eraseLines`, all inside a bundled `inquirer`, none in its own renderer.

## The four rules

**1 — Own the screen, and give it back.** Take the alternate buffer at startup,
leave it on exit and on a signal. The user's scrollback is theirs and comes
back untouched.

**2 — Paint whole frames, never patch.** Home, draw, erase to end of display,
wrapped in synchronized output. Never walk backwards over the previous frame.

**3 — Owning the screen means you scroll. It never means you shed.**
This is the rule the previous attempt broke, and it is why it felt wrong. When
content is taller than the window, the answer is a **scroll offset** — the same
answer Claude Code gives (`scroll:lineUp`, `scroll:halfPageDown`,
`scroll:top`, `scroll:bottom`, `scrollOffset`).

The answer is never to drop the oldest content, count rows against a budget,
or shed parts of the layout to make them fit. The previous attempt had
`fitToRows`, `maxRows` and "N earlier entries above" — that is content thrown
away, not content scrolled past. **None of those may come back under any name.**

**4 — A resize is a repaint, not an adjustment.** Clear and draw the whole
frame at the new size. Never try to reconcile what is already on screen with a
new width.

**5 — The content decides the layout, never the layout the content.**
Say what to show. The renderer measures the space, wraps the text, orders the
rows and repaints. Do not say where to put it.

This is the rule the HUD broke, and it broke it a piece at a time: a bar of a
fixed width, a dial of a fixed size, a block centred on a computed left edge, a
section dropped when the window came up short. Each of those is an arithmetic
that has to be re-derived at every size, and the sizes are unbounded — so a
screen built that way does not survive a resize, it survives the resizes
someone thought of. Two days went into the shape of a circle and none into what
the circle was for.

Rules 3 and 4 are only affordable underneath this one. Scrolling instead of
shedding works because rows are produced from content at the current width;
a resize is a repaint rather than an adjustment for exactly the same reason.
Fixed geometry takes both back, because fixed geometry is the thing that then
has to be reconciled.

Ornament is not banned — `cells.ts` and the opening are ornament, and they earn
it by being ONE drawing that is centred and otherwise left alone. What is
banned is ornament that other content has to be positioned around.

## What this costs, stated plainly

Owning the screen means the terminal's own scrolling, selection, search and
copy do not reach this program. Whatever of those is wanted has to exist here.
That is the price of rule 1, it is the price Claude Code pays, and it is not
something to be surprised by later.
