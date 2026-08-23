import {visibleWidth} from './style.js';

// The screen this program owns, and how a frame reaches it.
//
// Measured from Claude Code's own binary, driven in a real pty (see
// ARCHITECTURE.md). Every frame it paints has this shape:
//
//     ESC[?2026h   ESC[H   …content…   ESC[J   ESC[?2026l
//
// and nothing else: no cursor-up, no erase-line. The four parts each answer a
// failure that the obvious approach walks into.
//
//   * **Synchronized output** (DEC private mode 2026) asks the terminal to
//     compose the update off screen and present it whole. A terminal that does
//     not implement it ignores both sequences and loses nothing.
//
//   * **Home** rather than walking back over the last frame. Walking back is
//     counted in lines, and a terminal that scrolled once — or that reflowed a
//     line when the window narrowed — puts the cursor somewhere the count does
//     not describe. Homing cannot drift.
//
//   * **Erase to end of display, after the content, once.** Not before it:
//     erasing first leaves the screen genuinely empty between the erase and the
//     write, and at ten frames a second that is what the eye reads as blinking.
//
//   * **The alternate buffer**, so the user's scrollback is theirs and comes
//     back untouched when this exits.

const ESC = '\u001B';

const BEGIN_SYNC = `${ESC}[?2026h`;
const END_SYNC = `${ESC}[?2026l`;
const HOME = `${ESC}[H`;
const ERASE_TO_END = `${ESC}[J`;
const ENTER_ALT = `${ESC}[?1049h`;
const LEAVE_ALT = `${ESC}[?1049l`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
// Autowrap off while we own the screen. A row that fills the last column leaves
// the cursor in a deferred-wrap state, and what happens next is a terminal's own
// business — none of it ours. With wrap off, a full width row is just a full
// width row. Restored on the way out, because the shell after us expects it.
const WRAP_OFF = `${ESC}[?7l`;
const WRAP_ON = `${ESC}[?7h`;
const at = (row: number) => `${ESC}[${row};1H`;

let held = false;

/** Take the screen. Idempotent, and a no-op when this is not a terminal. */
export function takeScreen(out: NodeJS.WriteStream = process.stdout): void {
  if (held || !out.isTTY) return;
  held = true;
  out.write(ENTER_ALT + WRAP_OFF + HIDE_CURSOR);
}

/** Give it back. Safe to call when it was never taken. */
export function releaseScreen(out: NodeJS.WriteStream = process.stdout): void {
  if (!held) return;
  held = false;
  out.write(SHOW_CURSOR + WRAP_ON + LEAVE_ALT);
}

// A screen left held outlives the process that held it: the user's shell comes
// back to a buffer they cannot scroll. Registered once, here, so no caller has
// to remember.
process.once('exit', () => releaseScreen());
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    releaseScreen();
    process.exit(0);
  });
}

/**
 * Put one whole frame on the screen. `rows` are lines of text, already laid out.
 *
 * EVERY CELL IS WRITTEN. The obvious version — home, join the rows with
 * newlines, erase to end — does not paint a frame; it prints text over text.
 * `ESC[J` erases from where the cursor ENDS, so it clears what is below the
 * last row and nothing to the right of any row above it. A row that got shorter
 * leaves the tail of the row that was there before it, still lit.
 *
 * Nothing reveals this like a resize, where every row changes length at once:
 * it is the streaked, half-erased screen that made the previous project
 * unusable, and it survived the rebuild because the recording of a session
 * shows the bytes sent and not the screen they land on.
 *
 * So: position each row absolutely, pad it to the full width, and erase only
 * what is below the last one. Absolute positioning also means a row can fill
 * the last column without the next row's placement depending on how this
 * terminal handles the wrap.
 */
export function paint(rows: readonly string[], out: NodeJS.WriteStream = process.stdout): void {
  const width = out.columns || 80;
  let frame = BEGIN_SYNC;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const gap = width - visibleWidth(row);
    frame += at(i + 1) + (gap > 0 ? row + ' '.repeat(gap) : row);
  }
  out.write(frame + ERASE_TO_END + END_SYNC);
}

/**
 * What the window is, right now, read at the moment of use.
 *
 * Never cached and never clamped upward. Reporting a size larger than the
 * terminal makes every line wrap, the frame grow past the viewport, and the
 * whole picture judder on each repaint — a screen that wants a minimum has to
 * handle not getting it.
 */
export function screenSize(out: NodeJS.WriteStream = process.stdout): {columns: number; rows: number} {
  return {columns: out.columns || 80, rows: out.rows || 24};
}
