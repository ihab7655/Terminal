import React, {useEffect} from 'react';
import {Box, Text} from 'ink';
import {useTicker} from '../animation/useTicker.js';
import {systems, toolMatrix, verdict, vitals} from '../data/engineTelemetry.js';
import {frame} from '../layout/frame.js';
import {styleRow} from '../utils/styleRow.js';
import {palette} from '../theme/palette.js';
import {clamp} from '../utils/clamp.js';
import type {TerminalSize} from '../utils/useTerminalSize.js';
import {createCanvas, paint, paintLines, paintOpaque} from './canvas.js';
import {aura} from './core.js';
import {EMBLEM_COLS, EMBLEM_ROWS, emblemFrames} from './emblemFrames.js';
import {
  RING_COLS,
  RING_ROWS,
  graduation,
  ring,
  ringCentre,
  ringTrack,
  segments
} from './gauges.js';

type Props = {
  size: TerminalSize;
  onComplete: () => void;
};

const TICK_MS = 60;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SEGMENT_COUNT = 24;

// The engine wakes, looks at itself, and opens. Beats overlap so the screen is
// never waiting on the one before it.
const RAIL_TICKS = 10;
const CORE_FROM = 2;
const SYSTEM_FROM = 16;
const SYSTEM_EVERY = 6;
const SYSTEM_SWEEP = 10;
const VITALS_FROM = 48;
const VITALS_SWEEP = 24;
const MATRIX_FROM = 62;
const MATRIX_EVERY = 4;
const MATRIX_SWEEP = 12;
const VERDICT_FROM = 92;
const HANDOFF_FROM = 100;
const HANDOFF_TICKS = 20;
export const DIAGNOSTICS_TICKS = HANDOFF_FROM + HANDOFF_TICKS + 4;

const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const progress = (tick: number, from: number, span: number) => easeOut((tick - from) / span);
const centred = (text: string, span: number) =>
  ' '.repeat(Math.max(0, Math.floor((span - text.length) / 2))) + text;

export function EngineDiagnostics({size, onComplete}: Props) {
  const tick = useTicker(TICK_MS, DIAGNOSTICS_TICKS);
  // The shape comes from the shared frame, which is what makes the handoff
  // invisible: Ink erases the previous frame by its line count, so a screen
  // that hands over to another of a different size leaves a row unerased and
  // the terminal tears. This used to be the same arithmetic copied by hand.
  const {boxWidth, boxHeight, width, height} = frame(size);

  useEffect(() => {
    if (tick >= DIAGNOSTICS_TICKS) onComplete();
  }, [onComplete, tick]);

  const canvas = createCanvas(width, height);
  const coreCols = EMBLEM_COLS + 8;
  const coreLeft = width - coreCols - 2;
  // Half the width in rows, because a cell is twice as tall as it is wide.
  const coreRows = Math.round(coreCols / 2) + 1;
  const coreTop = 3;
  const emblemTop = coreTop + Math.floor((coreRows - EMBLEM_ROWS) / 2);
  const emblemLeft = coreLeft + Math.floor((coreCols - EMBLEM_COLS) / 2);

  // ── frame rail ────────────────────────────────────────────────────────────
  const railFill = Math.round(progress(tick, 0, RAIL_TICKS) * (width - 2));
  paint(canvas, 0, 0, '╭' + '─'.repeat(Math.max(0, railFill)), palette.cyanSoft);
  if (railFill >= width - 2) {
    paint(canvas, 0, width - 1, '╮', palette.cyanSoft);
    paintOpaque(canvas, 0, 3, ' ENGINE DIAGNOSTICS ', palette.ink);
    paintOpaque(canvas, 0, width - 15, ' core online ', palette.amber);
  }

  // ── engine core ───────────────────────────────────────────────────────────
  if (tick >= CORE_FROM) {
    const since = tick - CORE_FROM;
    const energy = clamp(since / 18, 0, 1);
    for (const grain of aura(coreCols, coreRows, tick, energy)) {
      paint(canvas, coreTop + grain.row, coreLeft + grain.column, grain.ch, grain.bright ? palette.cyanSoft : palette.dim);
    }

    // The emblem spins up hard, then holds a slow turn as the panels arrive.
    const spin = Math.floor(since * (since < 24 ? 0.85 : 0.2));
    const frame = emblemFrames[spin % emblemFrames.length]!;
    const shown = Math.round(clamp(since / 10, 0, 1) * EMBLEM_ROWS);
    const shade = since < 12 ? palette.ink : since < 26 ? palette.cyan : palette.cyanSoft;
    paintLines(canvas, emblemTop, emblemLeft, frame.slice(0, shown), shade);
    paint(canvas, coreTop - 1, coreLeft + 2, 'ENGINE CORE', palette.muted);
  }

  // ── systems ───────────────────────────────────────────────────────────────
  if (tick >= SYSTEM_FROM) paint(canvas, 2, 2, 'SYSTEMS', palette.muted);
  for (const [index, system] of systems.entries()) {
    const from = SYSTEM_FROM + index * SYSTEM_EVERY;
    if (tick < from) continue;
    const row = 4 + index;
    const done = progress(tick, from, SYSTEM_SWEEP);
    const busy = done < 1;
    const bar = segments(done * system.level, 16);

    paint(canvas, row, 2, busy ? SPINNER[tick % SPINNER.length]! : '◈', busy ? palette.amber : palette.cyan);
    paint(canvas, row, 4, system.label, busy ? palette.muted : palette.ink, !busy);
    paint(canvas, row, 16, bar.lit, palette.cyan);
    paint(canvas, row, 16 + bar.lit.length, bar.head, palette.ink);
    paint(canvas, row, 16 + bar.lit.length + bar.head.length, bar.rest, palette.dim);
    if (!busy) paint(canvas, row, 34, `${system.elapsedMs}ms`.padStart(5), palette.dim);
  }

  // ── vitals ────────────────────────────────────────────────────────────────
  if (tick >= VITALS_FROM) {
    paint(canvas, 10, 2, 'VITALS', palette.muted);
    for (const [index, vital] of vitals.entries()) {
      const left = 2 + index * (RING_COLS + 2);
      const done = progress(tick, VITALS_FROM + index * 3, VITALS_SWEEP);
      const shown = vital.percent * done;
      const {value, head} = ring(shown);
      paintLines(canvas, 11, left, ringTrack, palette.dim, false, true);
      paintLines(canvas, 11, left, value, palette.cyan);
      paintLines(canvas, 11, left, head, palette.ink);
      paintLines(
        canvas,
        11,
        left,
        ringCentre(new Array<string>(RING_ROWS).fill(''), `${shown.toFixed(1)}%`),
        palette.ink,
        true
      );
      paint(canvas, 11 + RING_ROWS, left, centred(vital.label, RING_COLS), palette.amber);
      paint(canvas, 12 + RING_ROWS, left, centred(vital.caption, RING_COLS), palette.dim);
    }
  }

  // ── tool matrix ───────────────────────────────────────────────────────────
  if (tick >= MATRIX_FROM) {
    paint(canvas, 22, 2, 'TOOL MATRIX', palette.muted);
    paint(canvas, 22, 18, graduation(SEGMENT_COUNT), palette.dim, false, true);
  }
  for (const [index, tool] of toolMatrix.entries()) {
    const from = MATRIX_FROM + index * MATRIX_EVERY;
    if (tick < from) continue;
    const row = 24 + index;
    const done = progress(tick, from, MATRIX_SWEEP);
    const shown = tool.success * done;
    const bar = segments(shown / 100, SEGMENT_COUNT);
    // Under half succeeding is the thing this screen exists to surface.
    const tone = tool.success < 50 ? palette.red : tool.success < 80 ? palette.amber : palette.cyan;

    paint(canvas, row, 2, tool.name, palette.cyanSoft);
    paint(canvas, row, 18, bar.lit, tone);
    paint(canvas, row, 18 + bar.lit.length, bar.head, palette.ink);
    paint(canvas, row, 18 + bar.lit.length + bar.head.length, bar.rest, palette.dim, false, true);
    paint(canvas, row, 44, `${Math.round(shown)}`.padStart(3), tone);
  }

  // ── verdict and handoff ───────────────────────────────────────────────────
  if (tick >= VERDICT_FROM) {
    paint(canvas, height - 3, 2, '◆', palette.amber);
    paint(canvas, height - 3, 4, verdict, palette.amberDim);
  }

  paint(canvas, height - 1, 0, '╰' + '─'.repeat(width - 2) + '╯', palette.dim);
  if (tick >= HANDOFF_FROM) {
    const handoff = Math.round(progress(tick, HANDOFF_FROM, HANDOFF_TICKS) * (width - 2));
    paint(canvas, height - 1, 1, '━'.repeat(Math.max(0, handoff)), palette.cyan);
    paint(canvas, height - 2, 2, 'entering console', palette.muted);
  }

  return (
    <Box flexDirection="column" width={boxWidth} height={boxHeight} paddingX={1}>
      {canvas.map((cells, index) => (
        <Text key={index}>{styleRow(cells)}</Text>
      ))}
    </Box>
  );
}
