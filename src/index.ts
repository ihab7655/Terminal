#!/usr/bin/env node
import {randomUUID} from 'node:crypto';
import {toItem} from './adapter.js';
import {
  anythingTurning,
  draw,
  emptyState,
  itemAtRow,
  scrollBy,
  toggleAllOutput,
  toggleOutput,
  type Item,
  type State
} from './console.js';
import {isFailure, openEngine, type Engine} from './engine.js';
import {next as newerInHistory, previous as olderInHistory, remember} from './history.js';
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
// Set when there is an engine to open, and called once the opening has stopped
// animating — see the comment at the assignment for why the timing matters.
// Absent under DEMO, where there is no engine and nothing to wait for.
let openEngineWhenTheOpeningIsOver: (() => void) | null = null;

const add = (item: Item) => edit(s => ({...s, items: [...s.items, item]}));

// ── What is running, and can therefore be stopped ────────────────────────────
//
// The console names the goal itself (`randomUUID`, handed to the engine as
// `id`) instead of waiting to learn its id from an event. That is what makes
// Esc work in the window where it matters most: the seconds before the first
// wave, when the engine is planning and there is nothing on screen yet to read
// an id from.
//
// Newest last, and Esc takes the last: nothing stops a person typing a second
// goal while the first runs, and the one they mean is the one they just sent.
// Ids are removed where they were added — when the promise that is running the
// goal settles — so this can never claim something is running after it ended.
const running: string[] = [];

function startedRunning(goalId: string): void {
  running.push(goalId);
  edit(s => ({...s, stoppable: true}));
}

function stoppedRunning(goalId: string): void {
  const at = running.lastIndexOf(goalId);
  if (at !== -1) running.splice(at, 1);
  edit(s => ({...s, stoppable: running.length > 0}));
}

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

// ── Leaving ─────────────────────────────────────────────────────────────────
//
// The engine must be told, or a goal in flight is never recorded as ended.
// `ApplicationRuntime.shutdown()` marks every in-flight goal `interrupted`
// through the same boundary as any other ending, marks its workers, then
// DRAINS the persistence queue and closes the pool. Skipping it leaves the
// goals table asserting that a dead run is still `running` — observed: two
// console goals from 2026-08-25 still say `running`/`planning` today, both
// from a session that ended on Ctrl+C.
//
// It was declared on `Engine`, implemented in the door, and had no caller.
//
// The screen is given back FIRST: shutdown drains a database and can take a
// moment, and a person who pressed Ctrl+C should get their terminal back at
// once rather than watch a frozen frame. Bounded, because quitting must never
// be something a person cannot do — if the drain hangs, the process still
// leaves, and the rows it would have corrected stay as they are.
const LEAVE_BUDGET_MS = 3000;

async function leave(): Promise<never> {
  stop();
  releaseScreen();
  const engineToClose = engine;
  if (engineToClose) {
    await Promise.race([
      engineToClose.shutdown().catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, LEAVE_BUDGET_MS))
    ]);
  }
  process.exit(0);
}

function key(k: Key) {
  if (k.ctrl && k.text === 'c') {
    void leave();
    return;
  }

  // Any key during the opening ends it, and does nothing else — the keystroke
  // that skips is not also the first character of a goal.
  if (!opening.done) {
    if (isRealKey(k)) {
      opening = skipOpening(opening);
      show();
      // Drawn BEFORE the engine is woken, not after: waking blocks for over a
      // second, and a person who just pressed a key should see that key land
      // rather than watch a stale frame while nothing answers.
      openingIsOver();
    }
    return;
  }

  switch (k.name) {
    case 'escape':
      return stopRunningGoal();
    // A wheel turn moves the window, which is what it has always meant, and
    // three rows is what a terminal sends per notch elsewhere. This is also the
    // one consumer left for a line-at-a-time scroll, now that the arrows recall.
    case 'wheelUp':
      return edit(s => scrollBy(s, {kind: 'lines', delta: -3}));
    case 'wheelDown':
      return edit(s => scrollBy(s, {kind: 'lines', delta: 3}));
    case 'pageUp':
      return edit(s => scrollBy(s, {kind: 'page', delta: -1}));
    case 'pageDown':
      return edit(s => scrollBy(s, {kind: 'page', delta: 1}));
    // THE ARROWS ANSWER WITH HISTORY, NOT WITH A ONE-LINE SCROLL.
    //
    // They used to move the window a line at a time — a job three other keys
    // already do better (PgUp/PgDn a page, Home/End the ends) — while the thing
    // a person reaches the up arrow for in any terminal had nowhere to be.
    // Nothing was lost by the trade: scrolling kept every key it had.
    case 'up':
      return edit(s => {
        const {history, line} = olderInHistory(s.history, s.input);
        return {...s, history, input: line, caret: line.length};
      });
    case 'down':
      return edit(s => {
        const {history, line} = newerInHistory(s.history);
        return {...s, history, input: line, caret: line.length};
      });
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
      // Everything, or nothing. The one-at-a-time case is the click below,
      // which brings its own selection.
      return edit(toggleAllOutput);
    case 'click':
      return edit(s => toggleOutput(s, itemAtRow(s, k.row ?? 0)));
    case 'enter': {
      const text = state.input.trim();
      if (text === '') return;

      // ONE WAY IN. The console used to read its own rendered items to decide
      // whether a typed line was an answer to a pending question, and call a
      // different engine method if it was. That was cognition living in a host:
      // it decided what a message MEANT.
      //
      // The engine has no clarification state any more — it asks by answering,
      // the goal ends, and the next message arrives with the exchange above it.
      // So there is nothing here to route: everything a person types is a
      // message, and the engine reads it in its session.
      void ask(text);
      return;
    }
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
  const goalId = randomUUID();
  startedRunning(goalId);
  void engine
    .submit(goal, goalId)
    .catch((err: unknown) => {
      add({
        kind: 'noted',
        id: `noted-${Date.now()}`,
        lines: [`the goal ended badly: ${err instanceof Error ? err.message : String(err)}`]
      });
    })
    // Including a goal that ended by asking something: that IS an ending now,
    // not a pause. Nothing is running afterwards, Esc has nothing to stop, and
    // the answer the person types next is a new goal that carries the exchange
    // with it.
    .finally(() => stoppedRunning(goalId));
}

/**
 * Stop the goal the person means: the last one they sent that is still going.
 *
 * The console says only that it asked. Whether the run ends, and when, is the
 * engine's to report — it stops at its next boundary and publishes
 * `completion.finished`, which arrives through `watch` like any other event and
 * renders as `stopped`. Saying "stopped" here would be the console announcing
 * something it does not know yet.
 *
 * With nothing running this does nothing at all — no message, no beep. Esc is
 * not this console's quit key, and a person pressing it out of habit should not
 * be answered by a log entry.
 */
function stopRunningGoal(): void {
  const goalId = running[running.length - 1];
  if (goalId === undefined || !engine) return;
  engine.cancel(goalId);
  add({
    kind: 'noted',
    id: `noted-${Date.now()}`,
    lines: ['stopping — the engine finishes the work already in flight first']
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
  // WHY THE ENGINE IS NOT OPENED HERE, WHERE THE SCREEN IS TAKEN.
  //
  // Opening it blocks. Measured 2026-08-25 with a 10ms heartbeat: importing the
  // engine costs ~956ms and building the runtime ~897ms, and the loop stops
  // dead for **1560ms** inside that. At 70ms a frame, that is twenty-two frames
  // of the opening that never draw — the dragon freezes mid-flight, and the
  // first thing this console does is look broken.
  //
  // Nothing here can make an import cheap. What it can choose is WHEN to pay
  // for it: the opening is the only part of this console that animates, so the
  // engine is woken the moment the opening is over, against a still screen
  // where a second and a half costs nobody a frame. A person who skips the
  // opening pays it immediately, which is honest — they asked to get on with
  // it — and they are told what the wait is for.
  //
  // The engine is ready well before anyone can type a goal either way.
  openEngineWhenTheOpeningIsOver = () => {
    // A note, not a phase: a phase carries a turning mark, and the loop is
    // about to stop for a second and a half — a mark that cannot turn while the
    // thing it describes is happening is worse than no mark. It also stays in
    // the log afterwards, where it explains the one pause this console has.
    add({kind: 'noted', id: 'waking', lines: ['waking the engine']});
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
  };
}

takeScreen();
const stop = onKey(key);
process.stdout.on('resize', onResize);

/** The opening has stopped animating — by running out, or by being skipped. */
function openingIsOver(): void {
  const wake = openEngineWhenTheOpeningIsOver;
  openEngineWhenTheOpeningIsOver = null;
  wake?.();
}

const curtain = setInterval(() => {
  if (opening.done) {
    clearInterval(curtain);
    show();
    openingIsOver();
    return;
  }
  opening = advance(opening);
  show();
}, TICK_MS);
curtain.unref();

// The spinner turns only while something is genuinely in flight, and stops the
// moment nothing is. A console that repaints on a timer burns a terminal's
// night for no reason.
//
// What counts as "in flight" is console.ts's to answer, not this loop's: it
// draws the marks, so it knows which ones turn. Asked here independently, the
// answer left out the phase line — and the phase line is what a person watches
// during the longest wait there is.
const spin = setInterval(() => {
  if (!opening.done) return;
  if (!anythingTurning(state.items)) return;
  edit(s => ({...s, spinner: s.spinner + 1, now: Date.now()}));
}, 90);
spin.unref();

show();
