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
  ({openingDone: true, place: null, launcher: false, running: false,
    waiting: false, composerEmpty: true, ...over}) as never;

// What the console holds when each place has real data behind it.
const filled: Partial<State> = {
  workspace: '~/x', sessionId: 'abc-123',
  policy: [['fs:read', 'allowed'], ['fs:write', 'allowed'], ['process:spawn', 'allowed'],
           ['network:read', 'allowed'], ['vcs:write', 'needs-approval'], ['undeclared', 'needs-approval']],
  languages: [['en', 'English'], ['ar', 'العربية']],
  engineFacts: ['engine · open', 'session · abc-123'],
  record: [{id: 'g1', goal: 'build a thing', status: 'completed', at: '2026-08-28 06:00'}],
  conversations: [{id: 's1', goals: 3, last: 'a real goal', at: '2026-08-28 05:00'}],
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
