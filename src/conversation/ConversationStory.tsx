import React from 'react';
import {Box, Text} from 'ink';
import {useTicker} from '../animation/useTicker.js';
import {story, type StoryItem, type StoryTone} from '../data/fakeConversation.js';
import {palette} from '../theme/palette.js';

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

// The label column: a three character prefix and a twelve character name.
const LABEL_COLS = 15;
// Details hang under the text, indented by the label plus their own two spaces.
const DETAIL_COLS = 17;

// How many rows a line of text costs once it has been wrapped to fit. Greedy
// word wrapping, which is what Ink does — counting the text as one row was the
// bug: at 60 columns every entry wrapped to two or three and the transcript
// spent nine rows where five had been budgeted, so the frame grew past the
// terminal and it scrolled on every repaint.
function wrappedRows(text: string, width: number) {
  if (width <= 0) return 1;
  let rows = 1;
  let used = 0;
  for (const word of text.split(' ')) {
    const cost = word.length;
    if (used === 0) {
      used = cost;
    } else if (used + 1 + cost <= width) {
      used += 1 + cost;
    } else {
      rows++;
      used = cost;
    }
    // A single word longer than the line is broken across as many as it needs.
    while (used > width) {
      rows++;
      used -= width;
    }
  }
  return rows;
}

const rowsFor = (entry: Entry, first: boolean, width: number) =>
  (first ? 0 : 1) +
  wrappedRows(entry.item.text, width - LABEL_COLS) +
  entry.details.reduce((sum, detail) => sum + wrappedRows(`   ${detail}`, width - DETAIL_COLS), 0);

// Keeps the newest exchanges when the panel below leaves less room, the way a
// transcript scrolls rather than truncating from the end.
function fitToRows(entries: Entry[], maxRows: number, width: number) {
  if (maxRows <= 0) return {entries: [] as Entry[], hidden: entries.length};
  const kept: Entry[] = [];
  let used = 0;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    const cost = rowsFor(entry, kept.length === 0, width);
    // Dropping an entry adds the "N earlier entries above" line, which needs a
    // row of its own and must be paid for out of the same budget.
    const banner = index > 0 ? 1 : 0;
    if (used + cost + banner > maxRows) break;
    used += cost;
    kept.unshift(entry);
  }
  return {entries: kept, hidden: entries.length - kept.length};
}

type ConversationStoryProps = {
  /** The reading measure the shell allotted. Text wraps inside it, never past it. */
  width: number;
  maxRows?: number;
  dimmed?: boolean;
};

export function ConversationStory({width, maxRows, dimmed}: ConversationStoryProps) {
  const tick = useTicker(TICK_MS, STORY_TICKS);

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

  // paddingX={1} on each side is what the entries actually get to wrap inside.
  const budget = maxRows ?? Number.POSITIVE_INFINITY;
  const {entries, hidden} = fitToRows(revealed, budget, width - 2);

  // Given no rows, take none. Returning the "N earlier entries above" banner
  // instead spent a row the shell had not budgeted, and opening the launcher
  // grew the frame by exactly that one line.
  if (budget <= 0) return null;

  return (
    <Box flexDirection="column" width={width} paddingX={1}>
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
