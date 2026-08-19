// Ink repaints the whole frame every tick, and it does it by ERASING the
// previous lines first and writing the new ones after. Between those two the
// screen genuinely holds nothing: replayed through a terminal emulator from a
// real pty recording, every frame passed through a state with zero rows of text
// before filling back to fourteen. At fourteen frames a second that is what the
// eye reads as the picture blinking.
//
// This is a full screen program, so it paints the way one should:
//
//   * it takes the alternate screen buffer, which means it owns the display and
//     hands the user's scrollback back untouched on exit;
//   * each frame starts by homing the cursor rather than walking back over the
//     last one, so a single scroll can never drift the frame down a line — which
//     it did, leaving one row of the dragon printed twice;
//   * each line clears to the end of the line AFTER its content is written, and
//     the frame clears to the end of the screen after the last line, so nothing
//     is ever erased before the thing replacing it has been drawn;
//   * the whole frame is wrapped in DEC private mode 2026, synchronized output,
//     which asks the terminal to compose the update off screen and present it
//     in one piece. Terminals that do not implement it ignore both sequences.
const ESC = '\u001B';
const BEGIN_SYNC = `${ESC}[?2026h`;
const END_SYNC = `${ESC}[?2026l`;
const HOME = `${ESC}[H`;
const CLEAR_LINE_END = `${ESC}[K`;
const CLEAR_BELOW = `${ESC}[J`;
const ENTER_ALT = `${ESC}[?1049h`;
const LEAVE_ALT = `${ESC}[?1049l`;

// What ansi-escapes' eraseLines() emits: erase-line and cursor-up in pairs,
// closed by a move to column one.
const ERASE = new RegExp(`^(?:${ESC}\\[2K(?:${ESC}\\[1A)?)+${ESC}\\[G`);

export function synchronized(stream: NodeJS.WriteStream): NodeJS.WriteStream {
  let entered = false;

  const leave = () => {
    if (!entered) return;
    entered = false;
    stream.write(LEAVE_ALT);
  };

  const enter = () => {
    if (entered || !stream.isTTY) return;
    entered = true;
    stream.write(ENTER_ALT);
    process.once('exit', leave);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        leave();
        process.exit(0);
      });
    }
  };

  return new Proxy(stream, {
    get(target, property) {
      if (property === 'write') {
        return (chunk: unknown, ...rest: unknown[]) => {
          const write = target.write as (...args: unknown[]) => boolean;
          if (typeof chunk !== 'string') return write.call(target, chunk, ...rest);

          const erase = ERASE.exec(chunk);
          const body = erase ? chunk.slice(erase[0].length) : chunk;
          // Anything that is not a frame — the cursor hide on startup, the show
          // on exit — passes through unchanged.
          if (!body.includes('\n')) return write.call(target, chunk, ...rest);

          enter();
          const lines = body.split('\n').map(line => line + CLEAR_LINE_END);
          return write.call(target, BEGIN_SYNC + HOME + lines.join('\n') + CLEAR_BELOW + END_SYNC, ...rest);
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
