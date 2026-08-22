import React from 'react';
import {Box, Text} from 'ink';
import {type LauncherItem} from '../data/fakeConversation.js';
import {palette} from '../theme/palette.js';
import {fit} from '../utils/pad.js';

type ContextualViewProps = {
  item: LauncherItem;
  width: number;
  /** How many entries the panel has room for. */
  entries: number;
};

// Every line here is truncated rather than wrapped. The view sits inside a
// panel of a known height, so a line that wraps does not just look wrong — it
// takes a row from whatever is below it and pushes the frame past the terminal.
// At 40 columns the view was left nine of them and grew to 137 rows.
export function ContextualView({item, width, entries}: ContextualViewProps) {
  const inner = Math.max(0, width - 2);
  const shown = item.entries.slice(0, Math.max(0, entries));

  return (
    <Box flexDirection="column" width={width} paddingX={1} paddingY={1}>
      <Box>
        <Text color={palette.cyan} bold>
          {fit(item.label.toUpperCase(), Math.min(inner, item.label.length))}
        </Text>
        <Text color={palette.muted}>{fit('  contextual surface', Math.max(0, inner - item.label.length))}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={palette.amber}>{fit(item.hint, inner)}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {shown.map((entry, index) => (
          <Box key={entry}>
            <Text color={palette.dim}>{String(index + 1).padStart(2, '0')} </Text>
            <Text color={index === 0 ? palette.ink : palette.cyanSoft}>{fit(entry, Math.max(0, inner - 3))}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={palette.muted} dimColor>
          {fit('Escape returns to the conversation story.', inner)}
        </Text>
      </Box>
    </Box>
  );
}
