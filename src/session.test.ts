import {standing, workspaceName} from './session.js';

// The two facts the engine declares on every goal and this console never sent.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};
const uuidish = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

console.log('\nwho the console is talking to');
const remembered = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';
ok('a remembered session is continued — that is what the memory is for',
  standing(remembered, '/tmp').sessionId === remembered);
ok('a fresh one is minted when there is none',
  uuidish(standing(undefined, '/tmp').sessionId));
ok('and when what was remembered is not a session id',
  uuidish(standing('not-an-id', '/tmp').sessionId));
ok('two fresh ones differ',
  standing(undefined, '/tmp').sessionId !== standing(undefined, '/tmp').sessionId);

console.log('\nwhere it is standing');
ok('the workspace is the directory it was launched from',
  standing(undefined, '/home/spark/agent-engine').workspace === '/home/spark/agent-engine');
ok('home becomes ~, which is how a person names it',
  workspaceName('/home/spark/agent-engine', '/home/spark') === '~/agent-engine');
ok('a path outside home is left alone',
  workspaceName('/srv/app', '/home/spark') === '/srv/app');
ok('no home set is not an error',
  workspaceName('/home/spark/x', '') === '/home/spark/x');
ok('a long path is NOT truncated here — the rail owns that, at the real width',
  workspaceName('/home/spark/a/very/deeply/nested/project/folder', '/home/spark')
    === '~/a/very/deeply/nested/project/folder',
  workspaceName('/home/spark/a/very/deeply/nested/project/folder', '/home/spark'));

console.log(failed === 0 ? '\nsession: all passed\n' : `\nsession: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
