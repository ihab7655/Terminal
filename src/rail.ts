// How a screen says what it is.
//
// A title set into the line itself, a status at the far end, and no side walls:
//
//   ╭── DRAGON / console ───────────────────────── engine online ─╮
//
// Taken from the prototype this console's design comes from
// (github.com/ihab7655/trakdem, src/theme/Rail.tsx), where it is the one piece
// of chrome every screen shares — and the reason two surfaces of the same
// console look related as either one changes.
//
// It is lighter than a box on purpose. A box spends four rows on chrome before
// naming anything, and on a small window that is the whole budget.

import {colour, paint as tint} from './style.js';
import {width as columnsOf} from './text.js';

export type RailEdge = 'top' | 'bottom';

const CORNER: Record<RailEdge, [string, string]> = {
  top: ['╭', '╮'],
  bottom: ['╰', '╯']
};

// Below this the line stops reading as a rail and starts reading as a hyphen.
const MIN_FILL = 2;

/**
 * One rail, exactly as wide as it is told.
 *
 * What does not fit is what gives way — never the width. The status goes first
 * and goes WHOLE, because half a status says nothing; the title is what the
 * screen IS, so it is the last thing cut.
 */
export function rail(width: number, edge: RailEdge, title = '', status = ''): string {
  if (width <= 0) return '';
  const [left, right] = CORNER[edge];
  const head = `${left}── `;
  // The space before the closing corner sets a status off from the line. With
  // no status there is nothing to set off, and the gap reads as the rail
  // breaking before it ends.
  const tailFor = (note: string) => (note ? ` ─${right}` : `─${right}`);

  let note = status;
  let name = title;
  const cost = () =>
    head.length +
    (name ? columnsOf(name) + 1 : 0) +
    (note ? columnsOf(note) + 1 : 0) +
    tailFor(note).length;

  if (cost() + MIN_FILL > width) note = '';
  const tail = tailFor(note);
  const room = width - head.length - tail.length - (note ? columnsOf(note) + 1 : 0) - MIN_FILL - 1;
  if (columnsOf(name) > room) name = room > 1 ? [...name].slice(0, room - 1).join('') + '…' : '';

  const fill = Math.max(0, width - cost());
  // Nothing named fits at all: the rail is a rail and nothing else.
  if (fill === 0 && cost() > width) return tint('─'.repeat(width), colour.dim);

  return (
    tint(head, colour.dim) +
    (name ? tint(name, colour.ink) : '') +
    tint(`${name ? ' ' : ''}${'─'.repeat(fill)}${note ? ' ' : ''}`, colour.dim) +
    (note ? tint(note, colour.amber) : '') +
    tint(tail, colour.dim)
  );
}

/** What a rail costs a layout, so a screen can budget for it without drawing one. */
export const RAIL_ROWS = 1;
