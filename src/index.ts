#!/usr/bin/env node
import {draw, emptyState, spinnerFrame, scrollBy, type Block, type State} from './console.js';
import {onKey, type Key} from './keys.js';
import {releaseScreen, takeScreen} from './screen.js';

// The loop. It owns the screen, turns keys into state, and paints.
//
// One frame is drawn per change, and nothing is drawn otherwise — a console
// that repaints on a timer burns a terminal's night for no reason. The spinner
// is the one thing with a clock, and it stops the moment nothing is in flight.

let state: State = emptyState();
const show = () => {
  state = draw(state);
};

function edit(change: (s: State) => State) {
  state = change(state);
  show();
}

function key(k: Key) {
  if (k.ctrl && k.text === 'c') {
    stop();
    releaseScreen();
    process.exit(0);
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
// the same state produces a different list of rows at the new size.
const onResize = () => show();

takeScreen();
const stop = onKey(key);
process.stdout.on('resize', onResize);

const spin = setInterval(() => {
  if (!state.live) return;
  edit(s => ({...s, spinner: s.spinner + 1, live: {...s.live!, mark: spinnerFrame(s.spinner + 1)}}));
}, 90);
spin.unref();

show();
