import React from 'react';
import {Box, Text} from 'ink';
import {useTicker} from '../animation/useTicker.js';
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

const TICK_MS = 90;
const ITEM_DWELL = 8;
const USER_DWELL = 4;
const DETAIL_DWELL = 2;
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// The story plays out once, so the schedule is fixed and built at load.
type Beat = {start: number; end: number; detailAt: number[]};

const beats: Beat[] = [];
let cursor = 0;
for (const item of story) {
  const details = item.detail?.length ?? 0;
  const dwell = (item.tone === 'user' ? USER_DWELL : ITEM_DWELL) + details * DETAIL_DWELL;
  beats.push({
    start: cursor,
    end: cursor + dwell,
    detailAt: Array.from({length: details}, (_, index) => cursor + 2 + index * DETAIL_DWELL)
  });
  cursor += dwell;
}
const STORY_TICKS = cursor;

const prefixFor = (item: StoryItem, working: boolean, tick: number) => {
  if (working) return SPINNER[tick % SPINNER.length]!;
  if (item.tone === 'tool' && item.status === 'complete') return 'OK';
  if (item.status === 'active') return '>>';
  if (item.tone === 'user') return '::';
  return '--';
};

type Entry = {item: StoryItem; details: string[]; working: boolean};

const rowsFor = (entry: Entry, first: boolean) => (first ? 0 : 1) + 1 + entry.details.length;

// Keeps the newest exchanges when the panel below leaves less room, the way a
// transcript scrolls rather than truncating from the end.
function fitToRows(entries: Entry[], maxRows: number) {
  if (maxRows <= 0) return {entries: [] as Entry[], hidden: entries.length};
  const kept: Entry[] = [];
  let used = 0;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    const cost = rowsFor(entry, kept.length === 0);
    if (used + cost > maxRows) break;
    used += cost;
    kept.unshift(entry);
  }
  return {entries: kept, hidden: entries.length - kept.length};
}

type ConversationStoryProps = {
  size: TerminalSize;
  maxRows?: number;
  dimmed?: boolean;
};

export function ConversationStory({size, maxRows, dimmed}: ConversationStoryProps) {
  const tick = useTicker(TICK_MS, STORY_TICKS);
  const maxWidth = Math.min(size.width - 4, 104);

  const revealed: Entry[] = [];
  for (const [index, item] of story.entries()) {
    const beat = beats[index]!;
    if (tick < beat.start) break;
    revealed.push({
      item,
      details: (item.detail ?? []).filter((_, at) => tick >= beat.detailAt[at]!),
      // A step spins until the next one starts; the user's own line never does.
      working: item.tone !== 'user' && tick < beat.end
    });
  }

  const {entries, hidden} = fitToRows(revealed, maxRows ?? Number.POSITIVE_INFINITY);

  return (
    <Box flexDirection="column" width={maxWidth} paddingX={1}>
      {hidden > 0 && (
        <Text color={palette.dim} dimColor>
          {`   ${hidden} earlier ${hidden === 1 ? 'entry' : 'entries'} above`}
        </Text>
      )}

      {entries.map(({item, details, working}, index) => (
        <Box key={item.id} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
          <Box>
            <Text color={dimmed ? palette.muted : toneColor[item.tone]} bold={!dimmed} dimColor={dimmed}>
              {`${prefixFor(item, working && !dimmed, tick).padEnd(3, ' ')}${item.label.padEnd(12, ' ')}`}
            </Text>
            <Text
              color={dimmed ? palette.muted : item.tone === 'user' ? palette.ink : palette.cyanSoft}
              dimColor={dimmed}
              wrap="wrap"
            >
              {item.text}
            </Text>
          </Box>

          {details.length > 0 && (
            <Box flexDirection="column" marginLeft={17} marginTop={0}>
              {details.map(detail => (
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
