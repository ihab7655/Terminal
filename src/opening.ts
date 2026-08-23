import {blockTextWidth, GLYPH_HEIGHT, renderBlockText} from './art/blockFont.js';
import {dragonCrossArt} from './art/dragonCrossArt.js';
import {skyAt, skyRow} from './art/sky.js';
import {BOLD, RESET, colour} from './style.js';

// ── The opening ──────────────────────────────────────────────────────────────
//
// A state inside the same loop, not a phase and not a second screen. Owning the
// screen is what makes this possible: there is no handover to arrange, because
// nothing is ever handed over — the loop builds a different list of rows while
// `done` is false, and paint() cannot tell the difference. The original had a
// hand-off hack here, ending the fade two ticks early so no empty frame was
// published between two screens. There are no two screens now, so it is gone.
//
// It is a pure function of the tick and the size, and it keeps NO measurement.
// The size is read fresh every frame, so a window resized mid-animation simply
// draws differently on the next tick. Rule 4 costs nothing here.
//
// IT COMPOSITES A GRID OF CELLS rather than assembling styled strings. Four
// things share the same space — sky behind, dragon over it, the greeting and
// the name over both — and layering them as strings means guessing where the
// escapes fall. The grid also makes the width exact by construction.
//
// One offset for the whole drawing, never one per row. The art's internal
// alignment IS the drawing: centring each line by its own length sheared it
// into something a reader rightly called a deformed turtle.

export type Opening = {readonly tick: number; readonly done: boolean};

export const startOpening = (): Opening => ({tick: 0, done: false});
export const skipOpening = (o: Opening): Opening => ({...o, done: true});

// The timeline, in ticks. The sky arrives first, the dragon assembles into it,
// flashes, settles and breathes; the greeting and the name follow.
export const TICK_MS = 70;
const ASSEMBLE_FROM = 18;
const ASSEMBLE_TO = 50;
const FLASH_TO = 60;
const GREETING_FROM = 66;
const NAME_FROM = 72;
const NAME_WIPE = 14;
const TAGLINE_FROM = 90;
const EXIT_FROM = 114;
const EXIT_TICKS = 8;
const END = EXIT_FROM + EXIT_TICKS;

export const advance = (o: Opening): Opening =>
  o.done ? o : {tick: o.tick + 1, done: o.tick + 1 >= END};

const NAME = 'DRAGON';
const GREETING = [...'WELCOME TO'].join(' ');
const TAGLINE = 'the AI operating engine';
const HINT = 'press any key';

const DRAGON_H = dragonCrossArt.length;
const DRAGON_W = Math.max(...dragonCrossArt.map(l => [...l].length));

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function hash(row: number, column: number, salt: number) {
  let value = (row + 1) * 374761393 + (column + 1) * 668265263 + (salt + 1) * 1442695041;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

// Interpolate along a set of (tick, value) stops.
function ramp(tick: number, stops: ReadonlyArray<readonly [number, number]>) {
  const first = stops[0]!;
  if (tick <= first[0]) return first[1];
  for (let i = 1; i < stops.length; i++) {
    const [from, a] = stops[i - 1]!;
    const [to, b] = stops[i]!;
    if (tick <= to) return a + (b - a) * ((tick - from) / (to - from));
  }
  return stops[stops.length - 1]![1];
}

const STAR_STOPS = [[0, 0], [8, 1], [ASSEMBLE_TO, 1], [GREETING_FROM, 0.6], [TAGLINE_FROM, 0.4], [EXIT_FROM, 0.4], [END, 0]] as const;
const FLOW_STOPS = [[0, 1.7], [ASSEMBLE_FROM, 1], [ASSEMBLE_TO, 0.35], [NAME_FROM, 0], [END, 0]] as const;

type Phase = 'assemble' | 'flash' | 'settled';
const phaseAt = (tick: number): Phase =>
  tick < ASSEMBLE_TO ? 'assemble' : tick < FLASH_TO ? 'flash' : 'settled';

const FLASH_COLOURS = [colour.ink, colour.cyan, colour.amber];

function dragonColour(row: number, tick: number, phase: Phase) {
  if (phase === 'flash') return FLASH_COLOURS[row % FLASH_COLOURS.length]!;
  if (phase === 'assemble') return colour.cyanSoft;
  // A slow highlight travels down the body so the settled dragon still breathes.
  const wave = Math.sin(tick / 7 - row / 3);
  if (wave > 0.9) return colour.ink;
  return wave > 0 ? colour.cyan : colour.cyanSoft;
}

const fadeStep = (since: number, r: readonly string[]) =>
  r[Math.min(r.length - 1, Math.max(0, Math.floor(since / 3)))]!;
const GREETING_RAMP = [colour.dim, colour.muted, colour.cyanSoft] as const;
const TAGLINE_RAMP = [colour.dim, colour.amberDim, colour.amber] as const;

type Cell = {ch: string; colour: string; bold: boolean};
type Rect = {top: number; left: number; height: number; width: number};

const QUIET_RADIUS = 2;
const HALO_RADIUS = 11;
const HALO_TICKS = 12;

// Rows are half as tall as they are wide, so vertical distance counts double
// and the calm around the art reads as a circle rather than an ellipse.
function distanceToRect(rect: Rect, row: number, column: number) {
  const dx = Math.max(0, rect.left - column, column - (rect.left + rect.width - 1));
  const dy = Math.max(0, rect.top - row, row - (rect.top + rect.height - 1));
  return Math.sqrt(dx * dx + 4 * dy * dy);
}

// True when NO rect can reach this row: the vertical term alone already puts
// every one at or past the halo edge, so not a single column needs measuring.
function rowBeyondHalo(rects: readonly Rect[], row: number) {
  for (const rect of rects) {
    const dy = Math.max(0, rect.top - row, row - (rect.top + rect.height - 1));
    if (dy * 2 < HALO_RADIUS) return false;
  }
  return true;
}

function quietFalloff(rects: readonly Rect[], row: number, column: number) {
  let nearest = Infinity;
  for (const rect of rects) nearest = Math.min(nearest, distanceToRect(rect, row, column));
  if (nearest <= QUIET_RADIUS) return 0;
  if (nearest >= HALO_RADIUS) return 1;
  const t = (nearest - QUIET_RADIUS) / (HALO_RADIUS - QUIET_RADIUS);
  return t * t * (3 - 2 * t);
}

/** Draw text into the grid. Spaces stay transparent so the sky shows through. */
function put(grid: Cell[][], top: number, left: number, text: string, c: string, bold = false) {
  const line = grid[top];
  if (!line) return;
  [...text].forEach((ch, i) => {
    const column = left + i;
    if (ch === ' ' || column < 0 || column >= line.length) return;
    line[column] = {ch, colour: c, bold};
  });
}

// Braille blank is U+2800, so anything above it is an inked cell. The scatter
// is re-rolled every tick, which is what makes the dragon shimmer as it lands
// rather than wipe on. This is the assembly the console has always had.
function scatter(line: string, row: number, progress: number, tick: number) {
  return [...line]
    .map((cell, column) => {
      if ((cell.codePointAt(0) ?? 0) <= 0x2800) return ' ';
      return hash(row, column, tick) <= progress ? cell : ' ';
    })
    .join('');
}

/** One row of cells as a string, opening a colour only where it changes. */
function render(row: readonly Cell[]): string {
  let out = '';
  let open = '';
  let end = row.length;
  while (end > 0 && row[end - 1]!.ch === ' ') end--;
  for (let x = 0; x < end; x++) {
    const cell = row[x]!;
    const want = cell.ch === ' ' ? '' : (cell.bold ? BOLD : '') + cell.colour;
    if (want !== open) {
      if (open !== '') out += RESET;
      out += want;
      open = want;
    }
    out += cell.ch;
  }
  return open === '' ? out : out + RESET;
}

/**
 * Exactly `rows` rows, none wider than `columns`. The caller paints them as any
 * other frame — the opening has no privileges over the screen.
 *
 * The arrangements below are not a budget and nothing is dropped to fit. They
 * are ways of drawing the same moment, and a size chooses between them the way
 * a paragraph chooses a line break: the small one is not the big one with
 * pieces missing, it is a whole thing at its own size.
 */
export function openingRows(tick: number, columns: number, rows: number): string[] {
  const width = Math.max(20, columns);
  const grid: Cell[][] = Array.from({length: rows}, () =>
    Array.from({length: width}, () => ({ch: ' ', colour: '', bold: false}))
  );

  const phase = phaseAt(tick);
  const blockName = blockTextWidth(NAME) + 2 <= width;
  const nameH = blockName ? GLYPH_HEIGHT : 1;
  const nameW = blockName ? blockTextWidth(NAME) : NAME.length;

  // The richest arrangement that fits, tried in order. The tagline goes first,
  // then the greeting, then the dragon — the name always stays. This is not a
  // budget and nothing is truncated to make room: each line below is a whole
  // drawing at its own size, and one of them is chosen outright.
  type Plan = {dragon: boolean; greeting: boolean; tagline: boolean};
  const height = (p: Plan) =>
    (p.dragon ? DRAGON_H + 1 : 0) + (p.greeting ? 2 : 0) + nameH + (p.tagline ? 3 : 0);
  const wide = (p: Plan) =>
    (!p.dragon || width >= DRAGON_W + 2) &&
    (!p.greeting || width >= GREETING.length + 2) &&
    (!p.tagline || width >= TAGLINE.length + 2);

  const plans: Plan[] = [
    {dragon: true, greeting: true, tagline: true},
    {dragon: true, greeting: true, tagline: false},
    {dragon: true, greeting: false, tagline: false},
    {dragon: false, greeting: true, tagline: true},
    {dragon: false, greeting: true, tagline: false},
    {dragon: false, greeting: false, tagline: false}
  ];
  const plan = plans.find(p => wide(p) && height(p) <= rows) ?? plans[plans.length - 1]!;
  const {dragon, greeting, tagline} = plan;

  const blockH = height(plan);
  const top = Math.max(0, Math.floor((rows - blockH) / 2));
  const centreLeft = (w: number) => Math.max(0, Math.floor((width - w) / 2));

  let cursor = top;
  const artTop = cursor;
  if (dragon) cursor += DRAGON_H + 1;
  const greetTop = cursor;
  if (greeting) cursor += 2;
  const nameTop = cursor;
  cursor += nameH + 1;
  const tagTop = cursor;
  if (tagline) cursor += 2;

  const artLeft = centreLeft(DRAGON_W);
  const greetLeft = centreLeft(GREETING.length);
  const nameLeft = centreLeft(nameW);
  const tagLeft = centreLeft(TAGLINE.length);

  // The sky keeps clear of whatever is drawn, so the art is never speckled.
  const quiet: Rect[] = [];
  if (dragon) quiet.push({top: artTop, left: artLeft, height: DRAGON_H, width: DRAGON_W});
  quiet.push({top: nameTop, left: nameLeft, height: nameH, width: nameW});
  if (greeting) quiet.push({top: greetTop, left: greetLeft, height: 1, width: GREETING.length});
  if (tagline) quiet.push({top: tagTop, left: tagLeft, height: 1, width: TAGLINE.length});

  const flashDip = phase === 'flash' ? 0.35 : 1;
  const starLevel = ramp(tick, STAR_STOPS) * flashDip;
  const flowLevel = ramp(tick, FLOW_STOPS) * flashDip;
  const halo = clamp((tick - ASSEMBLE_FROM) / HALO_TICKS, 0, 1);

  if (starLevel > 0 || flowLevel > 0) {
    for (let row = 0; row < rows; row++) {
      const line = skyRow(row);
      const open = halo > 0 && !rowBeyondHalo(quiet, row);
      for (let column = 0; column < width; column++) {
        const falloff = open ? 1 - halo * (1 - quietFalloff(quiet, row, column)) : 1;
        const mark = skyAt(line, row, column, tick, starLevel * falloff, flowLevel * falloff);
        if (mark) grid[row]![column] = {ch: mark.ch, colour: mark.color, bold: false};
      }
    }
  }

  if (dragon) {
    const progress = clamp((tick - ASSEMBLE_FROM) / (ASSEMBLE_TO - ASSEMBLE_FROM), 0, 1);
    dragonCrossArt.forEach((line, index) => {
      const art = progress >= 1 ? line : scatter(line, index, progress, tick);
      put(grid, artTop + index, artLeft, art, dragonColour(index, tick, phase));
    });
  }

  if (greeting && tick >= GREETING_FROM) {
    put(grid, greetTop, greetLeft, GREETING, fadeStep(tick - GREETING_FROM, GREETING_RAMP));
  }

  // The name wipes in: a settled cyan body with a bright leading edge.
  const nameProgress = clamp((tick - NAME_FROM) / NAME_WIPE, 0, 1);
  if (nameProgress > 0) {
    const lines = blockName ? renderBlockText(NAME) : [NAME];
    const revealed = Math.round(nameW * nameProgress);
    const bodyEnd = Math.max(0, revealed - 2);
    lines.forEach((line, index) => {
      put(grid, nameTop + index, nameLeft, line.slice(0, bodyEnd), colour.cyan, true);
      if (revealed > bodyEnd) {
        put(grid, nameTop + index, nameLeft + bodyEnd, line.slice(bodyEnd, revealed), colour.ink, true);
      }
    });
  }

  if (tagline && tick >= TAGLINE_FROM) {
    put(grid, tagTop, tagLeft, TAGLINE, fadeStep(tick - TAGLINE_FROM, TAGLINE_RAMP));
  }
  if (tick >= TAGLINE_FROM + 6 && tagline && tagTop + 2 < rows) {
    put(grid, tagTop + 2, centreLeft(HINT.length), HINT, colour.dim);
  }

  return grid.map(render);
}
