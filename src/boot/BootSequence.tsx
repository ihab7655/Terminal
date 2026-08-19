import React, {useEffect} from 'react';
import {Box, Text} from 'ink';
import {useTicker} from '../animation/useTicker.js';
import {palette} from '../theme/palette.js';
import {center, fit} from '../utils/pad.js';
import type {TerminalSize} from '../utils/useTerminalSize.js';
import {dragonCrossArt} from './dragonCrossArt.js';

type BootSequenceProps = {
  size: TerminalSize;
  onComplete: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fixedArtLine(line: string, width: number) {
  const artWidth = Math.max(...dragonCrossArt.map(item => item.length));
  if (width <= artWidth) return fit(line, width);
  const left = Math.floor((width - artWidth) / 2);
  return `${' '.repeat(left)}${line.padEnd(artWidth, ' ')}`.slice(0, width);
}

const ART_COLUMNS = Math.max(...dragonCrossArt.map(item => Array.from(item).length));
const artPriority = buildArtPriority();

function buildArtPriority() {
  const grid = dragonCrossArt.map(line => Array.from(line.padEnd(ART_COLUMNS, ' ')));
  const priority = grid.map(row => row.map(() => Number.POSITIVE_INFINITY));
  const queue: Array<[number, number]> = [];
  const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  const active = (row: number, column: number) => {
    const cell = grid[row]?.[column] ?? ' ';
    return (cell.codePointAt(0) ?? 0) > 0x2800;
  };

  for (let row = 0; row < grid.length; row += 1) {
    for (let column = 0; column < ART_COLUMNS; column += 1) {
      if (!active(row, column)) continue;
      const border = directions.some(([dy, dx]) => !active(row + dy, column + dx));
      if (border) {
        priority[row][column] = 0;
        queue.push([row, column]);
      }
    }
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const [row, column] = queue[cursor++];
    for (const [dy, dx] of directions) {
      const nextRow = row + dy;
      const nextColumn = column + dx;
      if (!active(nextRow, nextColumn) || priority[nextRow][nextColumn] !== Number.POSITIVE_INFINITY) continue;
      priority[nextRow][nextColumn] = priority[row][column] + 1;
      queue.push([nextRow, nextColumn]);
    }
  }

  return priority;
}

function outlineArtLine(line: string, row: number, progress: number) {
  const cells = Array.from(line.padEnd(ART_COLUMNS, ' '));
  const maxPriority = Math.max(...artPriority.flat().filter(value => Number.isFinite(value)), 0);
  const cutoff = Math.floor(progress * maxPriority);
  return cells.map((cell, column) => {
    const priority = artPriority[row]?.[column] ?? Number.POSITIVE_INFINITY;
    return priority <= cutoff ? cell : ' ';
  }).join('');
}

function artColor(index: number, tick: number, progress: number, fading: boolean) {
  if (fading) return index % 2 === 0 ? palette.dim : palette.amberDim;
  if (progress < 0.22) return palette.amberDim;
  if (progress < 0.48) return palette.amber;
  const pulse = (tick * 2 + index * 3) % 20;
  if (pulse < 2 && progress > 0.72) return palette.ink;
  if (pulse === 10 || pulse === 11) return palette.amber;
  return palette.cyan;
}

function handoffRow(width: number, tick: number, seed: number) {
  return Array.from({length: width}, (_, index) => {
    const pulse = (index * 11 + tick * 5 + seed) % 43;
    if (pulse === 0) return '+';
    if (pulse === 7 || pulse === 8) return '-';
    if ((index + seed) % 23 === 0) return '|';
    return ' ';
  }).join('');
}

export function BootSequence({size, onComplete}: BootSequenceProps) {
  const tick = useTicker(70);
  const width = Math.max(64, Math.min(size.width - 4, 118));
  const contentHeight = Math.max(18, Math.min(size.height - 3, 34));
  const dragonPage = tick < 80;
  const fading = tick >= 66 && dragonPage;
  // Test 3: reveal the outer contour first, then the inner details.
  const outlineProgress = clamp((tick - 8) / 42, 0, 1);
  const fadeProgress = clamp((tick - 66) / 14, 0, 1);

  useEffect(() => {
    if (tick >= 94) onComplete();
  }, [onComplete, tick]);

  // Ink must receive real spaces, not empty strings, to preserve the fixed frame.
  const rows: Array<{text: string; color: string; dim?: boolean}> = Array.from(
    {length: contentHeight},
    () => ({text: ' '.repeat(width), color: palette.shadow, dim: true})
  );

  if (dragonPage) {
    const topOffset = Math.max(0, Math.floor((contentHeight - dragonCrossArt.length) / 2));
    for (const [index, line] of dragonCrossArt.entries()) {
      const rowIndex = topOffset + index;
      if (rowIndex >= 0 && rowIndex < rows.length) {
        rows[rowIndex] = {
          text: fixedArtLine(outlineArtLine(line, index, outlineProgress), width),
          color: artColor(index, tick, outlineProgress, fading),
          dim: fading || outlineProgress < 0.28
        };
      }
    }
  } else {
    const handoffCenter = Math.floor(contentHeight / 2);
    rows[handoffCenter - 2] = {text: handoffRow(width, tick, 2), color: palette.dim, dim: true};
    rows[handoffCenter] = {text: center('DRAGON', width), color: palette.cyan};
    rows[handoffCenter + 1] = {text: center('console handoff', width), color: palette.amber};
    rows[handoffCenter + 3] = {text: handoffRow(width, tick * 2, 7), color: palette.dim, dim: true};
  }

  return (
    <Box flexDirection="column" width={width + 2} height={contentHeight + 1} paddingX={1}>
      {rows.map((row, index) => (
        <Text key={`${tick}-${index}`} color={row.color} dimColor={row.dim}>
          {row.text}
        </Text>
      ))}
    </Box>
  );
}
