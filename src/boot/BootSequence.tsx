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

function artRadius(progress: number) {
  const middle = (dragonCrossArt.length - 1) / 2;
  return progress * (middle + 2);
}

function artColor(index: number, tick: number, fading: boolean) {
  if (fading) return index % 2 === 0 ? palette.dim : palette.amberDim;
  const pulse = (tick * 2 + index * 3) % 20;
  if (pulse < 2) return palette.ink;
  if (pulse < 7) return palette.cyan;
  if (pulse === 10 || pulse === 11) return palette.amber;
  return palette.cyanSoft;
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
  // Test 1: assemble the dragon from its central body outward.
  const revealProgress = clamp((tick - 8) / 42, 0, 1);
  const fadeProgress = clamp((tick - 66) / 14, 0, 1);
  const radius = fading ? artRadius(1 - fadeProgress) : artRadius(revealProgress);
  const middle = (dragonCrossArt.length - 1) / 2;

  useEffect(() => {
    if (tick >= 94) onComplete();
  }, [onComplete, tick]);

  const rows: Array<{text: string; color: string; dim?: boolean}> = Array.from(
    {length: contentHeight},
    () => ({text: '', color: palette.shadow, dim: true})
  );

  if (dragonPage) {
    const topOffset = Math.max(0, Math.floor((contentHeight - dragonCrossArt.length) / 2));
    for (const [index, line] of dragonCrossArt.entries()) {
      if (Math.abs(index - middle) > radius) continue;
      const rowIndex = topOffset + index;
      if (rowIndex >= 0 && rowIndex < rows.length) {
        rows[rowIndex] = {
          text: fixedArtLine(line, width),
          color: artColor(index, tick, fading),
          dim: fading || (tick < 28 && index % 2 === 1)
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
