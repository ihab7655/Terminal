import {emptyState, frame, type State} from '../console.js';
import {PLACES} from './registry.js';
import {route} from './route.js';
import {width as columnsOf} from '../text.js';

// ── A PLACE THAT RENDERS IS NOT A PLACE THAT WORKS ──────────────────────────
//
// This file exists because a report once said eight surfaces were "reachable
// and rendering", which was true and was not enough: three of them drew their
// list and did nothing with a keypress. What is asserted here is USE — that
// every place can be reached at any height, that the ones offering a choice
// take one, and that Esc gets you out.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};
const ESC = String.fromCharCode(27);
const plain = (s: string) => s.split(new RegExp(ESC + '\\[[0-9;]*m', 'g')).join('');
const at = (c: number, r: number) => {
  Object.defineProperty(process.stdout, 'columns', {value: c, configurable: true});
  Object.defineProperty(process.stdout, 'rows', {value: r, configurable: true});
};
const key = (over: Record<string, unknown> = {}) =>
  ({name: '', text: '', ctrl: false, ...over}) as never;
const where = (over: Record<string, unknown> = {}) =>
  ({openingDone: true, place: null, inside: false, launcher: false, running: false,
    waiting: false, composerEmpty: true, ...over}) as never;

// What the console holds when each place has real data behind it.
const filled: Partial<State> = {
  workspace: '~/x', sessionId: 'abc-123',
  policy: [['fs:read', 'allowed'], ['fs:write', 'allowed'], ['process:spawn', 'allowed'],
           ['network:read', 'allowed'], ['vcs:write', 'needs-approval'], ['undeclared', 'needs-approval']],
  languages: [['en', 'English'], ['ar', 'العربية']],
  engineFacts: ['engine · open', 'session · abc-123'],
  record: [{id: 'g1', goal: 'build a thing', status: 'completed', at: '2026-08-28 06:00'}],
  conversations: [
    {id: 's1', workspace: '/home/spark/x', goals: 3, last: 'a real goal', at: '2026-08-28 05:00'},
    {id: 's2', workspace: '/srv/app', goals: 1, last: 'somewhere else', at: '2026-08-27 05:00'}
  ],
  capabilities: [{name: 'bash', category: 'Running commands'}],
  configuration: [['provider', 'deepseek'], ['api key', 'set · …29f2']],
  inspecting: {goalId: 'g1', status: 'completed', attempts: 1, durationMs: 96000,
    workspace: '/tmp/x', tasks: ['write it'], evidence: ['FILES_CHANGED'],
    workers: [{role: 'dev', status: 'completed', steps: 2}], retries: [], guardian: ['excellent']}
};

console.log('\nevery place is reachable, at every height');
{
  let unreachable: string[] = [];
  for (const h of [34, 24, 18, 14, 10])
    for (let i = 0; i < PLACES.length; i++) {
      at(100, h);
      const rows = frame({...emptyState(), launcher: {open: true, at: i}, now: 0}).rows.map(plain);
      const on = rows.some(r => /[◆▰]/.test(r) && r.includes(`${PLACES[i]!.number}  `));
      if (!on) unreachable.push(`${PLACES[i]!.id}@${h}`);
    }
  ok(`all ${PLACES.length} places reachable at 5 heights`, unreachable.length === 0, unreachable);
}

console.log('\nevery place draws something, and nothing overflows');
{
  at(100, 30);
  const empty: string[] = [];
  const over: string[] = [];
  for (const p of PLACES) {
    for (const w of [100, 60, 40, 24]) {
      at(w, 30);
      const rows = frame({...emptyState(), ...filled, place: p.id, now: 0} as State).rows.map(plain);
      if (rows.some(r => columnsOf(r) > w)) over.push(`${p.id}@${w}`);
      const body = rows.filter(r => r.trim() && !/^[╭╰─═╔╚]/.test(r) && !r.includes('›'));
      if (w === 100 && body.length === 0) empty.push(p.id);
    }
  }
  ok('none is blank', empty.length === 0, empty);
  ok('none overflows its window at any of four widths', over.length === 0, over);
}

console.log('\nthe places that offer a choice take one');
{
  const choosing = ['mode', 'policy', 'language', 'history', 'conversations', 'profiles'];
  const noAction: string[] = [];
  for (const id of choosing) {
    const w = where({place: id});
    const moves = route(key({name: 'down'}), w).do === 'choose';
    const acts = route(key({name: 'enter'}), w).do === 'confirm';
    if (!moves || !acts) noAction.push(id);
  }
  ok('each has a cursor AND an action', noAction.length === 0, noAction);

  // And the ones that are references take neither, on purpose.
  const reference = ['help', 'workspace', 'engine', 'settings', 'inspector', 'capabilities'];
  ok('a reference place still answers Esc',
    reference.every(id => route(key({name: 'escape'}), where({place: id})).do === 'close-place'));
}

console.log('\nConversations asks WHERE the work was done before WHAT was said');
{
  at(100, 30);
  const outside = frame({...emptyState(), ...filled, place: 'conversations', now: 0} as State)
    .rows.map(plain).join('\n');
  // `/home/spark/x` reads as `~/x`: the workspace is NAMED the way a person
  // names it, by the same function the rail uses.
  ok('the first level lists the places, both of them',
    outside.includes('~/x') && outside.includes('/srv/app'),
    outside.split('\n').filter(r => r.includes('/')));
  ok('and says how many conversations happened in each', /1 conversation\b/.test(outside), outside);
  ok('it does NOT mix in what was said — that is the next level',
    !outside.includes('a real goal') && !outside.includes('somewhere else'));

  const inside = frame({...emptyState(), ...filled, place: 'conversations',
    inLocation: '/home/spark/x', now: 0} as State).rows.map(plain).join('\n');
  ok('inside a place, its own conversations are there', inside.includes('a real goal'));
  ok('and only its own', !inside.includes('somewhere else'), inside);
  ok('with the row that starts a new one', /\+ start a new conversation here/.test(inside), inside);
  ok('and the place a person is in, named', inside.includes('~/x'), inside);

  // The cursor starts on the row that starts a new conversation, which is why
  // it is drawn first: the action does not move when the list grows.
  ok('the mark is on the new-conversation row when the level opens',
    /[◆▰]\s+\+ start/.test(inside), inside.split('\n').find(r => r.includes('+ start')));

  // Esc leaves the inner level before the place — the same rule, one more layer.
  ok('Esc goes back to the places, not out of Conversations',
    route(key({name: 'escape'}), where({place: 'conversations', inside: true})).do === 'close-inside');
  ok('and out of the place once it is at the first level',
    route(key({name: 'escape'}), where({place: 'conversations'})).do === 'close-place');

  const over: string[] = [];
  for (const w of [100, 60, 40, 24]) {
    at(w, 30);
    const rows = frame({...emptyState(), ...filled, place: 'conversations',
      inLocation: '/home/spark/x', now: 0} as State).rows.map(plain);
    if (rows.some(r => columnsOf(r) > w)) over.push(`inside@${w}`);
  }
  ok('neither level overflows its window', over.length === 0, over);

  // Goals sent before a host supplied a workspace have no place on record.
  at(100, 30);
  const placeless = frame({...emptyState(), ...filled, place: 'conversations', now: 0,
    conversations: [{id: 's9', workspace: null, goals: 1, last: 'old', at: '2026-08-20 05:00'}]
  } as State).rows.map(plain).join('\n');
  ok('conversations with no place on record are said as nothing, not drawn as an empty list',
    placeless.includes('nothing on record yet') && !placeless.includes('old'), placeless);
  at(100, 30);
}

console.log('\na console that has not been spoken to is in no conversation');
{
  at(100, 30);
  const {en} = await import('../i18n/en.js');
  const rows = frame({...emptyState(), ...filled, sessionId: null, place: 'workspace', now: 0} as State)
    .rows.map(plain).join('\n');
  ok('Workspace says so rather than showing an id for one that does not exist',
    rows.includes(en.places.newConversation), rows);
}

console.log('\nthe help page is a page: a hierarchy, and it sheds nothing');
{
  const {en} = await import('../i18n/en.js');
  const {ar} = await import('../i18n/ar.js');
  for (const [lang, cat] of [['en', en], ['ar', ar]] as const) {
    const keys = cat.help.sections.flatMap(s => [s.name, ...s.entries.map(e => e.key)]);
    const words = cat.help.sections.flatMap(s => s.entries.map(e => e.does.split(/\s+/)));
    const bad: string[] = [];
    for (const [w, h] of [[100, 34], [64, 18], [44, 16], [30, 10]] as const) {
      at(w, h);
      const all: string[] = [];
      for (let off = 0; off < 300; off++)
        all.push(...frame({...emptyState(), place: 'help', language: lang, pageAt: off, now: 0} as State)
          .rows.map(plain));
      const seen = all.join('\n');
      if (keys.some(k => !seen.includes(k))) bad.push(`${w}x${h}: a key or section is unreachable`);
      // Every WORD of every description, so a truncated sentence is caught —
      // a help page that cuts the explanation a person opened it for is worse
      // than one that is merely long.
      if (words.some(ws => !ws.every(x => seen.includes(x)))) bad.push(`${w}x${h}: a description is cut`);
      if (all.some(r => columnsOf(r) > w)) bad.push(`${w}x${h}: a row overflows`);
    }
    ok(`${lang}: every key and every word of every description is reachable`, bad.length === 0, bad);
  }

  // The hierarchy itself: a key stands alone on its line, and what it does is
  // on the line beneath — never glued together into a table a reader decodes.
  at(100, 40);
  const rows = frame({...emptyState(), place: 'help', now: 0} as State).rows.map(plain);
  const keyLine = rows.findIndex(r => r.trim() === 'Enter');
  ok('a key is alone on its line', keyLine > 0);
  ok('and what it does is on the next one',
    (rows[keyLine + 1] ?? '').includes('Open or choose'), rows[keyLine + 1]);
  ok('and the page names itself', rows.some(r => r.includes('OVERYOS / HELP')));
}

console.log('\nEsc always gets you out');
ok('from every place', PLACES.every(p =>
  route(key({name: 'escape'}), where({place: p.id})).do === 'close-place'));
ok('and from the launcher', route(key({name: 'escape'}), where({launcher: true})).do === 'close-launcher');

console.log(failed === 0 ? '\nacceptance: all passed\n' : `\nacceptance: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
