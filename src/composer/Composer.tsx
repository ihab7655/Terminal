import React from 'react';
import {Box, Text} from 'ink';
import {palette} from '../theme/palette.js';
import {fit} from '../utils/pad.js';

type ComposerProps = {
  value: string;
  cursor: number;
  width: number;
  focused: boolean;
};

const PLACEHOLDER = 'Type a message for the engine visual...';
const HINT = 'Ctrl+K launcher   Esc close   Enter send   Up/Down history   Ctrl+C quit';

export function Composer({value, cursor, width, focused}: ComposerProps) {
  // No floor. A floor here is a request for columns the terminal may not have,
  // which is what made narrow windows wrap the composer and judder.
  const innerWidth = Math.max(0, width - 6);
  const empty = value.length === 0;

  // The caret is a real cell of the line, so it sits between characters rather
  // than trailing the text the way a fixed underscore did.
  const before = value.slice(0, cursor);
  const at = value.slice(cursor, cursor + 1) || ' ';
  const after = value.slice(cursor + 1);
  const used = before.length + 1 + after.length;

  return (
    <Box flexDirection="column" width={width} marginTop={1}>
      <Text color={palette.dim}>{'-'.repeat(Math.max(0, width - 2))}</Text>
      <Box paddingX={1}>
        <Text color={focused ? palette.amber : palette.muted}>{focused ? '>' : '-'} </Text>
        {empty && !focused ? (
          <Text color={palette.muted}>{fit(PLACEHOLDER, innerWidth)}</Text>
        ) : (
          <Text>
            <Text color={palette.ink}>{before}</Text>
            <Text color={palette.ink} inverse={focused}>
              {at}
            </Text>
            <Text color={palette.ink}>{after}</Text>
            <Text color={palette.muted}>
              {empty ? ` ${PLACEHOLDER}` : ''}
            </Text>
            <Text>{' '.repeat(Math.max(0, innerWidth - used - (empty ? PLACEHOLDER.length + 1 : 0)))}</Text>
          </Text>
        )}
      </Box>
      <Box paddingX={1}>
        <Text color={palette.muted} dimColor>
          {fit(HINT, Math.max(0, width - 2))}
        </Text>
      </Box>
    </Box>
  );
}
