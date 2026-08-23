#!/usr/bin/env node
import {draw, emptyState, spinnerFrame, scrollBy, type Block, type State} from './console.js';
import {onKey, type Key} from './keys.js';
import {advance, openingRows, skipOpening, startOpening, TICK_MS, type Opening} from './opening.js';
import {paint, releaseScreen, screenSize, takeScreen} from './screen.js';

// The loop. It owns the screen, turns keys into state, and paints.
//
// One frame is drawn per change, and nothing is drawn otherwise — a console
// that repaints on a timer burns a terminal's night for no reason. The two
// clocks here are the opening, which stops itself, and the spinner, which
// returns immediately when nothing is in flight.
//
// The opening is a state of this loop rather than a stage before it. There is
// no handover and no second screen: `show()` chooses which rows to paint, and
// that is the whole of it.

let opening: Opening = startOpening();
let state: State = emptyState();

const show = () => {
  if (!opening.done) {
    const {columns, rows} = screenSize();
    paint(openingRows(opening.tick, columns, rows));
    return;
  }
  state = draw(state);
};

function edit(change: (s: State) => State) {
  state = change(state);
  show();
}

// A NUL byte is not a keypress. It arrives when stdin is not a keyboard, and it
// once skipped the opening before it had drawn a single frame. It reaches here
// as ctrl+backtick -- a chord, and printable once decoded -- so neither "has a
// name" nor "has text" rules it out on its own. Chords are ruled out instead: a
// person skipping an animation presses a key, not a combination.
const isRealKey = (k: Key) => !k.ctrl && (k.name !== '' || [...k.text].some(c => c >= ' '));

function key(k: Key) {
  if (k.ctrl && k.text === 'c') {
    stop();
    releaseScreen();
    process.exit(0);
  }

  // Any key during the opening ends it, and does nothing else — the keystroke
  // that skips is not also the first character of a goal.
  if (!opening.done) {
    if (isRealKey(k)) {
      opening = skipOpening(opening);
      show();
    }
    return;
  }

  switch (k.name) {
    case 'pageUp':
      return edit(s => scrollBy(s, {kind: 'page', delta: -1}));
    case 'pageDown':
      return edit(s => scrollBy(s, {kind: 'page', delta: 1}));
    case 'up':
      return edit(s => scrollBy(s, {kind: 'lines', delta: -1}));
    case 'down':
      return edit(s => scrollBy(s, {kind: 'lines', delta: 1}));
    case 'home':
      return edit(s => scrollBy(s, {kind: 'top'}));
    case 'end':
      return edit(s => scrollBy(s, {kind: 'bottom'}));
    case 'left':
      return edit(s => ({...s, caret: Math.max(0, s.caret - 1)}));
    case 'right':
      return edit(s => ({...s, caret: Math.min(s.input.length, s.caret + 1)}));
    case 'backspace':
      return edit(s =>
        s.caret === 0
          ? s
          : {...s, input: s.input.slice(0, s.caret - 1) + s.input.slice(s.caret), caret: s.caret - 1}
      );
    case 'enter':
      return edit(s => {
        const said = s.input.trim();
        if (said === '') return s;
        const block: Block = {id: `you-${s.blocks.length}`, tone: 'user', label: 'YOU', text: said};
        // Scrolling to the end on a new block is the console following the
        // conversation. A reader who had scrolled back keeps their place —
        // `following` is what decides, and it is the viewport's to decide.
        return {...s, blocks: [...s.blocks, block], input: '', caret: 0};
      });
    default:
      break;
  }

  if (k.ctrl || k.text === '') return;
  edit(s => ({
    ...s,
    input: s.input.slice(0, s.caret) + k.text + s.input.slice(s.caret),
    caret: s.caret + k.text.length
  }));
}

// A resize is a repaint, not an adjustment (rule 4). Nothing is reconciled:
// the same state produces a different list of rows at the new size. True of the
// opening too, which is why it holds no measurement of its own.
const onResize = () => show();

takeScreen();
const stop = onKey(key);
process.stdout.on('resize', onResize);

const curtain = setInterval(() => {
  if (opening.done) {
    clearInterval(curtain);
    show();
    return;
  }
  opening = advance(opening);
  show();
}, TICK_MS);
curtain.unref();

const spin = setInterval(() => {
  if (!opening.done || !state.live) return;
  edit(s => ({...s, spinner: s.spinner + 1, live: {...s.live!, mark: spinnerFrame(s.spinner + 1)}}));
}, 90);
spin.unref();

show();
