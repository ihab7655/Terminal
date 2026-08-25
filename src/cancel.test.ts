import {makeCancellation} from './cancel.js';

// The middleware, driven exactly as the engine drives it: hooks called with a
// context carrying a goalId, a throw meaning "the host stopped this run".
// What the engine does with that throw is proven on the engine's side
// (agent-engine tests/unit/brain/host-cancellation-propagation.test.ts); what
// this file proves is that the right goal, and only it, gets stopped.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

// Stands in for engine-core's MiddlewareControlSignal — the engine passes the
// real one in (engine.ts), and the only thing this file needs from it is that
// it is a class it can extend.
class Signal extends Error {}

const threw = (run: () => void): unknown => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error;
  }
};

console.log('\nnothing is stopped until it is asked for');
ok('an unmarked goal passes both hooks untouched',
  (() => {
    const c = makeCancellation(Signal);
    return (
      threw(() => c.middleware.beforeWave({goalId: 'g1'})) === undefined &&
      threw(() => c.middleware.beforePlanExecution({goalId: 'g1'})) === undefined
    );
  })());

console.log('\na marked goal is stopped at either boundary');
ok('beforeWave throws the host signal',
  (() => {
    const c = makeCancellation(Signal);
    c.cancel('g1');
    const error = threw(() => c.middleware.beforeWave({goalId: 'g1'}));
    return error instanceof Signal && c.owns(error);
  })());
ok('beforePlanExecution throws it too — the planning window is covered',
  (() => {
    const c = makeCancellation(Signal);
    c.cancel('g1');
    const error = threw(() => c.middleware.beforePlanExecution({goalId: 'g1'}));
    return error instanceof Signal && c.owns(error);
  })());
ok('only the marked goal — a concurrent one runs on',
  (() => {
    const c = makeCancellation(Signal);
    c.cancel('g1');
    return threw(() => c.middleware.beforeWave({goalId: 'g2'})) === undefined;
  })());

console.log('\nthe mark is spent when it fires');
ok('a second wave of the same goal is not stopped again',
  (() => {
    const c = makeCancellation(Signal);
    c.cancel('g1');
    threw(() => c.middleware.beforeWave({goalId: 'g1'}));
    // Were the mark to survive, a goal the host re-submitted under the same id
    // would die at its first wave for a cancel the user made minutes ago.
    return threw(() => c.middleware.beforeWave({goalId: 'g1'})) === undefined;
  })());
ok('cancelling a goal that is not running is not an error',
  threw(() => makeCancellation(Signal).cancel('never-ran')) === undefined);

console.log('\nownership');
ok('someone else\'s signal is not ours',
  (() => {
    const c = makeCancellation(Signal);
    return !c.owns(new Signal('a restart from another middleware')) && !c.owns(new Error('x'));
  })());

console.log(failed === 0 ? '\ncancel: all passed\n' : `\ncancel: ${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
