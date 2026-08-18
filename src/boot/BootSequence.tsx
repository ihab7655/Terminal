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

const phases = [
  'cold field',
  'signal acquisition',
  'geometry lock',
  'identity assembly',
  'operator console'
];

const diagnosticCopy = [
  'VECTOR BUS       nominal',
  'NARRATIVE LAYER  staged',
  'MEMORY SURFACE   isolated',
  'TOOLS            mock',
  'POLICY FIELD     local',
  'DRAGON CORE      forming'
];

function signalRow(width: number, tick: number, seed: number) {
  const chars = Array.from({length: width}, (_, index) => {
    const pulse = (index * 7 + tick * 3 + seed) % 41;
    if (pulse === 0) return '+';
    if (pulse === 5 || pulse === 6) return '-';
    if ((index + seed) % 19 === 0 && tick > 18) return '|';
    return ' ';
  });
  return chars.join('');
}

function gridRow(width: number, tick: number, seed: number) {
  const chars = Array.from({length: width}, (_, index) => {
    if ((index + tick + seed) % 29 === 0) return '+';
    if ((index + seed) % 11 === 0) return '.';
    if ((index - seed) % 17 === 0) return ':';
    return ' ';
  });
  return chars.join('');
}

function fixedArtLine(line: string, width: number) {
  const artWidth = Math.max(...dragonCrossArt.map(item => item.length));
  if (width <= artWidth) return fit(line, width);
  const left = Math.floor((width - artWidth) / 2);
  return `${' '.repeat(left)}${line.padEnd(artWidth, ' ')}`.slice(0, width);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function artVisibility(index: number, tick: number) {
  const start = 30;
  const end = 62;
  const progress = clamp((tick - start) / (end - start), 0, 1);
  const middle = (dragonCrossArt.length - 1) / 2;
  const distance = Math.abs(index - middle);
  const radius = progress * (middle + 1.5);
  return tick >= start && distance <= radius;
}

function artColor(index: number, tick: number, fading: boolean) {
  if (fading) return index % 2 === 0 ? palette.dim : palette.amberDim;
  const pulse = (tick * 2 + index * 3) % 18;
  if (pulse < 2) return palette.ink;
  if (pulse < 6) return palette.cyan;
  if (pulse === 9 || pulse === 10) return palette.amber;
  return palette.cyanSoft;
}

export function BootSequence({size, onComplete}: BootSequenceProps) {
  const tick = useTicker(70);
  const width = Math.max(64, Math.min(size.width - 4, 118));
  const contentHeight = Math.max(18, Math.min(size.height - 3, 34));
  const phaseIndex = Math.min(phases.length - 1, Math.floor(tick / 20));
  const collapse = tick > 86;
  const fading = tick >= 76 && !collapse;
  const diagnosticCount = Math.min(diagnosticCopy.length, Math.max(0, Math.floor((tick - 24) / 5)));

  useEffect(() => {
    if (tick >= 100) onComplete();
  }, [onComplete, tick]);

  const topRows = tick < 18 ? 3 : 5;
  const rows: Array<{text: string; color: string; dim?: boolean}> = [];

  for (let index = 0; index < topRows; index += 1) {
    rows.push({
      text: tick < 28 ? signalRow(width, tick, index * 5) : gridRow(width, tick, index * 3),
      color: index % 2 === 0 ? palette.cyanSoft : palette.dim,
      dim: tick < 8
    });
  }

  if (tick > 12 && !collapse) {
    rows.push({
      text: fit(`     / vector alignment ${String((tick * 13) % 997).padStart(3, '0')}  ::  phase ${phases[phaseIndex]}`, width),
      color: phaseIndex >= 3 ? palette.amber : palette.cyan
    });
  }

  if (tick > 22 && tick < 30) {
    rows.push({text: fit('  ' + '-'.repeat(Math.max(0, width - 4)), width), color: palette.dim});
    for (const item of diagnosticCopy.slice(0, diagnosticCount)) {
      rows.push({
        text: fit(`  [${item.includes('mock') || item.includes('isolated') ? 'SIM' : 'OK '}] ${item}`, width),
        color: item.includes('mock') || item.includes('isolated') ? palette.amber : palette.cyanSoft
      });
    }
  }

  if (tick >= 30 && !collapse) {
    rows.push({
      text: center(fading ? 'DRAGON CORE // releasing' : 'DRAGON CORE // forming', width),
      color: fading ? palette.amberDim : palette.amber,
      dim: fading
    });
    for (const [index, line] of dragonCrossArt.entries()) {
      if (!artVisibility(index, tick)) continue;
      rows.push({
        text: fixedArtLine(line, width),
        color: artColor(index, tick, fading),
        dim: fading || (tick < 38 && index % 2 === 1)
      });
    }
  }

  if (tick > 58 && !collapse) {
    rows.push({text: center('D R A G O N', width), color: fading ? palette.amberDim : palette.amber, dim: fading});
    rows.push({
      text: center('AI OPERATING ENGINE  //  VISUAL PROTOTYPE', width),
      color: palette.muted,
      dim: true
    });
  }

  if (collapse) {
    rows.length = 0;
    rows.push({text: signalRow(width, tick, 2), color: palette.dim, dim: true});
    rows.push({text: center('DRAGON', width), color: palette.cyan});
    rows.push({text: center('console handoff', width), color: palette.amber});
    rows.push({text: signalRow(width, tick * 2, 7), color: palette.dim, dim: true});
  }

  while (rows.length < contentHeight) {
    const seed = rows.length * 7;
    rows.push({
      text: tick > 14 && tick < 82 && rows.length % 4 === 0 ? gridRow(width, tick, seed) : '',
      color: palette.shadow,
      dim: true
    });
  }

  return (
    <Box flexDirection="column" width={width + 2} height={contentHeight + 1} paddingX={1}>
      {rows.slice(0, contentHeight).map((row, index) => (
        <Text key={`${tick}-${index}`} color={row.color} dimColor={row.dim}>
          {row.text}
        </Text>
      ))}
    </Box>
  );
}
