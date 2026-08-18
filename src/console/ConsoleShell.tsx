import React from 'react';
import {Box, Text} from 'ink';
import {Composer} from '../composer/Composer.js';
import {ConversationStory} from '../conversation/ConversationStory.js';
import {LauncherOverlay} from '../launcher/LauncherOverlay.js';
import {palette} from '../theme/palette.js';
import type {TerminalSize} from '../utils/useTerminalSize.js';

type ConsoleShellProps = {
  size: TerminalSize;
  composerValue: string;
  launcherOpen: boolean;
  selectedIndex: number;
};

export function ConsoleShell({size, composerValue, launcherOpen, selectedIndex}: ConsoleShellProps) {
  const width = Math.min(size.width - 2, 110);
  const shellHeight = Math.max(22, size.height - 2);

  return (
    <Box flexDirection="column" width={width} minHeight={shellHeight} paddingX={1}>
      <Box justifyContent="space-between" width={width}>
        <Box>
          <Text color={palette.cyan} bold>
            DRAGON
          </Text>
          <Text color={palette.muted}> / operating console</Text>
        </Box>
        <Text color={palette.amber}>mock mode</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={palette.dim}>
          signal calm / story view / no engine connection / local visual prototype
        </Text>
      </Box>

      {launcherOpen ? (
        <LauncherOverlay selectedIndex={selectedIndex} width={width} />
      ) : (
        <Box flexDirection="column" marginTop={2} flexGrow={1}>
          <ConversationStory size={size} />
          <Box marginTop={1}>
            <Text color={palette.dim}>
              - hidden details available through contextual launcher -
            </Text>
          </Box>
        </Box>
      )}

      <Box flexGrow={1} />
      <Composer value={composerValue} width={width} focused={!launcherOpen} />
    </Box>
  );
}
