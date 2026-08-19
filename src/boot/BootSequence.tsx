import React, {useEffect} from 'react';
import {Box, Text} from 'ink';
import {useTicker} from '../animation/useTicker.js';
import {identity} from '../theme/identity.js';
import {palette} from '../theme/palette.js';
import {clamp} from '../utils/clamp.js';
import type {TerminalSize} from '../utils/useTerminalSize.js';
import {GLYPH_HEIGHT, blockTextWidth, renderBlockText} from './blockFont.js';
import {dragonCrossArt} from './dragonCrossArt.js';
import {skyAt} from './sky.js';

type BootSequenceProps = {
  size: TerminalSize;
  onComplete: () => void;
};

// Welcome timeline, in ticks of TICK_MS. The sky arrives first, the dragon
// assembles into it, flashes, settles, and the greeting and name follow.
const TICK_MS = 70;
const ASSEMBLE_FROM = 8;
const ASSEMBLE_TO = 40;
const FLASH_TO = 50;
const GREETING_FROM = 56;
const NAME_FROM = 62;
const NAME_WIPE_TICKS = 14;
const TAGLINE_FROM = 80;
const EXIT_FROM = 104;
const EXIT_TICKS = 8;
export const BOOT_TICKS = EXIT_FROM + EXIT_TICKS;

// The art is centred as one block: every line shares the same left offset. An
// earlier revision centred lines by their own length, which sheared the drawing.
export const ART_WIDTH = Math.max(...dragonCrossArt.map(line => line.length));
export const artLeft = (width: number) => Math.max(0, Math.floor((width - ART_WIDTH) / 2));

type Segment = {text: string; color: string; bold?: boolean};
type Row = Segment[];
type Cell = {ch: string; color: string; bold?: boolean};
type Rect = {top: number; left: number; height: number; width: number};

type Candidate = {gap: number; greeting: boolean; blockName: boolean; tagline: boolean; trim: number};
type Layout = Candidate & {dragonRows: number};

// dragon [gap] greeting? [gap] name [gap tagline?]
function layoutHeight(dragonRows: number, candidate: Candidate, nameHeight: number) {
  const {gap, greeting, tagline} = candidate;
  return dragonRows + gap + (greeting ? 1 + gap : 0) + nameHeight + (tagline ? gap + 1 : 0);
}

// Richest arrangement that still fits. The tagline goes first, then the
// breathing gaps, then the dragon's tail; the greeting and the name stay.
function planLayout(contentHeight: number, width: number): Layout {
  const block = blockTextWidth(identity.name) <= width;
  const candidates: Candidate[] = [
    {gap: 1, greeting: true, blockName: block, tagline: true, trim: 0},
    {gap: 1, greeting: true, blockName: block, tagline: false, trim: 0},
    {gap: 0, greeting: true, blockName: block, tagline: false, trim: 0},
    {gap: 0, greeting: true, blockName: block, tagline: false, trim: 3},
    {gap: 0, greeting: true, blockName: false, tagline: false, trim: 3},
    {gap: 0, greeting: false, blockName: false, tagline: false, trim: 3}
  ];

  for (const candidate of candidates) {
    const rows = dragonCrossArt.length - candidate.trim;
    const nameHeight = candidate.blockName ? GLYPH_HEIGHT : 1;
    if (layoutHeight(rows, candidate, nameHeight) <= contentHeight) return {...candidate, dragonRows: rows};
  }

  const last = candidates[candidates.length - 1]!;
  return {...last, dragonRows: clamp(contentHeight - layoutHeight(0, last, 1), 0, dragonCrossArt.length)};
}

function randomHash(row: number, column: number, tick: number) {
  let value = (row + 1) * 374761393 + (column + 1) * 668265263 + (tick + 1) * 1442695041;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

// Braille blank is U+2800, so anything above it is an inked cell.
function scatterArtLine(line: string, row: number, progress: number, tick: number) {
  return Array.from(line)
    .map((cell, column) => {
      if ((cell.codePointAt(0) ?? 0) <= 0x2800) return ' ';
      return randomHash(row, column, tick) <= progress ? cell : ' ';
    })
    .join('');
}

const FLASH_COLORS = [palette.ink, palette.cyan, palette.amber];

function dragonColor(rowIndex: number, tick: number, phase: 'assemble' | 'flash' | 'settled') {
  if (phase === 'flash') return FLASH_COLORS[rowIndex % FLASH_COLORS.length]!;
  if (phase === 'assemble') return palette.cyanSoft;
  // A slow highlight travels down the body so the settled dragon still breathes.
  const wave = Math.sin(tick / 7 - rowIndex / 3);
  if (wave > 0.9) return palette.ink;
  return wave > 0 ? palette.cyan : palette.cyanSoft;
}

function fadeStep(ticksSince: number, ramp: readonly string[]) {
  return ramp[Math.min(ramp.length - 1, Math.max(0, Math.floor(ticksSince / 3)))]!;
}

const GREETING_RAMP = [palette.dim, palette.muted, palette.cyanSoft] as const;
const TAGLINE_RAMP = [palette.dim, palette.amberDim, palette.amber] as const;

function ramp(tick: number, stops: ReadonlyArray<readonly [number, number]>) {
  const first = stops[0]!;
  if (tick <= first[0]) return first[1];
  for (let index = 1; index < stops.length; index++) {
    const [from, fromValue] = stops[index - 1]!;
    const [to, toValue] = stops[index]!;
    if (tick <= to) return fromValue + (toValue - fromValue) * ((tick - from) / (to - from));
  }
  return stops[stops.length - 1]![1];
}

const STAR_STOPS = [
  [0, 0],
  [5, 1],
  [ASSEMBLE_TO, 1],
  [GREETING_FROM, 0.6],
  [TAGLINE_FROM, 0.4],
  [EXIT_FROM, 0.4],
  [BOOT_TICKS, 0]
] as const;

const FLOW_STOPS = [
  [0, 1],
  [ASSEMBLE_FROM, 1],
  [ASSEMBLE_TO, 0.35],
  [NAME_FROM, 0],
  [BOOT_TICKS, 0]
] as const;

// Rows are half as tall as they are wide, so vertical distance counts double
// and the calm around the art reads as a circle rather than an ellipse.
function distanceToRect(rect: Rect, row: number, column: number) {
  const dx = Math.max(0, rect.left - column, column - (rect.left + rect.width - 1));
  const dy = Math.max(0, rect.top - row, row - (rect.top + rect.height - 1));
  return Math.hypot(dx, dy * 2);
}

const QUIET_RADIUS = 2;
const HALO_RADIUS = 11;

function quietFalloff(rects: Rect[], row: number, column: number) {
  let nearest = Infinity;
  for (const rect of rects) nearest = Math.min(nearest, distanceToRect(rect, row, column));
  if (nearest <= QUIET_RADIUS) return 0;
  if (nearest >= HALO_RADIUS) return 1;
  const t = (nearest - QUIET_RADIUS) / (HALO_RADIUS - QUIET_RADIUS);
  return t * t * (3 - 2 * t);
}

function paint(grid: Cell[][], top: number, left: number, text: string, color: string, bold?: boolean) {
  const line = grid[top];
  if (!line) return;
  for (let index = 0; index < text.length; index++) {
    const column = left + index;
    const ch = text[index]!;
    // Spaces stay transparent so the sky shows through the gaps in the art.
    if (ch === ' ' || column < 0 || column >= line.length) continue;
    line[column] = {ch, color, bold};
  }
}

function toRow(cells: Cell[]): Row {
  const segments: Segment[] = [];
  for (const cell of cells) {
    const last = segments[segments.length - 1];
    if (last && last.color === cell.color && last.bold === cell.bold) last.text += cell.ch;
    else segments.push({text: cell.ch, color: cell.color, bold: cell.bold});
  }
  return segments;
}

export function BootSequence({size, onComplete}: BootSequenceProps) {
  const tick = useTicker(TICK_MS);
  const width = Math.max(64, Math.min(size.width - 4, 118));
  const contentHeight = Math.max(18, Math.min(size.height - 3, 34));

  useEffect(() => {
    if (tick >= BOOT_TICKS) onComplete();
  }, [onComplete, tick]);

  const layout = planLayout(contentHeight, width);
  const assembleProgress = clamp((tick - ASSEMBLE_FROM) / (ASSEMBLE_TO - ASSEMBLE_FROM), 0, 1);
  const exitProgress = clamp((tick - EXIT_FROM) / EXIT_TICKS, 0, 1);
  const nameProgress = clamp((tick - NAME_FROM) / NAME_WIPE_TICKS, 0, 1);
  const phase = tick < ASSEMBLE_TO ? 'assemble' : tick < FLASH_TO ? 'flash' : 'settled';

  // Where each part of the composition sits, resolved before anything is drawn
  // so the sky can be thinned around it and the layout never shifts.
  const nameRows = layout.blockName ? renderBlockText(identity.name) : [];
  const nameWidth = layout.blockName ? blockTextWidth(identity.name) : identity.name.length * 2 - 1;
  const nameHeight = layout.blockName ? GLYPH_HEIGHT : 1;
  const greetingText = [...identity.greeting].join(' ');
  const blockHeight = layoutHeight(layout.dragonRows, layout, nameHeight);

  let cursor = Math.max(0, Math.floor((contentHeight - blockHeight) / 2));
  const artTop = cursor;
  cursor += layout.dragonRows + layout.gap;
  const greetingTop = cursor;
  if (layout.greeting) cursor += 1 + layout.gap;
  const nameTop = cursor;
  cursor += nameHeight + layout.gap;
  const taglineTop = cursor;

  const left = artLeft(width);
  const centreLeft = (text: number) => Math.max(0, Math.floor((width - text) / 2));
  const greetingLeft = centreLeft(greetingText.length);
  const nameLeft = centreLeft(nameWidth);
  const taglineLeft = centreLeft(identity.tagline.length);

  const quiet: Rect[] = [
    {top: artTop, left, height: layout.dragonRows, width: ART_WIDTH},
    {top: nameTop, left: nameLeft, height: nameHeight, width: nameWidth}
  ];
  if (layout.greeting) {
    quiet.push({top: greetingTop, left: greetingLeft, height: 1, width: greetingText.length});
  }
  if (layout.tagline) {
    quiet.push({top: taglineTop, left: taglineLeft, height: 1, width: identity.tagline.length});
  }

  const flashDip = phase === 'flash' ? 0.35 : 1;
  const starLevel = ramp(tick, STAR_STOPS) * flashDip;
  const flowLevel = ramp(tick, FLOW_STOPS) * flashDip;

  const blank: Cell = {ch: ' ', color: palette.shadow};
  const grid: Cell[][] = Array.from({length: contentHeight}, (_, row) =>
    Array.from({length: width}, (_, column) => {
      const falloff = quietFalloff(quiet, row, column);
      if (falloff <= 0) return blank;
      const mark = skyAt(row, column, tick, starLevel * falloff, flowLevel * falloff);
      return mark ? {ch: mark.ch, color: mark.color} : blank;
    })
  );

  for (let index = 0; index < layout.dragonRows; index++) {
    const line = dragonCrossArt[index]!;
    const visible = phase === 'flash' ? 1 : phase === 'assemble' ? assembleProgress : 1 - exitProgress;
    const art = phase === 'flash' ? line : scatterArtLine(line, index, visible, phase === 'settled' ? 991 : tick);
    paint(grid, artTop + index, left, art, dragonColor(index, tick, phase));
  }

  // The welcome text dims away with the dragon instead of blinking out.
  const exitColor = (color: string) =>
    exitProgress > 0.66 ? palette.shadow : exitProgress > 0.25 ? palette.dim : color;

  if (layout.greeting && tick >= GREETING_FROM) {
    const shade = exitColor(fadeStep(tick - GREETING_FROM, GREETING_RAMP));
    paint(grid, greetingTop, greetingLeft, greetingText, shade);
  }

  if (nameProgress > 0) {
    const revealed = Math.round(nameProgress * nameWidth);
    const settled = nameProgress >= 1;
    const bodyEnd = settled ? nameWidth : Math.max(0, revealed - 1);
    const lines = layout.blockName ? nameRows : [[...identity.name].join(' ')];

    for (const [index, line] of lines.entries()) {
      paint(grid, nameTop + index, nameLeft, line.slice(0, bodyEnd), exitColor(palette.cyan), true);
      if (!settled) {
        paint(grid, nameTop + index, nameLeft + bodyEnd, line.slice(bodyEnd, revealed), exitColor(palette.ink), true);
      }
    }
  }

  if (layout.tagline && tick >= TAGLINE_FROM) {
    const shade = exitColor(fadeStep(tick - TAGLINE_FROM, TAGLINE_RAMP));
    paint(grid, taglineTop, taglineLeft, identity.tagline, shade);
  }

  return (
    <Box flexDirection="column" width={width + 2} height={contentHeight + 1} paddingX={1}>
      {grid.map((cells, index) => (
        <Text key={index}>
          {toRow(cells).map((segment, segmentIndex) => (
            <Text key={segmentIndex} color={segment.color} bold={segment.bold}>
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
