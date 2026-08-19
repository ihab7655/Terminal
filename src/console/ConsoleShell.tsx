import React from 'react';
import {Box, Text} from 'ink';
import {Composer} from '../composer/Composer.js';
import {ConversationStory} from '../conversation/ConversationStory.js';
import {LAUNCHER_HEIGHT, LauncherOverlay} from '../launcher/LauncherOverlay.js';
import {palette} from '../theme/palette.js';
import type {TerminalSize} from '../utils/useTerminalSize.js';

type ConsoleShellProps = {
  size: TerminalSize;
  composerValue: string;
  composerCursor: number;
  launcherOpen: boolean;
  selectedIndex: number;
};

const HEADER_ROWS = 3;
const STORY_MARGIN = 2;
const COMPOSER_ROWS = 4;

export function ConsoleShell({
  size,
  composerValue,
  composerCursor,
  launcherOpen,
  selectedIndex
}: ConsoleShellProps) {
  const width = Math.min(size.width - 2, 110);
  const shellHeight = Math.max(22, size.height - 2);

  // The launcher rises from the composer instead of replacing the story, so
  // the story keeps whatever rows the panel leaves rather than vanishing.
  const storyRows =
    shellHeight - HEADER_ROWS - STORY_MARGIN - COMPOSER_ROWS - (launcherOpen ? LAUNCHER_HEIGHT + 1 : 1);

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

      <Box flexDirection="column" marginTop={STORY_MARGIN} flexGrow={1}>
        <ConversationStory size={size} maxRows={storyRows} dimmed={launcherOpen} />
        {!launcherOpen && (
          <Box marginTop={1}>
            <Text color={palette.dim}>
              - hidden details available through contextual launcher -
            </Text>
          </Box>
        )}
      </Box>

      {launcherOpen && <LauncherOverlay selectedIndex={selectedIndex} width={width} />}

      <Composer value={composerValue} cursor={composerCursor} width={width} focused={!launcherOpen} />
    </Box>
  );
}
