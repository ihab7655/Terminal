import {aura} from './art/core.js';
import {bar, ring, RING_COLS, RING_ROWS, spinnerFrame} from './art/gauges.js';
import {makeGrid, put, putOpaque, render, type Cell} from './cells.js';
import type {Check, EngineFacts} from './engine.js';
import {colour} from './style.js';
import {fit, wrap} from './text.js';

// ── The second screen: the engine waking ─────────────────────────────────────
//
// A state of the same loop, exactly as the opening is. There is no handover
// and no third buffer: `show()` builds a different list of rows while the
// engine is still answering, and paint() cannot tell the difference.
//
// IT DRAWS WHAT WAS FOUND, AND NOTHING ELSE. A check that has not run carries
// no time, no detail and no mark that suggests otherwise; the one in flight is
// the only thing on screen that moves. That is the same defect the engine
// caught in its own CLI view — it printed "repairing a capability" while
// nothing was being repaired — and a boot screen is exactly where it would
// come back, because a boot screen is mostly waiting.
//
// A failure is never truncated. It is the one thing here a person has to be
// able to read in full, so it leaves the detail column and wraps under its own
// check for as many rows as it needs.
//
// Quiet, deliberately. The dragon, the scatter and the wipe belong to the eight
// seconds before this. This one reports, and a report that shouts is harder to
// read.
//
// It composites onto a grid for the reason the opening does: the grain sits
// behind the readout, and layering two styled strings means guessing where the
// escape sequences fall.

const MARK = 1;
const GAP = 2;
const NAME = 14;
const TIME = 9;
const MIN_DETAIL = 10;
// A failure's message hangs under the NAME, not under the detail column. The
// detail column is what is left after the elapsed time is reserved, and at a
// narrow window that was nine columns — an error torn into nine-character
// slivers. Under the name it gets the block's whole width, and it reads as
// belonging to the check above it rather than to the column beside it.
const FAIL_INDENT = MARK + GAP;
// Wide enough for the longest label and a real sentence beside it, and no
// wider: a readout stretched across 200 columns is a row the eye has to walk.
const MAX_BLOCK = 58;
const MAX_BAR = 26;
// The dial and the bar say the same thing, so a screen never carries both. The
// reference sheet pairs them because they read different quantities there; here
// there is one quantity — how much of the boot is done — and drawing it twice
// is the clutter, not the instrument.
const DIAL_GAP = 3;
const BAND = [colour.cyanSoft, colour.cyan, colour.ink] as const;

const TITLE = [...'DRAGON'].join(' ');

/** Milliseconds as something read at a glance. No space before the unit — the
 *  grain shows through a gap in a string, and a number is not worth a mask. */
const elapsed = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`);

function markOf(check: Check, tick: number): {ch: string; tone: string; bold: boolean} {
  switch (check.state) {
    case 'ok':
      return {ch: '◆', tone: colour.cyan, bold: false};
    case 'failed':
      return {ch: '✕', tone: colour.red, bold: true};
    case 'running':
      return {ch: spinnerFrame(tick), tone: colour.ink, bold: false};
    default:
      return {ch: '·', tone: colour.dim, bold: false};
  }
}

/** The columns of the readout at this width, and which of them there is room
 *  for. Time outranks detail: a measurement is why this screen exists. */
function columnsFor(width: number) {
  const blockWidth = Math.max(12, Math.min(MAX_BLOCK, width - 4));
  const nameWidth = Math.min(NAME, Math.max(1, blockWidth - MARK - GAP));
  const head = MARK + GAP + nameWidth;
  const showTime = blockWidth >= head + TIME;
  const showDetail = blockWidth >= head + MIN_DETAIL + 1 + TIME;
  return {
    blockWidth,
    nameWidth,
    head,
    showTime,
    showDetail,
    detailWidth: showDetail ? blockWidth - head - TIME - 1 : 0
  };
}

type Columns = ReturnType<typeof columnsFor>;

type Row =
  | {kind: 'blank'}
  | {kind: 'title'}
  | {kind: 'gauge'}
  | {kind: 'compact'}
  | {kind: 'check'; check: Check}
  | {kind: 'failure'; text: string};

/** One row per check, and as many more as a failure needs to be readable. */
function readout(facts: EngineFacts, columns: Columns): Row[] {
  const rows: Row[] = [];
  for (const check of facts.checks) {
    rows.push({kind: 'check', check});
    if (check.state !== 'failed' || check.detail === '') continue;
    for (const line of wrap(check.detail, Math.max(1, columns.blockWidth - FAIL_INDENT))) {
      rows.push({kind: 'failure', text: line});
    }
  }
  return rows;
}

// Passed, not settled. A failure settles too, so counting settled checks put
// "5 / 5" on the dial in the same picture as "the engine did not wake" — true
// by its own definition and read by a person as success. What both instruments
// measure is how much of the engine actually came up.
const passedCount = (facts: EngineFacts) => facts.checks.filter(c => c.state === 'ok').length;

function statusLine(facts: EngineFacts): {text: string; tone: string} {
  if (facts.checks.some(c => c.state === 'failed')) {
    return {text: 'the engine did not wake', tone: colour.red};
  }
  if (facts.checks.length > 0 && facts.checks.every(c => c.state === 'ok')) {
    return {text: 'the engine is awake', tone: colour.cyan};
  }
  return {text: 'waking the engine', tone: colour.muted};
}

/**
 * Exactly `rows` rows, none wider than `columns`.
 *
 * The arrangements are the opening's: the richest one that fits is chosen
 * outright, and the small one is a whole screen at its own size rather than
 * the big one with pieces cut off. Nothing is truncated to make a plan fit —
 * a plan that does not fit is simply not the plan.
 */
export function bootingRows(
  facts: EngineFacts,
  tick: number,
  columns: number,
  rows: number
): string[] {
  const width = Math.max(20, columns);
  const grid: Cell[][] = makeGrid(width, rows);
  const cols = columnsFor(width);
  const checks = readout(facts, cols);

  // A window too short for the whole readout still has room for the only part
  // of it that has to be read. Dropping to the gauge would have reported "3/5"
  // and said nothing about the check that refused — the screen would be
  // withholding the one fact it exists to deliver.
  const broken = facts.checks.find(c => c.state === 'failed');
  const failure = broken ? readout({...facts, checks: [broken]}, cols) : [];

  const plans: Row[][] = [
    [{kind: 'title'}, {kind: 'blank'}, {kind: 'gauge'}, {kind: 'blank'}, ...checks],
    [{kind: 'gauge'}, {kind: 'blank'}, ...checks],
    [...checks],
    ...(failure.length > 0 ? [failure] : []),
    [{kind: 'compact'}]
  ];
  const fits = (plan: Row[]) =>
    plan.length <= rows &&
    (!plan.some(r => r.kind === 'title') || cols.blockWidth >= TITLE.length + 4);
  const plan = plans.find(fits) ?? plans[plans.length - 1]!;

  // Wide enough for the dial, and the dial replaces the bar rather than joining
  // it. The readout loses its gauge row and gains an instrument beside it.
  const withTitle = plan.some(r => r.kind === 'title');
  const dial =
    withTitle &&
    width >= RING_COLS + DIAL_GAP + cols.blockWidth + 4 &&
    rows >= RING_ROWS + 2 &&
    plan.filter(r => r.kind !== 'gauge' && r.kind !== 'title').length <= rows;
  // With a dial there is no title row either. The dial carries the count and
  // the line under it carries the state — the two places the reference sheet
  // puts them — and a heading above a list beside an instrument was a third
  // thing floating with nothing under it. The screen has an identity by then:
  // the name was the last thing the opening drew.
  const shown = dial ? plan.filter(r => r.kind !== 'gauge' && r.kind !== 'title') : plan;

  const groupWidth = dial ? RING_COLS + DIAL_GAP + cols.blockWidth : cols.blockWidth;
  const groupHeight = dial ? Math.max(RING_ROWS + 1, shown.length) : shown.length;
  const groupLeft = Math.max(0, Math.floor((width - groupWidth) / 2));
  const top = Math.max(0, Math.floor((rows - groupHeight) / 2));
  const left = dial ? groupLeft + RING_COLS + DIAL_GAP : groupLeft;
  const planTop = top + Math.max(0, Math.floor((groupHeight - shown.length) / 2));

  // The grain keeps out of every ROW the readout occupies, not merely out of
  // its rectangle. Clearing the rectangle alone was drawn and looked at, and it
  // put dust on both ends of the line a person is reading — a check with a
  // speck floating past its elapsed time. A row that carries a reading carries
  // nothing else, and the field gathers above and below it instead.
  const running = facts.checks.some(c => c.state === 'running');
  for (const mark of aura(width, rows, tick, running ? 0.4 : 0.22)) {
    const inside = mark.row >= top - 1 && mark.row < top + groupHeight + 1;
    if (inside) continue;
    grid[mark.row]![mark.column] = {
      ch: mark.ch,
      colour: mark.bright ? colour.cyanSoft : colour.dim,
      bold: false
    };
  }

  const status = statusLine(facts);
  const settled = passedCount(facts);
  const total = facts.checks.length;

  if (dial) {
    const stalled = facts.checks.some(c => c.state === 'failed');
    const face = ring(total === 0 ? 0 : (settled / total) * 100);
    const dialTop = top + Math.max(0, Math.floor((groupHeight - RING_ROWS - 1) / 2));
    const layers = [
      [face.track, colour.dim, false],
      [face.value, stalled ? colour.red : colour.cyan, false],
      [face.head, stalled ? colour.red : colour.ink, true],
      [face.collar, colour.cyanSoft, false]
    ] as const;
    // Collar last and value over track: a lit tick must never be painted out by
    // the unlit one that shares its cell.
    for (const [layer, tone, bold] of layers) {
      layer.forEach((line, i) => {
        if (layer === face.collar) put(grid, dialTop + i, groupLeft, line, tone, bold);
        else put(grid, dialTop + i, groupLeft, line, tone, bold);
      });
    }
    // The reading sits IN the face, on cleared cells — ticks behind a number
    // speckle it into something that has to be deciphered rather than read.
    const reading = [`${settled} / ${total}`, 'PASSED'];
    const first = dialTop + Math.floor((RING_ROWS - reading.length) / 2);
    reading.forEach((entry, i) => {
      const text = ` ${entry} `;
      const x = groupLeft + Math.floor((RING_COLS - text.length) / 2);
      putOpaque(grid, first + i, x, text, i === 0 ? colour.ink : colour.muted, i === 0);
    });

    const said = fit(status.text, RING_COLS);
    put(grid, dialTop + RING_ROWS, groupLeft + Math.floor((RING_COLS - said.length) / 2), said, status.tone);
  }

  shown.forEach((row, index) => {
    const y = planTop + index;
    if (y >= rows) return;

    if (row.kind === 'title') {
      put(grid, y, left, TITLE, colour.cyanSoft, true);
      const from = left + TITLE.length + 3;
      if (from + 1 < left + cols.blockWidth) {
        put(grid, y, from, '·', colour.dim);
        put(grid, y, from + 2, fit(status.text, cols.blockWidth - (from + 2 - left)), status.tone);
      }
      return;
    }

    if (row.kind === 'gauge' || row.kind === 'compact') {
      const count = Math.max(6, Math.min(MAX_BAR, cols.blockWidth - 10));
      // A stalled boot must not read as a finished one. Every check settles,
      // failure included, so the gauge fills either way — drawn in cyan it
      // said "5 / 5" in the same breath as "the engine did not wake". The
      // count is the truth; the colour is what stops it being misread.
      const stalled = facts.checks.some(c => c.state === 'failed');
      let x = left;
      for (const piece of bar(total === 0 ? 0 : settled / total, count)) {
        const tone =
          piece.part === 'cap' || piece.part === 'rest'
            ? colour.dim
            : stalled
              ? colour.red
              : piece.part === 'head'
                ? colour.ink
                : BAND[piece.band] ?? colour.cyan;
        put(grid, y, x, piece.text, tone, piece.part === 'head');
        x += piece.text.length;
      }
      x += 2;
      put(grid, y, x, `${settled} / ${total}`, colour.muted);
      x += `${settled} / ${total}`.length + 2;
      // The compact plan is the only one with no room to name what is in
      // flight, so the gauge says it instead of the screen saying nothing.
      if (row.kind === 'compact') {
        const now =
          facts.checks.find(c => c.state === 'running') ??
          [...facts.checks].reverse().find(c => c.state !== 'waiting');
        // Whole or not at all. A label cut to "…" is a column of noise where a
        // reader expects a word, and the gauge beside it already said as much.
        if (now && now.label.length <= left + cols.blockWidth - x) {
          put(grid, y, x, now.label, colour.cyanSoft);
        }
      }
      return;
    }

    if (row.kind === 'failure') {
      put(grid, y, left + FAIL_INDENT, row.text, colour.red);
      return;
    }

    if (row.kind === 'check') {
      const {check} = row;
      const mark = markOf(check, tick);
      put(grid, y, left, mark.ch, mark.tone, mark.bold);

      const naming = check.state === 'waiting' ? colour.dim : colour.ink;
      put(grid, y, left + MARK + GAP, fit(check.label, cols.nameWidth), naming);

      // A failure's message is its own rows below; the detail column would cut
      // it, and half an error message is worse than none.
      if (cols.showDetail && check.state !== 'failed' && check.detail !== '') {
        put(grid, y, left + cols.head, fit(check.detail, cols.detailWidth), colour.cyanSoft);
      }
      if (cols.showTime && (check.state === 'ok' || check.state === 'failed')) {
        const text = elapsed(check.elapsedMs);
        put(grid, y, left + cols.blockWidth - text.length, text, colour.muted);
      }
    }
  });

  return grid.map(render);
}
