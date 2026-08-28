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
import {chosen, launcherUp, offered} from './console.js';
import {queryOf} from './places/registry.js';
import {workspaceName, standing} from './session.js';
import {load, save, type Settings, type Standing} from './settings/store.js';
import {catalogues, catalogueFor} from './i18n/index.js';
import type {Answer, ApprovalRequest, Live} from './policy/middleware.js';
import {adjusted, apply, profileFor, profiles as PROFILES} from './theme/profiles.js';
import {themeFor} from './theme/themes.js';
import {wear} from './style.js';
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
// The workspace is on the rail from the first frame — it is where files land,
// and a person should never have to discover that afterwards.
// ── WHAT THIS CONSOLE IS, BEFORE IT DRAWS ANYTHING ──────────────────────────
//
// Read once. A file that could not be read is not an error — it yields
// defaults and SAYS which fields were lost, because behaving differently from
// what a person configured without telling them is the one outcome worth
// preventing.
const remembered = load();
let settings: Settings = remembered.settings;
let here = standing(settings.session.id ?? undefined);
settings = {...settings, session: {id: here.sessionId}};

/** Everything waiting for an answer, oldest first. */
type Waiting = {request: ApprovalRequest; answer: (a: Answer) => void};
const waiting: Waiting[] = [];

/**
 * What the middleware reads at the moment it is called — never a copy taken at
 * boot. This is what lets the mode and the table change mid-session with no
 * restart: the hook closes over these functions, not over their values.
 */
const live: Live = {
  mode: () => settings.mode,
  table: () => settings.policy,
  standing: () => settings.standing,
  workspace: () => here.workspace,
  ask: request =>
    new Promise<Answer>(resolve => {
      waiting.push({request, answer: resolve});
      add({
        kind: 'asked',
        id: request.id,
        toolName: request.toolName,
        effects: request.effects,
        ...(request.target === undefined ? {} : {target: request.target}),
        requester: request.requester,
        workspace: workspaceName(request.workspace)
      });
      edit(s => ({...s, waiting: waiting.length}));
    }),
  planned: work => {
    add({
      kind: 'planned',
      id: `planned-${work.goalId}-${work.attempt}`,
      tasks: work.tasks,
      contract: work.contract
    });
  },
  refused: ({toolName, reason}) => {
    add({kind: 'noted', id: `refused-${Date.now()}-${toolName}`, lines: [`refused ${toolName} — ${reason}`]});
  },
  remember: (request, answer) => {
    const kept: Standing = {
      kind: answer === 'command' ? 'command' : 'effect',
      value: answer === 'command' ? (request.target ?? request.toolName) : (request.effects[0] ?? 'undeclared'),
      workspace: request.workspace,
      granted: new Date().toISOString().split('T')[0] ?? ''
    };
    settings = {...settings, standing: [...settings.standing, kept]};
    const trouble = save(settings);
    if (trouble) add({kind: 'noted', id: `noted-${Date.now()}`, lines: [`could not remember that: ${trouble}`]});
  }
};

// Worn before anything is drawn, so the first frame is already in the profile
// a person chose. `wear()` writes the palette and the glyphs in place, and the
// frame is built fresh from state every time — so a later change repaints in
// the new hand with nothing rebuilt.
wear(themeFor(settings.theme));

let state: State = {
  ...emptyState(),
  workspace: workspaceName(here.workspace),
  language: settings.language,
  mode: settings.mode,
  sessionId: here.sessionId,
  policy: Object.entries(settings.policy),
  languages: [...catalogues].map(([id, c]) => [id, c.name] as const),
  profile: settings.profile,
  adjusted: adjusted(profileFor(settings.profile), settings.mode, settings.policy, settings.theme)
};

// The engine, once it answers. Absent means the console is usable and says so
// when asked to do something that needs one — not that it is broken.
let engine: Engine | null = null;

// Established once, before anything is submitted, and never re-derived: every
// goal this console sends belongs to one conversation and one workspace.
// A remembered session id would be continued here once settings exist; until
// then each launch is its own conversation, which is still one more than the
// engine had before.
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

/**
 * Append, or REPLACE an item that already carries this id.
 *
 * A steer arrives six times — once per state the engine concludes — under one
 * id. Replacing means the row moves through its states in place rather than
 * stacking six rows about one sentence. Everything else mints a fresh id and
 * therefore appends, as before.
 */
const add = (item: Item) =>
  edit(s =>
    s.items.some(i => i.id === item.id)
      ? {...s, items: s.items.map(i => (i.id === item.id ? item : i))}
      : {...s, items: [...s.items, item]}
  );

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

  // ── WHAT IS OPEN OWNS THE KEYBOARD ──────────────────────────────────────
  //
  // Esc clears the INNERMOST thing: a place, then the launcher, then the
  // running goal. That layering is only safe because the closing rail always
  // says what Esc will do right now — the rule this console already followed
  // when it offered `Esc stops` only while something was stoppable.
  if (!opening.done) {
    // handled below — the opening owns every key until it ends
  } else if (state.place !== null) {
    if (k.name === 'escape' || (k.ctrl && k.text === 'k')) {
      edit(s => ({...s, place: null, confirming: null, input: '', caret: 0, launcher: {open: k.ctrl === true, at: 0}}));
      return;
    }
    // History is the one place with rows to walk: Enter on a goal opens the
    // Inspector on it. Everywhere else these keys do nothing rather than
    // something arbitrary.
    // ── CHOOSING A WAY OF WORKING ────────────────────────────────────────
    //
    // A profile that widens what may happen is confirmed by TYPING its name.
    // Every character reaches the composer as usual; Enter checks what was
    // typed against the name, and nothing else in the console is listening.
    if (state.place === 'profiles') {
      if (state.confirming !== null) {
        if (k.name === 'enter') {
          const wanted = state.confirming;
          const typed = state.input.trim();
          edit(s => ({...s, input: '', caret: 0}));
          if (typed === wanted) putOn(wanted);
          else edit(s => ({...s, confirming: null}));
          return;
        }
        // Esc is handled above, where it closes the innermost open thing —
        // and a confirmation is part of the place it is asked in, so leaving
        // the place abandons it. Cleared there, not here.
      } else {
        const at = PROFILES.findIndex(p => p.id === state.profile);
        if (k.name === 'up' || k.name === 'down') {
          const next = PROFILES[Math.max(0, Math.min(PROFILES.length - 1, at + (k.name === 'down' ? 1 : -1)))]!;
          edit(s => ({...s, profile: next.id}));
          return;
        }
        if (k.name === 'enter') {
          const p = profileFor(state.profile);
          if (p.confirm) edit(s => ({...s, confirming: p.id, input: '', caret: 0}));
          else putOn(p.id);
          return;
        }
      }
    }
    // ── CONTINUING A CONVERSATION ────────────────────────────────────────
    //
    // A conversation IS the engine's session. Continuing one means sending the
    // next goal with that id — which is the whole of it: the engine then reads
    // the message with its own summary, compacted context and recent turns,
    // because that is what it keys them on.
    //
    // The transcript is NOT repopulated. What was said in that conversation is
    // in the engine's record, not in this screen, and drawing rows the console
    // did not witness would be a transcript claiming to have seen something.
    if (state.place === 'conversations' && state.conversations !== null) {
      if (k.name === 'up') { edit(s => ({...s, conversationAt: Math.max(0, s.conversationAt - 1)})); return; }
      if (k.name === 'down') {
        edit(s => ({...s, conversationAt: Math.min((s.conversations?.length ?? 1) - 1, s.conversationAt + 1)}));
        return;
      }
      if (k.name === 'enter') {
        const c = state.conversations[state.conversationAt];
        if (c) {
          here = {...here, sessionId: c.id};
          settings = {...settings, session: {id: c.id}};
          const trouble = save(settings);
          edit(s => ({...s, place: null, sessionId: c.id}));
          add({kind: 'noted', id: `noted-${Date.now()}`,
               lines: [`${catalogueFor(settings.language).places.conversations}: ${c.last}`]});
          if (trouble) add({kind: 'noted', id: `noted-${Date.now()}-t`, lines: [trouble]});
        }
        return;
      }
    }
    if (state.place === 'history' && state.record !== null) {
      if (k.name === 'up') { edit(s => ({...s, recordAt: Math.max(0, s.recordAt - 1)})); return; }
      if (k.name === 'down') {
        edit(s => ({...s, recordAt: Math.min((s.record?.length ?? 1) - 1, s.recordAt + 1)}));
        return;
      }
      if (k.name === 'enter') {
        const row = state.record[state.recordAt];
        if (row && engine) inspect(row.id);
        return;
      }
    }
    if (k.name === 'up' || k.name === 'down' || k.name === 'enter') return;
  } else if (launcherUp(state)) {
    if (k.name === 'escape' || (k.ctrl && k.text === 'k')) {
      edit(s => ({...s, launcher: {open: false, at: 0}, input: queryOf(s.input) === null ? s.input : '', caret: 0}));
      return;
    }
    if (k.name === 'up') { edit(s => ({...s, launcher: {...s.launcher, at: Math.max(0, s.launcher.at - 1)}})); return; }
    if (k.name === 'down') {
      edit(s => ({...s, launcher: {...s.launcher, at: Math.min(offered(s).length - 1, s.launcher.at + 1)}}));
      return;
    }
    if (k.name === 'enter') {
      const place = chosen(state);
      if (place) {
        edit(s => ({...s, place: place.id, launcher: {open: false, at: 0}, input: '', caret: 0}));
        // History is READ when it is opened, never held live: the event stream
        // is live-only and does not survive the process, so what happened
        // before comes from the engine's store or from nowhere.
        if (place.id === 'settings' && engine) {
          try { edit(s => ({...s, configuration: engine!.configuration()})); }
          catch (err) {
            edit(s => ({...s, configuration: []}));
            add({kind: 'noted', id: `noted-${Date.now()}`,
                 lines: [`could not read the configuration: ${err instanceof Error ? err.message : String(err)}`]});
          }
        }
        if (place.id === 'conversations' && engine) {
          edit(s => ({...s, conversations: null, conversationAt: 0}));
          void engine.conversations(60)
            .then(rows => edit(s => ({...s, conversations: rows})))
            .catch(() => edit(s => ({...s, conversations: []})));
        }
        if (place.id === 'capabilities' && engine) {
          // A failure here is REPORTED, never swallowed into an empty list.
          // It was swallowed once, and Capabilities read "nothing on record
          // yet" for an engine holding eleven tools — an empty screen that
          // asserted a fact instead of admitting a fault.
          try {
            edit(s => ({...s, capabilities: engine!.capabilities()}));
          } catch (err) {
            edit(s => ({...s, capabilities: []}));
            add({kind: 'noted', id: `noted-${Date.now()}`,
                 lines: [`could not read the capabilities: ${err instanceof Error ? err.message : String(err)}`]});
          }
        }
        // The Inspector without a goal says how to pick one rather than showing
        // an empty record, which would read as an execution that did nothing.
        if (place.id === 'inspector' && state.inspecting === null)
          edit(s => ({...s, inspecting: {goalId: '', status: '', attempts: null, durationMs: null,
            workspace: null, tasks: [], evidence: [], workers: [], retries: [], guardian: []}}));
        if (place.id === 'history' && engine) {
          edit(s => ({...s, record: null}));
          void engine.goals(40).then(rows => {
            edit(s => ({...s, record: rows.map(r => ({
              id: r.id,
              goal: r.goal.split('\n')[0] ?? r.goal,
              status: r.status,
              at: new Date(r.createdAt).toISOString().replace('T', ' ').split('.')[0] ?? ''
            }))}));
          }).catch(() => edit(s => ({...s, record: []})));
        }
      }
      return;
    }
  } else if (k.ctrl && k.text === 'k') {
    edit(s => ({...s, launcher: {open: true, at: 0}}));
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

      // ── AN AMENDMENT, NOT A SECOND ASK ────────────────────────────────
      //
      // A line typed while something is running is a steer: the engine accepts
      // one and routes it (ADR-012) — guidance reaches the working worker at
      // the top of its next step, a change to what must be produced ends the
      // attempt at its next wave boundary. It stops nothing and restarts
      // nothing, so the composer is never dead time.
      //
      // The console does not DECIDE that it is an amendment by reading the
      // words — it is one because something is running, which is a fact the
      // console holds. What it CHANGES is the engine's to conclude, and the
      // six directive events say so.
      if (running.length > 0 && engine) {
        const target = running[running.length - 1]!;
        edit(s => ({...s, input: '', caret: 0, history: remember(s.history, text)}));
        void engine.steer(target, text).catch((err: unknown) => {
          add({kind: 'noted', id: `noted-${Date.now()}`,
               lines: [`${catalogueFor(settings.language).outcome.endedBadly}: ${err instanceof Error ? err.message : String(err)}`]});
        });
        return;
      }

      // ONE WAY IN. The console used to read its own rendered items to decide
      // whether a typed line was an answer to a pending question, and call a
      // different engine method if it was. That was cognition living in a host:
      // it decided what a message MEANT.
      //
      // The engine has no clarification state any more — it asks by answering,
      // the goal ends, and the next message arrives with the exchange above it.
      // So there is nothing here to route: everything a person types is a
      // message, and the engine reads it in its session.
      // ── WHAT WAS ASKED IS THE ANCHOR OF THE LOG ──────────────────────
      //
      // Two defects, both present since before this branch and both found by
      // using the console rather than reading it:
      //
      //   * the goal a person typed was NEVER shown. `said` is described in
      //     console.ts as "the anchor of the whole log" and nothing in the live
      //     path produced one — the transcript began at the engine's first
      //     event, so a session read as answers to questions nobody could see.
      //
      //   * the composer was never cleared. The text stayed, so the next line
      //     typed was appended to it: on 2026-08-28 a steer sent 30 seconds
      //     after a goal arrived at the engine as the goal text and the steer
      //     text run together, and the engine was asked to amend a goal using
      //     a sentence that began by repeating it.
      //
      // Cleared and recorded here, at the one place a message becomes a goal.
      add({kind: 'said', id: `said-${Date.now()}`, text});
      edit(s => ({...s, input: '', caret: 0, history: remember(s.history, text)}));
      void ask(text);
      return;
    }
    default:
      break;
  }

  // ── ANSWERING A HELD CALL ───────────────────────────────────────────────
  //
  // Only while something is actually waiting, so these letters are ordinary
  // text every other moment. A key that means one thing sometimes and another
  // thing the rest of the time is only safe when the screen says which — and
  // the screen does: the request is on it, with its four answers, and the rail
  // reads `N waiting`.
  //
  // A `y` typed BEFORE a request exists is therefore just a `y`, and goes into
  // the composer like any other character. Observed while testing on
  // 2026-08-28, and correct: the alternative is a console that swallows a
  // keystroke because of something that has not happened yet.
  if (waiting.length > 0 && !k.ctrl && 'ycrn'.includes(k.text)) {
    const answer: Answer =
      k.text === 'y' ? 'once' : k.text === 'c' ? 'command' : k.text === 'r' ? 'row' : 'refuse';
    const held = waiting.shift()!;
    edit(s => ({
      ...s,
      // The question goes when it is answered: a request still on screen after
      // it was decided is the console asserting a state that has passed.
      items: s.items.filter(i => i.id !== held.request.id),
      waiting: waiting.length
    }));
    add({
      kind: 'noted',
      id: `answered-${held.request.id}`,
      lines: [
        answer === 'refuse'
          ? `refused ${held.request.toolName}`
          : `allowed ${held.request.toolName}${answer === 'once' ? '' : ' — and kept'}`
      ]
    });
    held.answer(answer);
    return;
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
/**
 * Read ONE execution whole, and show it.
 *
 * `replay()` assembles a set of tables on demand — it is the counterpart of the
 * live stream, which does not survive the process. So this is a read, it is
 * only ever done when asked for, and the screen says it is reading rather than
 * showing an empty record that would look like an execution that did nothing.
 */
function inspect(goalId: string): void {
  edit(s => ({...s, place: 'inspector', inspecting: null}));
  void engine!
    .record(goalId)
    .then(async r => {
      if (r === null) { edit(s => ({...s, inspecting: null})); return; }
      edit(s => ({...s, inspecting: {...r, guardian: []}}));
      // Asked for separately and after, because it is optional and slower: the
      // record is on screen while the advisory is still being computed, rather
      // than both waiting on the slower of the two.
      const advice = await engine!.guardian(goalId).catch(() => []);
      edit(s => (s.inspecting && s.inspecting.goalId === goalId
        ? {...s, inspecting: {...s.inspecting, guardian: advice}}
        : s));
    })
    .catch((err: unknown) => {
      add({kind: 'noted', id: `noted-${Date.now()}`,
           lines: [`${catalogueFor(settings.language).outcome.endedBadly}: ${err instanceof Error ? err.message : String(err)}`]});
      edit(s => ({...s, place: null}));
    });
}

/**
 * Put a profile on: appearance, how it runs, and what it may do.
 *
 * The one act that touches all three, and it is a one-time act rather than a
 * coupling — afterwards each is an ordinary setting and a hand edit to any of
 * them wins and stays. `adjusted` then says the profile's name is no longer the
 * whole story, which is honesty rather than a warning.
 */
function putOn(id: string): void {
  const p = profileFor(id);
  const next = apply(p);
  settings = {...settings, profile: id, theme: next.theme, mode: next.mode, policy: next.policy};
  const trouble = save(settings);
  wear(themeFor(next.theme));
  edit(s => ({
    ...s,
    profile: id,
    confirming: null,
    mode: next.mode,
    policy: Object.entries(next.policy),
    adjusted: false,
    input: '',
    caret: 0
  }));
  if (trouble) add({kind: 'noted', id: `noted-${Date.now()}`, lines: [`could not remember that: ${trouble}`]});
}

async function ask(goal: string): Promise<void> {
  // Wait for the door to finish answering before deciding there is nothing
  // behind it. Resolved already once it has, so a later goal pays nothing.
  if (engineOpening) await engineOpening;
  if (!engine) {
    add({kind: 'noted', id: `noted-${Date.now()}`, lines: [catalogueFor(settings.language).outcome.noEngineHere]});
    return;
  }
  const goalId = randomUUID();
  startedRunning(goalId);
  void engine
    .submit({goal, id: goalId, ...here})
    .catch((err: unknown) => {
      add({
        kind: 'noted',
        id: `noted-${Date.now()}`,
        lines: [`${catalogueFor(settings.language).outcome.endedBadly}: ${err instanceof Error ? err.message : String(err)}`]
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
    lines: [catalogueFor(settings.language).engine.stopping]
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
    add({kind: 'noted', id: 'waking', lines: [catalogueFor(settings.language).engine.waking]});
    engineOpening = openEngine(live).then(opened => {
      if (isFailure(opened)) {
        add({
          kind: 'noted',
          id: 'engine-failed',
          lines: [`the engine did not open — ${opened.reason}`]
        });
        edit(s => ({...s, engineFacts: [`engine · did not open`, opened.reason, ...opened.captured]}));
        return;
      }
      engine = opened;
      edit(s => ({...s, engineFacts: [`engine · open`, `workspace · ${workspaceName(here.workspace)}`, `session · ${here.sessionId}`]}));
      // Every execution event, through the adapter, in the order it arrived.
      opened.watch(event => {
        // The catalogue in use at the moment the event arrives. An item is
        // stored as words once, so the language a person had chosen when it
        // happened is the language it keeps — the engine's own prose behaves
        // the same way, and a transcript that re-wrote its own history would
        // be claiming to have said something it did not.
        const item = toItem(event, catalogueFor(settings.language));
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
