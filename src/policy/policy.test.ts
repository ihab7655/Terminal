import {decide, rowsFor, type CallFacts} from './decide.js';
import {defaults, EFFECTS, type EffectTable, type Mode, type Permission, type Standing} from '../settings/store.js';

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

const table = (v: Permission): EffectTable =>
  Object.fromEntries(EFFECTS.map(e => [e, v])) as EffectTable;
const call = (over: Partial<CallFacts> = {}): CallFacts =>
  ({toolName: 'terminal', effects: ['process:spawn'], target: 'npm test', workspace: '~/x', ...over});

console.log('\nthe whole matrix — three modes by three values');
const modes: Mode[] = ['automatic', 'approval', 'plan'];
const expected: Record<Mode, Record<Permission, string>> = {
  automatic: {allowed: 'allow', 'needs-approval': 'allow', forbidden: 'deny'},
  approval:  {allowed: 'allow', 'needs-approval': 'ask',   forbidden: 'deny'},
  plan:      {allowed: 'deny',  'needs-approval': 'deny',  forbidden: 'deny'}
};
for (const m of modes)
  for (const v of ['allowed', 'needs-approval', 'forbidden'] as Permission[])
    ok(`${m} · ${v} → ${expected[m][v]}`,
      decide(m, table(v), call()).verdict === expected[m][v],
      decide(m, table(v), call()));

console.log('\nforbidden holds in every mode — that is what keeps the dials apart');
ok('automatic does not soften it',
  decide('automatic', table('forbidden'), call()).verdict === 'deny');
ok('and the refusal says why, to the worker that reads it',
  (decide('automatic', table('forbidden'), call()) as {reason: string}).reason.includes('process:spawn'));
ok('"work without interrupting me, but never git" is expressible',
  decide('automatic', {...table('allowed'), 'vcs:write': 'forbidden'},
    call({toolName: 'git', effects: ['vcs:write']})).verdict === 'deny' &&
  decide('automatic', {...table('allowed'), 'vcs:write': 'forbidden'}, call()).verdict === 'allow');

console.log('\nwhat the engine declared decides which rows apply');
ok('undefined effects are NOT harmless — they are undeclared',
  rowsFor(undefined).join() === 'undeclared');
ok('an empty list is treated the same way here', rowsFor([]).join() === 'undeclared');
ok('a known effect maps to its own row', rowsFor(['fs:write']).join() === 'fs:write');
ok('an effect this console has never heard of still lands on a row',
  rowsFor(['quantum:entangle']).join() === 'undeclared');
ok('two effects mean two rows', rowsFor(['fs:read', 'fs:write']).length === 2);

console.log('\nthe strictest row wins — permission is not the best of its parts');
const mixed = {...table('allowed'), 'process:spawn': 'forbidden' as Permission};
ok('one forbidden effect refuses the whole call',
  decide('approval', mixed, call({effects: ['fs:read', 'process:spawn']})).verdict === 'deny');
const asks = {...table('allowed'), 'network:read': 'needs-approval' as Permission};
ok('one asking effect asks about the whole call',
  decide('approval', asks, call({effects: ['fs:read', 'network:read']})).verdict === 'ask');
ok('and the request names only the rows that actually ask',
  (decide('approval', asks, call({effects: ['fs:read', 'network:read']})) as {effects: readonly string[]})
    .effects.join() === 'network:read');

console.log('\nstanding approvals — scope and reach');
const cmd: Standing = {kind: 'command', value: 'npm test', workspace: '~/x', granted: 'd'};
const row: Standing = {kind: 'effect', value: 'process:spawn', workspace: '~/x', granted: 'd'};
ok('an exact command answers for itself',
  decide('approval', table('needs-approval'), call(), [cmd]).verdict === 'allow');
ok('and for nothing else',
  decide('approval', table('needs-approval'), call({target: 'rm -rf /'}), [cmd]).verdict === 'ask');
ok('a row answers for every call on that row',
  decide('approval', table('needs-approval'), call({target: 'anything at all'}), [row]).verdict === 'allow');
ok('neither reaches another workspace',
  decide('approval', table('needs-approval'), call({workspace: '~/elsewhere'}), [cmd, row]).verdict === 'ask');
ok('and NEITHER outranks forbidden — a passing yes cannot beat a deliberate no',
  decide('approval', table('forbidden'), call(), [cmd, row]).verdict === 'deny');

console.log('\nthe shipped defaults');
const d = defaults();
ok('a fresh console behaves as the engine does with no middleware: it works',
  decide(d.mode, d.policy, call()).verdict === 'allow');
ok('and still asks about git, which rewrites history rather than files',
  decide('approval', d.policy, call({toolName: 'git', effects: ['vcs:write']})).verdict === 'ask');
ok('and about anything that declares nothing about itself',
  decide('approval', d.policy, call({effects: undefined})).verdict === 'ask');

console.log(failed === 0 ? '\npolicy: all passed\n' : `\npolicy: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
