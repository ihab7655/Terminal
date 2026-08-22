import React from 'react';
import {Box, Text} from 'ink';
import {launcherItems} from '../data/fakeConversation.js';
import {palette} from '../theme/palette.js';
import {clamp} from '../utils/clamp.js';
import {fit} from '../utils/pad.js';
import {ContextualView} from '../views/ContextualView.js';

const LIST_COLS = 24;
const DIVIDER_COLS = 5;
// Under this the contextual view is a sliver. At 40 columns it was left nine of
// them, every word wrapped onto a line of its own, and the panel grew to 137
// rows inside a twelve row terminal. Narrower than this, the panel is the list.
const MIN_VIEW_COLS = 30;

// The panel's border and vertical padding.
const CHROME_ROWS = 4;
// COMMAND FIELD, its subtitle, and the gap under them.
const LIST_HEADER_ROWS = 3;
// The view's own padding, title, gap, hint, gap, gap and footer — everything
// except the entries themselves.
const VIEW_CHROME_ROWS = 8;

// Below this there is no panel worth drawing: its border and padding alone
// take four rows, and a list of nothing is not a launcher.
const MIN_PANEL_ROWS = CHROME_ROWS + 1;

export type LauncherPlan = {
  /** Rows the panel occupies, excluding the blank row above it. */
  rows: number;
  items: number;
  entries: number;
  view: boolean;
  header: boolean;
};

// The panel used to be a constant fifteen rows tall whatever the window was,
// which is why a short one overflowed: at 60x18 it wanted fifteen of the
// sixteen rows the shell had, leaving nothing for the title or the composer.
// It now takes what it is given and shows less — fewer surfaces, fewer entries,
// and on a narrow window no contextual view at all.
export function planLauncher(width: number, maxRows: number): LauncherPlan | null {
  if (maxRows < MIN_PANEL_ROWS) return null;
  const view = width - 2 - LIST_COLS - DIVIDER_COLS >= MIN_VIEW_COLS;
  const room = maxRows - CHROME_ROWS;
  const header = room >= LIST_HEADER_ROWS + 2;
  const items = clamp(room - (header ? LIST_HEADER_ROWS : 0), 1, launcherItems.length);
  const entries = view ? Math.max(0, room - VIEW_CHROME_ROWS) : 0;
  const listRows = (header ? LIST_HEADER_ROWS : 0) + items;
  const viewRows = view ? VIEW_CHROME_ROWS + Math.min(entries, maxEntries) : 0;
  const rows = Math.min(maxRows, CHROME_ROWS + Math.max(listRows, viewRows));
  return {rows, items, entries, view, header};
}

const maxEntries = Math.max(...launcherItems.map(item => item.entries.length));

type LauncherOverlayProps = {
  selectedIndex: number;
  width: number;
  plan: LauncherPlan;
};

export function LauncherOverlay({selectedIndex, width, plan}: LauncherOverlayProps) {
  const selected = launcherItems[selectedIndex] ?? launcherItems[0]!;
  const overlayWidth = width - 2;
  const listWidth = plan.view ? LIST_COLS : overlayWidth - 2;
  const viewWidth = overlayWidth - LIST_COLS - DIVIDER_COLS;

  // The list scrolls to keep the selection in view once it cannot show every
  // surface at once.
  const first = clamp(selectedIndex - Math.floor((plan.items - 1) / 2), 0, Math.max(0, launcherItems.length - plan.items));
  const shown = launcherItems.slice(first, first + plan.items);

  return (
    // The height is stated rather than derived, and anything past it is cut.
    // Predicting the panel's height from its contents was off by a row, and a
    // row the shell did not budget for is a row past the bottom of the window.
    <Box
      width={overlayWidth}
      height={plan.rows}
      overflowY="hidden"
      marginTop={1}
      borderStyle="single"
      borderColor={palette.dim}
      paddingX={1}
      paddingY={1}
    >
      <Box flexDirection="column" width={listWidth} marginRight={plan.view ? 2 : 0}>
        {plan.header && (
          <>
            <Text color={palette.amber}>COMMAND FIELD</Text>
            <Text color={palette.muted} dimColor>
              choose surface
            </Text>
          </>
        )}
        <Box flexDirection="column" marginTop={plan.header ? 1 : 0}>
          {shown.map(item => {
            const index = launcherItems.indexOf(item);
            const active = index === selectedIndex;
            return (
              <Box key={item.id}>
                <Text color={active ? palette.cyan : palette.dim}>
                  {active ? '>' : ' '} {index + 1}
                </Text>
                {/* Truncated, never wrapped: the panel has a fixed height, so a
                    line that wraps steals a row from something below it. */}
                <Text color={active ? palette.ink : palette.cyanSoft}>
                  {' ' + fit(item.label, Math.max(0, listWidth - 4))}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {plan.view && (
        <>
          <Box>
            <Text color={palette.dim}>|</Text>
          </Box>
          <ContextualView item={selected} width={viewWidth} entries={plan.entries} />
        </>
      )}
    </Box>
  );
}
