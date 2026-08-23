// A window onto content taller than the screen.
//
// THIS FILE IS RULE 3. Owning the screen means content will not fit, and there
// are exactly two answers to that. One of them is wrong:
//
//   scroll  — the window moves over the content; nothing is lost
//   shed    — the content is cut to fit; the oldest is thrown away
//
// The previous attempt shed. It had `fitToRows`, a row budget, and a line
// reading "N earlier entries above" — which is a program telling its user it
// has discarded their history because it could not think of anywhere to put
// it. That is what made it feel like fighting the terminal rather than using
// a screen.
//
// So: nothing here drops a line, and nothing here is allowed to. The only
// number this module owns is WHERE THE WINDOW SITS.

export type Viewport = {
  /** Rows from the top of the content to the top of the window. */
  readonly offset: number;
  /** True when the window sits at the very end, which is where it starts. */
  readonly following: boolean;
};

export const START: Viewport = {offset: 0, following: true};

export type ScrollCommand =
  | {kind: 'lines'; delta: number}
  | {kind: 'halfPage'; delta: -1 | 1}
  | {kind: 'page'; delta: -1 | 1}
  | {kind: 'top'}
  | {kind: 'bottom'};

/**
 * Where the window sits after a command.
 *
 * `following` is the state, not a side effect: a console that is being written
 * to should keep showing the newest line, and should STOP doing that the
 * moment the reader scrolls up — otherwise the next event yanks the screen out
 * from under them. Scrolling back to the end resumes it.
 */
export function scroll(
  view: Viewport,
  command: ScrollCommand,
  contentRows: number,
  windowRows: number
): Viewport {
  const maxOffset = Math.max(0, contentRows - windowRows);
  const from = view.following ? maxOffset : view.offset;

  const step =
    command.kind === 'lines'
      ? command.delta
      : command.kind === 'halfPage'
        ? command.delta * Math.max(1, Math.floor(windowRows / 2))
        : command.kind === 'page'
          ? command.delta * Math.max(1, windowRows - 1)
          : 0;

  const next =
    command.kind === 'top' ? 0 : command.kind === 'bottom' ? maxOffset : clamp(from + step, 0, maxOffset);

  return {offset: next, following: next >= maxOffset};
}

/**
 * The rows to draw, and what the reader should be told about what is off
 * screen. Nothing is discarded — `above` and `below` are counts of rows the
 * window is not over, and they exist so the console can say so honestly.
 */
export function windowOnto(
  content: readonly string[],
  view: Viewport,
  windowRows: number
): {rows: string[]; above: number; below: number} {
  const maxOffset = Math.max(0, content.length - windowRows);
  const offset = clamp(view.following ? maxOffset : view.offset, 0, maxOffset);
  return {
    rows: content.slice(offset, offset + windowRows),
    above: offset,
    below: Math.max(0, content.length - offset - windowRows)
  };
}

/**
 * A resize does not adjust the window, it recomputes it (rule 4). Following
 * stays following; a reader who had scrolled up keeps the same first row in
 * view rather than being moved by an arithmetic they did not ask for.
 */
export function reflow(view: Viewport, contentRows: number, windowRows: number): Viewport {
  const maxOffset = Math.max(0, contentRows - windowRows);
  if (view.following) return {offset: maxOffset, following: true};
  const offset = clamp(view.offset, 0, maxOffset);
  return {offset, following: offset >= maxOffset};
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
