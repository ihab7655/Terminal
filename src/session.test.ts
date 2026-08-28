import {atLaunch, begun, fresh, inLocation, locations, resumed, workspaceName} from './session.js';

// Who the console is talking to, where it is standing, and the rule that a
// LAUNCH IS NOT A RESUME.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};
const uuidish = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

console.log('\na launch talks to no one');
ok('a console that has just started has NO conversation',
  atLaunch('/tmp').sessionId === null, atLaunch('/tmp'));
ok('and stands where it was launched', atLaunch('/tmp').workspace === '/tmp');
// The defect this rule exists for: `standing(remembered)` used to continue an
// id read from the settings file, so quitting and starting again resumed a
// conversation behind an empty screen. A launch takes a directory and nothing
// else now, and the settings file no longer carries a conversation at all —
// asserted where that file is read, in settings.test.ts.
ok('every launch is its own conversation, however many there are',
  [atLaunch('/tmp'), atLaunch('/tmp'), atLaunch('/tmp')].every(s => s.sessionId === null));

console.log('\nthe first message begins one');
const launched = atLaunch('/tmp');
ok('begun() mints an id when there is none', uuidish(begun(launched).sessionId));
ok('two consoles do not begin the same conversation',
  begun(launched).sessionId !== begun(launched).sessionId);
ok('and it keeps the one it has once it has one',
  begun(begun(launched, () => 'first'), () => 'second').sessionId === 'first');
ok('beginning one does not move where the console stands',
  begun(launched).workspace === '/tmp');

console.log('\nresuming is a choice, and brings its place with it');
const chosen = {id: 'sess-1', workspace: '/home/spark/agent-engine'};
ok('the conversation becomes the one chosen', resumed(launched, chosen).sessionId === 'sess-1');
ok('and the console stands where that work was done',
  resumed(launched, chosen).workspace === '/home/spark/agent-engine');
ok('a conversation with no workspace on record leaves the console where it is',
  resumed(launched, {id: 'sess-2', workspace: null}).workspace === '/tmp');

console.log('\na new conversation, in a chosen place');
ok('has no id — the first message begins it, exactly as a launch does',
  fresh('/srv/app').sessionId === null);
ok('and stands in the place that was chosen', fresh('/srv/app').workspace === '/srv/app');

console.log('\nwhere the work was done, before what was said there');
const rows = [
  {id: 'a', workspace: '/srv/app', goals: 2, last: 'newest', at: '2026-08-28 19:00'},
  {id: 'b', workspace: '/tmp', goals: 1, last: 'older', at: '2026-08-27 08:00'},
  {id: 'c', workspace: '/srv/app', goals: 5, last: 'oldest', at: '2026-08-26 08:00'},
  {id: 'd', workspace: null, goals: 1, last: 'no place on record', at: '2026-08-28 20:00'}
];
const where = locations(rows);
ok('one row per place, not per conversation', where.length === 2, where);
ok('each says how many conversations happened there',
  where.find(l => l.workspace === '/srv/app')?.conversations === 2);
ok('newest place first, by the most recent thing said in it',
  where[0]?.workspace === '/srv/app', where.map(l => l.workspace));
ok('a goal with no workspace on record is in no place rather than an invented one',
  where.every(l => l.workspace !== ''), where);
ok('a place holds only its own conversations',
  inLocation(rows, '/srv/app').map(c => c.id).join(',') === 'a,c',
  inLocation(rows, '/srv/app').map(c => c.id));
ok('newest first there too', inLocation(rows, '/srv/app')[0]?.id === 'a');
ok('and a place nothing happened in is empty, not an error',
  inLocation(rows, '/nowhere').length === 0);

console.log('\nwhere it is standing');
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
