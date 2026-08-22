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
const PREFIX_COLS = 3;
const NAME_COLS = 12;
const LABEL_COLS = PREFIX_COLS + NAME_COLS;
// Details hang further in again, under the message rather than under the label.
const DETAIL_COLS = LABEL_COLS + 5;

// The transcript wraps its own text rather than handing it to Ink, for two
// reasons. Counting the text as one row was the first bug: at 60 columns every
// entry wrapped to two or three, and the transcript spent nine rows where five
// had been budgeted, so the frame grew past the terminal and it scrolled on
// every repaint. Wrapping it here and counting the same lines makes the budget
// and the drawing agree by construction rather than by two wrappers happening
// to reach the same answer.
//
// The second was alignment. Left to Ink, the text is a flex sibling of the
// label and its continuation lines settle against a different edge: measured
// at 62 columns, every wrapped line began exactly three columns to the left of
// the line it continued — 17 then 14 for an entry, 22 then 19 for a detail.
// Drawn a line at a time under an indent of our own, they cannot drift.
function wrapLines(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= width) line += ' ' + word;
    else { lines.push(line); line = word; }
    // A single word longer than the line is broken across as many as it needs.
    while (line.length > width) {
      lines.push(line.slice(0, width));
      line = line.slice(width);
    }
  }
  lines.push(line);
  return lines;
}

const rowsFor = (entry: Entry, first: boolean, width: number) =>
  (first ? 0 : 1) +
  wrapLines(entry.item.text, width - LABEL_COLS).length +
  entry.details.reduce((sum, detail) => sum + wrapLines(detail, width - DETAIL_COLS).length, 0);

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
  const inner = width - 2;
  const budget = maxRows ?? Number.POSITIVE_INFINITY;
  const {entries, hidden} = fitToRows(revealed, budget, inner);

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

      {entries.map(({item, details, working}, index) => {
        const label =
          prefixFor(item, working && !dimmed, tick).padEnd(PREFIX_COLS, ' ') +
          item.label.padEnd(NAME_COLS, ' ');
        const messageColor = dimmed ? palette.muted : item.tone === 'user' ? palette.ink : palette.cyanSoft;
        const detailColor = dimmed ? palette.dim : item.tone === 'tool' ? palette.cyanSoft : palette.muted;

        // Each row is ONE Text. The label and the message are nested inside it,
        // which styles them inline instead of making them two flex children
        // laid out against edges of their own.
        return (
          <Box key={item.id} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
            {wrapLines(item.text, inner - LABEL_COLS).map((line, at) => (
              <Text key={at}>
                <Text color={dimmed ? palette.muted : toneColor[item.tone]} bold={!dimmed} dimColor={dimmed}>
                  {at === 0 ? label : ' '.repeat(LABEL_COLS)}
                </Text>
                <Text color={messageColor} dimColor={dimmed}>
                  {line}
                </Text>
              </Text>
            ))}

            {details.flatMap(detail =>
              wrapLines(detail, inner - DETAIL_COLS).map((line, at) => (
                <Text key={`${detail}-${at}`}>
                  <Text>{' '.repeat(DETAIL_COLS)}</Text>
                  <Text color={detailColor} dimColor>
                    {line}
                  </Text>
                </Text>
              ))
            )}
          </Box>
        );
      })}
    </Box>
  );
}
