import React from 'react';
import {Box, Text} from 'ink';
import {launcherItems} from '../data/fakeConversation.js';
import {palette} from '../theme/palette.js';
import {ContextualView} from '../views/ContextualView.js';

// Border, vertical padding and the tallest of the two columns. ConsoleShell
// needs this to know how many rows are left for the story behind the panel.
export const LAUNCHER_HEIGHT = 2 + 2 + 3 + launcherItems.length;

type LauncherOverlayProps = {
  selectedIndex: number;
  width: number;
};

export function LauncherOverlay({selectedIndex, width}: LauncherOverlayProps) {
  const selected = launcherItems[selectedIndex] ?? launcherItems[0];
  const overlayWidth = width - 2;
  const leftWidth = 24;
  const viewWidth = overlayWidth - leftWidth - 5;

  return (
    <Box
      width={overlayWidth}
      marginTop={1}
      borderStyle="single"
      borderColor={palette.dim}
      paddingX={1}
      paddingY={1}
    >
      <Box flexDirection="column" width={leftWidth} marginRight={2}>
        <Text color={palette.amber}>COMMAND FIELD</Text>
        <Text color={palette.muted} dimColor>
          choose surface
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {launcherItems.map((item, index) => {
            const active = index === selectedIndex;
            return (
              <Box key={item.id}>
                <Text color={active ? palette.cyan : palette.dim}>
                  {active ? '>' : ' '} {index + 1}
                </Text>
                <Text color={active ? palette.ink : palette.cyanSoft}> {item.label}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box>
        <Text color={palette.dim}>|</Text>
      </Box>
      <ContextualView item={selected} width={viewWidth} />
    </Box>
  );
}
