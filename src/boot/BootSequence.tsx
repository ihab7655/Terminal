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

function randomHash(row: number, column: number, tick: number) {
  let value = (row + 1) * 374761393 + (column + 1) * 668265263 + (tick + 1) * 1442695041;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function randomArtLine(line: string, row: number, progress: number, tick: number) {
  return Array.from(line).map((cell, column) => {
    const active = (cell.codePointAt(0) ?? 0) > 0x2800;
    if (!active) return ' ';
    return randomHash(row, column, tick) <= progress ? cell : ' ';
  }).join('');
}

function artColor(index: number, progress: number, fading: boolean) {
  if (fading) return index % 2 === 0 ? palette.dim : palette.amberDim;
  return progress < 0.58 ? palette.cyanSoft : palette.cyan;
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
  // Test 6: deterministic random Braille points settle into the dragon.
  const randomProgress = clamp((tick - 8) / 52, 0, 1);
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
          text: fixedArtLine(randomArtLine(line, index, randomProgress, tick), width),
          color: artColor(index, randomProgress, fading),
          dim: fading || randomProgress < 0.32
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
