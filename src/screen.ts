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

let held = false;

/** Take the screen. Idempotent, and a no-op when this is not a terminal. */
export function takeScreen(out: NodeJS.WriteStream = process.stdout): void {
  if (held || !out.isTTY) return;
  held = true;
  out.write(ENTER_ALT + HIDE_CURSOR);
}

/** Give it back. Safe to call when it was never taken. */
export function releaseScreen(out: NodeJS.WriteStream = process.stdout): void {
  if (!held) return;
  held = false;
  out.write(SHOW_CURSOR + LEAVE_ALT);
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

/** Put one whole frame on the screen. `rows` are lines of text, already laid out. */
export function paint(rows: readonly string[], out: NodeJS.WriteStream = process.stdout): void {
  out.write(BEGIN_SYNC + HOME + rows.join('\n') + ERASE_TO_END + END_SYNC);
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
