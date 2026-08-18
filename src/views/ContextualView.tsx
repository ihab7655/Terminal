import React from 'react';
import {Box, Text} from 'ink';
import {type LauncherItem} from '../data/fakeConversation.js';
import {palette} from '../theme/palette.js';

type ContextualViewProps = {
  item: LauncherItem;
  width: number;
};

export function ContextualView({item, width}: ContextualViewProps) {
  return (
    <Box flexDirection="column" width={width} paddingX={1} paddingY={1}>
      <Box>
        <Text color={palette.cyan} bold>
          {item.label.toUpperCase()}
        </Text>
        <Text color={palette.muted}>  contextual surface</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={palette.amber}>{item.hint}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {item.entries.map((entry, index) => (
          <Box key={entry}>
            <Text color={palette.dim}>{String(index + 1).padStart(2, '0')} </Text>
            <Text color={index === 0 ? palette.ink : palette.cyanSoft}>{entry}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={palette.muted} dimColor>
          Escape returns to the conversation story.
        </Text>
      </Box>
    </Box>
  );
}
