import {makeControl, type Answer, type ApprovalRequest, type Live} from './middleware.js';
import {defaults, type EffectTable, type Mode, type Standing} from '../settings/store.js';

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

// The engine's own signal class is what the engine tests with `instanceof`.
// Standing in for it here is exactly what the door does with the real one.
class Signal extends Error {}

const harness = (mode: Mode, over: Partial<EffectTable> = {}, answer: Answer = 'once') => {
  const asked: ApprovalRequest[] = [];
  const kept: Array<[ApprovalRequest, string]> = [];
  const standing: Standing[] = [];
  const live: Live = {
    mode: () => mode,
    table: () => ({...defaults().policy, ...over}),
    standing: () => standing,
    workspace: () => '~/x',
    ask: async r => { asked.push(r); return answer; },
    remember: (r, a) => void kept.push([r, a])
  };
  return {control: makeControl(Signal, live), asked, kept, standing};
};

const call = (over: Record<string, unknown> = {}) => ({
  goalId: 'g1', toolName: 'terminal', requester: {role: 'implementer'},
  effects: [{id: 'process:spawn', target: 'npm test'}], ...over
});
const mw = (h: ReturnType<typeof harness>) => h.control.middleware as {
  beforePlanExecution(c: {goalId: string}): void;
  beforeWave(c: {goalId: string}): void;
  beforeToolCall(c: Record<string, unknown>): Promise<{allow: boolean; reason?: string}>;
};

console.log('\nstopping — a flag the engine walks past, not an interrupt');
{
  const h = harness('automatic');
  h.control.cancel('g1');
  let threw = false;
  try { mw(h).beforePlanExecution({goalId: 'g1'}); } catch (e) { threw = h.control.owns(e); }
  ok('a marked goal throws at the planning boundary', threw);
  let again = false;
  try { mw(h).beforeWave({goalId: 'g1'}); } catch { again = true; }
  ok('and the mark is SPENT — it cannot stop the next goal too', !again);
  let other = false;
  try { mw(h).beforeWave({goalId: 'g2'}); } catch { other = true; }
  ok('an unmarked goal is untouched', !other);
}

console.log('\nplan mode — a host abort after the plan exists, before anything runs');
{
  const h = harness('plan');
  let threw = false;
  try { mw(h).beforePlanExecution({goalId: 'g9'}); } catch (e) { threw = h.control.owns(e); }
  ok('the plan boundary aborts', threw);
  ok('and the goal is remembered as planned, not as stopped', h.control.planOnly('g9'));
  ok('a goal that ran is not', !h.control.planOnly('g1'));
}
{
  const h = harness('automatic');
  let threw = false;
  try { mw(h).beforePlanExecution({goalId: 'g9'}); } catch { threw = true; }
  ok('and no other mode aborts there', !threw);
}

console.log('\napproval — the only hook that can answer');
{
  const h = harness('approval', {'process:spawn': 'needs-approval'});
  const d = await mw(h).beforeToolCall(call());
  ok('the call is held and a person is asked once', h.asked.length === 1);
  ok('the request carries the real command, un-normalised', h.asked[0]?.target === 'npm test');
  ok('and who asked for it', h.asked[0]?.requester === 'implementer');
  ok('answering `once` allows this call', d.allow === true);
  ok('and remembers nothing', h.kept.length === 0);
}
{
  const h = harness('approval', {'process:spawn': 'needs-approval'}, 'refuse');
  const d = await mw(h).beforeToolCall(call());
  ok('refusing denies it', d.allow === false);
  ok('SOFTLY — with a reason the worker reads and adapts to', typeof d.reason === 'string');
}
{
  const h = harness('approval', {'process:spawn': 'needs-approval'}, 'row');
  await mw(h).beforeToolCall(call());
  ok('answering `row` is kept', h.kept.length === 1 && h.kept[0]![1] === 'row');
}
{
  const h = harness('automatic', {'process:spawn': 'needs-approval'});
  const d = await mw(h).beforeToolCall(call());
  ok('automatic never asks — there is nobody to ask', h.asked.length === 0 && d.allow === true);
}
{
  const h = harness('automatic', {'process:spawn': 'forbidden'});
  const d = await mw(h).beforeToolCall(call());
  ok('but forbidden still refuses, in automatic', d.allow === false);
  ok('and no question is asked about a settled no', h.asked.length === 0);
}

console.log('\nwhat the engine declared is what governs');
{
  const h = harness('approval', {undeclared: 'needs-approval'});
  await mw(h).beforeToolCall(call({effects: undefined}));
  ok('a capability that declares nothing is asked about, not assumed harmless',
    h.asked.length === 1 && h.asked[0]!.effects.join() === 'undeclared');
}
{
  const h = harness('approval', {'fs:write': 'needs-approval'});
  await mw(h).beforeToolCall(call({toolName: 'write_file', effects: [{id: 'fs:write', target: '/x/a.py'}]}));
  ok('a path target reaches the request as the capability named it',
    h.asked[0]?.target === '/x/a.py');
}

console.log(failed === 0 ? '\nmiddleware: all passed\n' : `\nmiddleware: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
