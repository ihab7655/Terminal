import React from 'react';
import {Box, Text} from 'ink';
import {palette} from '../theme/palette.js';
import {fit} from '../utils/pad.js';

type ComposerProps = {
  value: string;
  width: number;
  focused: boolean;
};

export function Composer({value, width, focused}: ComposerProps) {
  const innerWidth = Math.max(30, width - 6);
  const prompt = value.length > 0 ? value : 'Type a message for the engine visual...';

  return (
    <Box flexDirection="column" width={width} marginTop={1}>
      <Text color={palette.dim}>{'-'.repeat(Math.max(0, width - 2))}</Text>
      <Box paddingX={1}>
        <Text color={focused ? palette.amber : palette.muted}>{focused ? '>' : '-'} </Text>
        <Text color={value.length > 0 ? palette.ink : palette.muted}>{fit(prompt, innerWidth)}</Text>
        <Text color={palette.cyan}>{focused ? ' _' : ''}</Text>
      </Box>
      <Box paddingX={1}>
        <Text color={palette.muted} dimColor>
          Ctrl+K launcher  Esc close  Q quit  visual prototype only
        </Text>
      </Box>
    </Box>
  );
}
