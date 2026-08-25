#!/usr/bin/env node
import {toItem} from './adapter.js';
import {draw, emptyState, scrollBy, type Item, type State} from './console.js';
import {isFailure, openEngine, type Engine} from './engine.js';
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

// The engine, once it answers. Absent means the console is usable and says so
// when asked to do something that needs one — not that it is broken.
let engine: Engine | null = null;
// The engine is opened while the opening plays, and a person can type before it
// answers. Recorded here rather than lost: "no engine" is only true once the
// door has actually reported, and saying it while the engine is still opening
// is the console lying about its own state — measured, a goal typed five
// seconds in was told there was nothing to run it against while the engine was
// on its way.
let engineOpening: Promise<void> | null = null;

const add = (item: Item) => edit(s => ({...s, items: [...s.items, item]}));

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
    case 'tab':
      // One switch for all captured output. Folding one call at a time would
      // need a selection — a cursor, keys to move it, a rendered highlight —
      // and that is a layer this does not have yet.
      return edit(s => ({...s, open: !s.open}));
    case 'enter':
      return edit(s => {
        const text = s.input.trim();
        if (text === '') return s;
        // Scrolling to the end on new content is the console following the
        // conversation. A reader who had scrolled back keeps their place —
        // `following` is what decides, and it is the viewport's to decide.
        // An unanswered question outranks a new goal: the engine is stopped
        // and waiting on this person, so what they type next is the answer.
        // Sending it as a fresh goal instead would leave the first one hanging
        // forever and start a second — the console deciding, wrongly, that the
        // question was rhetorical.
        const waiting = pendingQuestion(s);
        if (waiting) {
          void reply(waiting.goalId, waiting.id, text);
          return {...s, input: '', caret: 0};
        }
        void ask(text);
        return {
          ...s,
          items: [...s.items, {kind: 'said', id: `said-${s.items.length}`, text}],
          input: '',
          caret: 0
        };
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

/** The last question with no answer, if the engine is waiting on one. */
function pendingQuestion(s: State): {id: string; goalId: string} | undefined {
  for (let i = s.items.length - 1; i >= 0; i--) {
    const item = s.items[i]!;
    if (item.kind !== 'asked') continue;
    return item.answer === undefined ? {id: item.id, goalId: item.goalId} : undefined;
  }
  return undefined;
}

/**
 * Answer the question the engine stopped for, and let it carry on.
 *
 * The answer is written onto the question itself rather than added as a new
 * item: they are one exchange, and a reader scrolling back should find the
 * reply under the question that prompted it, not somewhere further down.
 */
async function reply(goalId: string, questionId: string, text: string): Promise<void> {
  edit(s => ({
    ...s,
    items: s.items.map(i => (i.id === questionId && i.kind === 'asked' ? {...i, answer: text} : i))
  }));

  if (engineOpening) await engineOpening;
  if (!engine) {
    add({kind: 'noted', id: `noted-${Date.now()}`, lines: ['no engine — the answer went nowhere']});
    return;
  }
  await engine.answer(goalId, text).catch((err: unknown) => {
    add({
      kind: 'noted',
      id: `noted-${Date.now()}`,
      lines: [`the answer was not accepted: ${err instanceof Error ? err.message : String(err)}`]
    });
  });
}

/**
 * Hand a goal to the engine, and let its events do the reporting.
 *
 * Nothing here renders the result: `completion.finished` and the phases before
 * it arrive through `watch` and become items like everything else. A console
 * that also printed the returned value would say the same thing twice, and the
 * two would disagree the moment the engine's own account is the better one.
 */
async function ask(goal: string): Promise<void> {
  // Wait for the door to finish answering before deciding there is nothing
  // behind it. Resolved already once it has, so a later goal pays nothing.
  if (engineOpening) await engineOpening;
  if (!engine) {
    add({kind: 'noted', id: `noted-${Date.now()}`, lines: ['no engine — nothing to run this against']});
    return;
  }
  void engine.submit(goal).catch((err: unknown) => {
    add({
      kind: 'noted',
      id: `noted-${Date.now()}`,
      lines: [`the goal ended badly: ${err instanceof Error ? err.message : String(err)}`]
    });
  });
}

// A resize is a repaint, not an adjustment (rule 4). Nothing is reconciled:
// the same state produces a different list of rows at the new size. True of the
// opening too, which is why it holds no measurement of its own.
const onResize = () => show();

// A recorded session, only when asked for. Nothing imports demo.ts otherwise,
// and with DEMO set no engine is opened — the two are alternatives.
if (process.env['DEMO']) {
  void import('./demo.js').then(({playDemo}) =>
    playDemo(change => edit(s => ({...s, items: change(s.items)})))
  );
} else {
  // Opened after the screen is taken, so anything it prints on the way lands in
  // the capture rather than on a frame. It answers in about a second and a half
  // and the opening runs for nine, so it is ready before anyone can type.
  engineOpening = openEngine().then(opened => {
    if (isFailure(opened)) {
      add({
        kind: 'noted',
        id: 'engine-failed',
        lines: [`the engine did not open — ${opened.reason}`]
      });
      return;
    }
    engine = opened;
    // Every execution event, through the adapter, in the order it arrived.
    opened.watch(event => {
      const item = toItem(event);
      if (item) add(item);
    });
  });
}

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

// The spinner turns only while something is genuinely in flight, and stops the
// moment nothing is. A console that repaints on a timer burns a terminal's
// night for no reason.
const spin = setInterval(() => {
  if (!opening.done) return;
  if (!state.items.some(i => i.kind === 'did' && i.state === 'running')) return;
  edit(s => ({...s, spinner: s.spinner + 1}));
}, 90);
spin.unref();

show();
