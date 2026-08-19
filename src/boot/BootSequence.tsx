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

function scanArtLine(line: string, progress: number) {
  const cells = Array.from(line.padEnd(ART_COLUMNS, ' '));
  const cutoff = Math.floor(progress * ART_COLUMNS);
  return cells.map((cell, column) => column <= cutoff ? cell : ' ').join('');
}

function artColor(index: number, tick: number, progress: number, fading: boolean) {
  if (fading) return index % 2 === 0 ? palette.dim : palette.amberDim;
  if (progress < 0.24) return palette.cyanSoft;
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
  // Test 4: a horizontal scan reveals the dragon from left to right.
  const scanProgress = clamp((tick - 8) / 42, 0, 1);
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
          text: fixedArtLine(scanArtLine(line, scanProgress), width),
          color: artColor(index, tick, scanProgress, fading),
          dim: fading || scanProgress < 0.24
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
