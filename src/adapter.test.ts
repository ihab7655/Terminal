import {toItem, type EngineEvent} from './adapter.js';

// The adapter, against payloads shaped exactly as the engine publishes them.
// Field names were read from the engine's own contracts, not guessed:
// ToolCalledEventPayload (workers/tool-caller.ts:31), NeedTransitionNotification
// (needs/need-ledger.ts), CapabilityAttemptNotification and
// CapabilityEvolutionNotification (observability/).

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};
const ev = (eventType: string, payload: Record<string, unknown>): EngineEvent => ({
  eventType,
  goalId: 'g1',
  payload
});

console.log('\nphases replace, they do not accumulate');
ok('planning.finished carries the wave count',
  (() => {
    const i = toItem(ev('planning.finished', {attempt: 1, wavesCount: 3, finishedAt: 0, startedAt: 0}));
    return i?.kind === 'phase' && i.text === 'planned' && i.detail === '3 waves';
  })());
ok('a single wave is not pluralised',
  (() => {
    const i = toItem(ev('planning.finished', {wavesCount: 1}));
    return i?.kind === 'phase' && i.detail === '1 wave';
  })());
ok('wave index is 0-based in the engine and 1-based to a reader',
  (() => {
    const i = toItem(ev('execution.wave.started', {waveIndex: 0, workersCount: 2, attempt: 1}));
    return i?.kind === 'phase' && i.detail === 'wave 1';
  })());

console.log('\na tool call keeps its failure readable');
ok('a failed call carries stderr first',
  (() => {
    const i = toItem(ev('tool.called', {
      toolName: 'bash', success: false, durationMs: 5,
      stderrSummary: "ModuleNotFoundError: No module named 'requests'",
      stdoutSummary: 'some output'
    }));
    return i?.kind === 'did' && i.state === 'failed' &&
      i.output[0] === "ModuleNotFoundError: No module named 'requests'";
  })());
ok('a successful call is ok', (() => {
    const i = toItem(ev('tool.called', {toolName: 'read_file', success: true, durationMs: 1}));
    return i?.kind === 'did' && i.state === 'ok';
  })());

console.log('\nverification: a pass is the absence of news');
ok('a passing verification renders nothing',
  toItem(ev('verification.completed', {passed: true, reason: 'All requirements met'})) === undefined);
ok('a failing one says why',
  (() => {
    const i = toItem(ev('verification.completed', {passed: false, reason: 'no tests ran'}));
    return i?.kind === 'noted' && i.lines[0] === 'verification failed — no tests ran';
  })());

console.log('\nthe capability journey');
ok('UNRESOLVED names the need in the words it was captured in',
  (() => {
    const i = toItem(ev('need.transition', {
      needId: 'n1', from: 'RESOLVING', to: 'UNRESOLVED', goalId: 'g1', originGoalId: 'g1',
      text: 'extract every link from a webpage'
    }));
    return i?.kind === 'noted' && i.lines[0] === 'missing a capability: extract every link from a webpage';
  })());
ok('ACQUIRING is a phase — it is where the engine IS for minutes',
  (() => {
    const i = toItem(ev('need.transition', {to: 'ACQUIRING', text: 't'}));
    return i?.kind === 'phase';
  })());
ok('ABANDONED carries the cause',
  (() => {
    const i = toItem(ev('need.transition', {to: 'ABANDONED', cause: 'no resolver produced a capability'}));
    return i?.kind === 'noted' && (i.lines[0] ?? '').includes('no resolver produced a capability');
  })());
ok('MET is not announced twice — the work already said it',
  toItem(ev('need.transition', {to: 'MET', metBy: 'extract'})) === undefined);
ok('already_present is not reported as a failure',
  (() => {
    const i = toItem(ev('capability.attempt', {
      phase: 'settled', outcome: 'already_present', capability: 'c', resolverId: 'generation',
      toolName: 'extract', attempt: 1, needId: 'n', goalId: 'g'
    }));
    return i?.kind === 'noted' && i.lines[0] === 'already had extract';
  })());
ok('declined says the catalog had nothing, not that it failed',
  (() => {
    const i = toItem(ev('capability.attempt', {
      phase: 'settled', outcome: 'declined', capability: 'c', resolverId: 'installed', attempt: 1
    }));
    return i?.kind === 'noted' && i.lines[0] === 'installed had nothing for it';
  })());

console.log('\ncapability.evolution: `needed` is a conclusion, not work');
ok('needed does not claim a repair is running',
  (() => {
    const i = toItem(ev('capability.evolution', {phase: 'needed', capability: 'bash'}));
    return i?.kind === 'noted' && !i.lines[0]!.includes('repairing');
  })());
ok('and says it is a standing judgement, not something that happened in this goal',
  (() => {
    const i = toItem(ev('capability.evolution', {phase: 'needed', capability: 'bash'}));
    // It read "noticed a problem with bash", which appeared five times atop a
    // run in which nothing went wrong — the engine's conclusion comes from its
    // whole record, and a console that dates it to the current goal is
    // reporting a different fact from the one it was given.
    return i?.kind === 'noted' && i.lines[0]!.includes('from its record, not from this goal');
  })());
ok('started does claim it',
  (() => {
    const i = toItem(ev('capability.evolution', {phase: 'started', capability: 'bash'}));
    return i?.kind === 'noted' && i.lines[0] === 'repairing bash';
  })());

console.log('\nsilence is a decision');
for (const t of ['tool.args.normalized', 'worker.done', 'goal.completed', 'retry.plan_changed', 'directive.received']) {
  ok(`${t} renders nothing`, toItem(ev(t, {})) === undefined);
}


// ── the question carries what an answer needs ───────────────────────────────
console.log('\nasked carries the goal an answer is addressed to');

console.log('\nthe engine is heard, not summarised');
ok('a conversation reply is what the reader sees, not the status word',
  (() => {
    const i = toItem(ev('completion.finished', {
      success: true,
      status: 'completed',
      terminal: true,
      durationMs: 1200,
      attempts: 0,
      summary: 'مرحبا! أنا بخير، كيف أقدر أساعدك؟'
    }));
    return i?.kind === 'spoke' && i.text === 'مرحبا! أنا بخير، كيف أقدر أساعدك؟';
  })());
ok('an ending with nothing said falls back to its status',
  (() => {
    const i = toItem(ev('completion.finished', {success: true, status: 'completed', terminal: true}));
    return i?.kind === 'spoke' && i.text === 'completed';
  })());
ok('a stopped run reads as its reason, which is what the summary carries',
  (() => {
    const i = toItem(ev('completion.finished', {
      success: false,
      status: 'stopped',
      terminal: true,
      summary: 'stopped from the console'
    }));
    return i?.kind === 'spoke' && i.text === 'stopped from the console';
  })());


// ── A REFUSED CALL CHANGED NOTHING, AND MUST NOT SAY IT DID ─────────────────
//
// Found live on 2026-08-28: with writes forbidden by the console's own policy,
// a refused `write_file` still read `Wrote 1 file · +1 line` — the arguments
// say what a write WOULD have contained, and the console was presenting them
// as what it did contain.
{
  const args = {path: 'x.py', content: 'one\ntwo\n'};
  const okCall = toItem({
    eventType: 'tool.called', goalId: 'g',
    payload: {toolName: 'write_file', args, success: true, durationMs: 1}
  }) as {changes?: unknown[]};
  const refused = toItem({
    eventType: 'tool.called', goalId: 'g',
    payload: {toolName: 'write_file', args, success: false, durationMs: 1,
              stderrSummary: '[ERROR] Blocked: fs:write is forbidden'}
  }) as {changes?: unknown[]; state?: string};
  ok('a write that happened carries its lines', (okCall.changes ?? []).length === 2);
  ok('a write that was refused carries none', refused.changes === undefined);
  ok('and is marked failed, not written', refused.state === 'failed');
}

console.log(failed === 0 ? '\nall good.\n' : `\n${failed} failed.\n`);
process.exit(failed === 0 ? 0 : 1);
