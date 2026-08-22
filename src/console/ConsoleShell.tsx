import React from 'react';
import {Box, Text} from 'ink';
import {Composer} from '../composer/Composer.js';
import {ConversationStory} from '../conversation/ConversationStory.js';
import {LauncherOverlay, planLauncher} from '../launcher/LauncherOverlay.js';
import {frame} from '../layout/frame.js';
import {palette} from '../theme/palette.js';
import type {TerminalSize} from '../utils/useTerminalSize.js';

type ConsoleShellProps = {
  size: TerminalSize;
  composerValue: string;
  composerCursor: number;
  launcherOpen: boolean;
  selectedIndex: number;
};

const SUBTITLE = 'signal calm / story view / no engine connection / local visual prototype';
const LAUNCHER_HINT = '- hidden details available through contextual launcher -';

// The title line and the composer are the shell; everything else is chrome.
const TITLE_ROWS = 1;
const COMPOSER_ROWS = 4;

// What a line of this text costs once the terminal has wrapped it.
const wrappedRows = (text: string, width: number) => Math.max(1, Math.ceil(text.length / Math.max(1, width)));

export function ConsoleShell({
  size,
  composerValue,
  composerCursor,
  launcherOpen,
  selectedIndex
}: ConsoleShellProps) {
  // Everything spans the window. `width` is the room INSIDE the box's one
  // column of padding — handing the children the outer width instead asked
  // each of them for two columns more than they had, which Ink then clipped.
  const {boxWidth, boxHeight: shellHeight, width} = frame(size);

  // Richest arrangement that still fits, the way the welcome page plans its
  // own. A short window used to overflow instead of shedding anything: at
  // 60x18 the shell drew 23 rows into 18, and the terminal scrolled on every
  // repaint. The transcript is what has to survive, so the chrome goes first.
  //
  // The launcher rises from the composer rather than replacing the story, so
  // it takes its rows from the same budget. It is planned against the room
  // actually left and lists fewer surfaces rather than drawing past the frame;
  // on a window too small to hold even its border it does not open at all,
  // which is the honest answer when there is nowhere to put it.
  const panel = launcherOpen ? planLauncher(width, shellHeight - TITLE_ROWS - COMPOSER_ROWS - 1) : null;

  let spare = shellHeight - TITLE_ROWS - COMPOSER_ROWS - (panel ? panel.rows + 1 : 0);

  const subtitleRows = 1 + wrappedRows(SUBTITLE, width);
  const showSubtitle = spare - subtitleRows >= 3;
  if (showSubtitle) spare -= subtitleRows;

  const hintRows = 1 + wrappedRows(LAUNCHER_HINT, width);
  const showHint = !launcherOpen && spare - hintRows >= 2;
  if (showHint) spare -= hintRows;

  // One blank row of air above the transcript, if there is any to spare.
  const storyMargin = spare > 2 ? 1 : 0;
  const storyRows = Math.max(0, spare - storyMargin);

  return (
    <Box flexDirection="column" width={boxWidth} minHeight={shellHeight} paddingX={1}>
      <Box justifyContent="space-between" width={width}>
        <Box>
          <Text color={palette.cyan} bold>
            DRAGON
          </Text>
          <Text color={palette.muted}> / operating console</Text>
        </Box>
        <Text color={palette.amber}>mock mode</Text>
      </Box>

      {showSubtitle && (
        <Box marginTop={1} width={width}>
          <Text color={palette.dim} wrap="wrap">
            {SUBTITLE}
          </Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={storyMargin} flexGrow={1}>
        <ConversationStory width={width} maxRows={storyRows} dimmed={launcherOpen} />
        {showHint && (
          <Box marginTop={1} width={width}>
            <Text color={palette.dim} wrap="wrap">
              {LAUNCHER_HINT}
            </Text>
          </Box>
        )}
      </Box>

      {panel && <LauncherOverlay selectedIndex={selectedIndex} width={width} plan={panel} />}

      <Composer value={composerValue} cursor={composerCursor} width={width} focused={!launcherOpen} />
    </Box>
  );
}
