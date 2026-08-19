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

const rowsFor = (item: StoryItem, first: boolean) => (first ? 0 : 1) + 1 + (item.detail?.length ?? 0);

// Keeps the newest exchanges when the panel above leaves less room, the way a
// transcript scrolls rather than truncating from the end.
function fitToRows(items: StoryItem[], maxRows: number) {
  if (maxRows <= 0) return {items: [] as StoryItem[], hidden: items.length};
  const kept: StoryItem[] = [];
  let used = 0;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!;
    const cost = rowsFor(item, kept.length === 0);
    if (used + cost > maxRows) break;
    used += cost;
    kept.unshift(item);
  }
  return {items: kept, hidden: items.length - kept.length};
}

type ConversationStoryProps = {
  size: TerminalSize;
  maxRows?: number;
  dimmed?: boolean;
};

export function ConversationStory({size, maxRows, dimmed}: ConversationStoryProps) {
  const maxWidth = Math.min(size.width - 4, 104);
  const {items, hidden} = fitToRows(story, maxRows ?? Number.POSITIVE_INFINITY);

  return (
    <Box flexDirection="column" width={maxWidth} paddingX={1}>
      {hidden > 0 && (
        <Text color={palette.dim} dimColor>
          {`   ${hidden} earlier ${hidden === 1 ? 'entry' : 'entries'} above`}
        </Text>
      )}

      {items.map((item, index) => (
        <Box key={item.id} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
          <Box>
            <Text color={dimmed ? palette.muted : toneColor[item.tone]} bold={!dimmed} dimColor={dimmed}>
              {`${prefixFor(item).padEnd(3, ' ')}${item.label.padEnd(12, ' ')}`}
            </Text>
            <Text
              color={dimmed ? palette.muted : item.tone === 'user' ? palette.ink : palette.cyanSoft}
              dimColor={dimmed}
              wrap="wrap"
            >
              {item.text}
            </Text>
          </Box>

          {item.detail && (
            <Box flexDirection="column" marginLeft={17} marginTop={0}>
              {item.detail.map(detail => (
                <Text
                  key={detail}
                  color={dimmed ? palette.dim : item.tone === 'tool' ? palette.cyanSoft : palette.muted}
                  dimColor
                >
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
