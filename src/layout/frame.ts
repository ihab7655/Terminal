import type {TerminalSize} from '../utils/useTerminalSize.js';

// Every screen resolves its shape here, for two reasons.
//
// The first is that the caps used to be written out four separate times — 118
// in the welcome page, 118 in the diagnostics screen, 110 in the console shell,
// 104 in the transcript. Whatever the window was, the picture stopped growing
// at 119x34: at 160x50 it filled 74% of the width, at 240x70 barely half, and
// the rest of the terminal stayed empty. Zooming out made the app smaller, not
// larger, which is the opposite of what a full screen program should do.
//
// The second is the handoff. The welcome page hands over to the diagnostics
// screen and that one to the console, and Ink erases the previous frame by its
// LINE COUNT. Two consecutive frames of different shape leave a row unerased
// and the terminal tears. Having the three screens agree needs the arithmetic
// to be literally the same, not merely equal by coincidence today.
//
// So there is no ceiling — a ceiling is what the bug was. There are only
// floors, and they are low enough that they cannot exceed a real window: a
// terminal narrower than 26 columns or shorter than 9 rows does not exist.
const MIN_BOX_WIDTH = 26;
const MIN_BOX_HEIGHT = 9;

export type Frame = {
  /** The outer box, one column of padding on each side. All screens share it. */
  boxWidth: number;
  boxHeight: number;
  /**
   * Paintable area inside that padding. Text is given this whole width and
   * wraps inside it, the way the terminal itself wraps: a wider window means
   * longer lines, a narrower one means more of them, and nothing ever runs off
   * the right edge. There is deliberately no centred reading column.
   */
  width: number;
  height: number;
};

export function frame(size: TerminalSize): Frame {
  const boxWidth = Math.max(MIN_BOX_WIDTH, size.width - 2);
  const boxHeight = Math.max(MIN_BOX_HEIGHT, size.height - 2);
  return {boxWidth, boxHeight, width: boxWidth - 2, height: boxHeight - 1};
}
