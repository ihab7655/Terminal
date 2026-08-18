import React from 'react';
import {Box, Text} from 'ink';
import {story, type StoryItem, type StoryTone} from '../data/fakeConversation.js';
import {palette} from '../theme/palette.js';
import type {TerminalSize} from '../utils/useTerminalSize.js';

const toneColor: Record<StoryTone, string> = {
  user: palette.ink,
  engine: palette.cyan,
  search: palette.amber,
  tool: palette.purple,
  event: palette.muted
};

const prefixFor = (item: StoryItem) => {
  if (item.tone === 'tool' && item.status === 'complete') return 'OK';
  if (item.status === 'active') return '>>';
  if (item.tone === 'user') return '::';
  return '--';
};

export function ConversationStory({size}: {size: TerminalSize}) {
  const maxWidth = Math.min(size.width - 4, 104);

  return (
    <Box flexDirection="column" width={maxWidth} paddingX={1}>
      {story.map((item, index) => (
        <Box key={item.id} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
          <Box>
            <Text color={toneColor[item.tone]} bold>
              {`${prefixFor(item).padEnd(3, ' ')}${item.label.padEnd(12, ' ')}`}
            </Text>
            <Text color={item.tone === 'user' ? palette.ink : palette.cyanSoft} wrap="wrap">
              {item.text}
            </Text>
          </Box>

          {item.detail && (
            <Box flexDirection="column" marginLeft={17} marginTop={0}>
              {item.detail.map(detail => (
                <Text key={detail} color={item.tone === 'tool' ? palette.cyanSoft : palette.muted} dimColor>
                  {`   ${detail}`}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
