import React, {useEffect} from 'react';
import {Box, Text} from 'ink';
import {useTicker} from '../animation/useTicker.js';
import {identity} from '../theme/identity.js';
import {palette} from '../theme/palette.js';
import {clamp} from '../utils/clamp.js';
import type {TerminalSize} from '../utils/useTerminalSize.js';
import {GLYPH_HEIGHT, blockTextWidth, renderBlockText} from './blockFont.js';
import {dragonCrossArt} from './dragonCrossArt.js';

type BootSequenceProps = {
  size: TerminalSize;
  onComplete: () => void;
};

// Welcome timeline, in ticks of TICK_MS. The dragon assembles from scattered
// points, flashes, settles, and then the greeting and name arrive beneath it.
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

type Segment = {text: string; color: string; dim?: boolean; bold?: boolean};
type Row = Segment[];

type Candidate = {gap: number; greeting: boolean; blockName: boolean; tagline: boolean; trim: number};
type Layout = Candidate & {dragonRows: number};

const spacer = (width: number): Row => [{text: ' '.repeat(width), color: palette.shadow, dim: true}];

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
  const fixed = layoutHeight(0, last, 1);
  return {...last, dragonRows: clamp(contentHeight - fixed, 0, dragonCrossArt.length)};
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

// The art is centred as one block: every line shares the same left offset and
// is padded to the widest line. Centring lines individually shears the drawing.
const ART_WIDTH = Math.max(...dragonCrossArt.map(line => line.length));

function artRow(line: string, width: number, color: string): Row {
  const left = Math.max(0, Math.floor((width - ART_WIDTH) / 2));
  const body = line.padEnd(ART_WIDTH, ' ').slice(0, Math.max(0, width - left));
  const right = Math.max(0, width - left - body.length);
  return [
    {text: ' '.repeat(left), color: palette.shadow, dim: true},
    {text: body, color},
    {text: ' '.repeat(right), color: palette.shadow, dim: true}
  ];
}

function centeredRow(text: string, width: number, color: string, bold?: boolean): Row {
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  const right = Math.max(0, width - left - text.length);
  return [
    {text: ' '.repeat(left), color: palette.shadow, dim: true},
    {text: text.slice(0, width), color, bold},
    {text: ' '.repeat(right), color: palette.shadow, dim: true}
  ];
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
  const phase = tick < ASSEMBLE_TO ? 'assemble' : tick < FLASH_TO ? 'flash' : 'settled';

  const block: Row[] = [];

  for (const [index, line] of dragonCrossArt.slice(0, layout.dragonRows).entries()) {
    const visible = phase === 'flash' ? 1 : phase === 'assemble' ? assembleProgress : 1 - exitProgress;
    const art = phase === 'flash' ? line : scatterArtLine(line, index, visible, phase === 'settled' ? 991 : tick);
    block.push(artRow(art, width, dragonColor(index, tick, phase)));
  }

  // The welcome text dims away with the dragon instead of blinking out.
  const exitColor = (color: string) =>
    exitProgress > 0.66 ? palette.shadow : exitProgress > 0.25 ? palette.dim : color;

  for (let index = 0; index < layout.gap; index++) block.push(spacer(width));

  if (layout.greeting) {
    const since = tick - GREETING_FROM;
    const text = [...identity.greeting].join(' ');
    block.push(
      since < 0 ? spacer(width) : centeredRow(text, width, exitColor(fadeStep(since, GREETING_RAMP)))
    );
    for (let index = 0; index < layout.gap; index++) block.push(spacer(width));
  }

  const nameProgress = clamp((tick - NAME_FROM) / NAME_WIPE_TICKS, 0, 1);

  if (layout.blockName) {
    const nameRows = renderBlockText(identity.name);
    const nameWidth = blockTextWidth(identity.name);
    const left = Math.max(0, Math.floor((width - nameWidth) / 2));
    const revealed = Math.round(nameProgress * nameWidth);
    const settled = nameProgress >= 1;
    const bodyEnd = settled ? nameWidth : Math.max(0, revealed - 1);

    for (const line of nameRows) {
      if (revealed === 0) {
        block.push(spacer(width));
        continue;
      }

      const body = line.slice(0, bodyEnd);
      const edge = settled ? '' : line.slice(bodyEnd, revealed);
      const used = left + body.length + edge.length;
      block.push([
        {text: ' '.repeat(left), color: palette.shadow, dim: true},
        {text: body, color: exitColor(palette.cyan), bold: true},
        {text: edge, color: exitColor(palette.ink), bold: true},
        {text: ' '.repeat(Math.max(0, width - used)), color: palette.shadow, dim: true}
      ]);
    }
  } else {
    const visible = Math.round(nameProgress * identity.name.length);
    block.push(
      visible === 0
        ? spacer(width)
        : centeredRow([...identity.name.slice(0, visible)].join(' '), width, exitColor(palette.cyan), true)
    );
  }

  if (layout.tagline) {
    const since = tick - TAGLINE_FROM;
    for (let index = 0; index < layout.gap; index++) block.push(spacer(width));
    block.push(
      since < 0 ? spacer(width) : centeredRow(identity.tagline, width, exitColor(fadeStep(since, TAGLINE_RAMP)))
    );
  }

  // Ink needs real spaces, not empty strings, to hold the frame steady.
  const rows: Row[] = Array.from({length: contentHeight}, () => spacer(width));
  const topOffset = Math.max(0, Math.floor((contentHeight - block.length) / 2));

  for (const [index, row] of block.entries()) {
    const rowIndex = topOffset + index;
    if (rowIndex >= 0 && rowIndex < rows.length) rows[rowIndex] = row;
  }

  return (
    <Box flexDirection="column" width={width + 2} height={contentHeight + 1} paddingX={1}>
      {rows.map((row, index) => (
        <Text key={index}>
          {row.map((segment, segmentIndex) => (
            <Text key={segmentIndex} color={segment.color} dimColor={segment.dim} bold={segment.bold}>
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
