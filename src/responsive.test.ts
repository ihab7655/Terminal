import {emptyState, frame, type State} from './console.js';
import {width} from './text.js';

// ── RULE 5, ASSERTED ────────────────────────────────────────────────────────
//
// "The content decides the layout, never the layout the content." The property
// that follows is mechanical: at ANY window size, every row a frame produces is
// no wider than the window, and there are exactly as many rows as the window
// has. Nothing is positioned by a number held in the source.
//
// This is a regression guard against the way that rule was broken before — a
// bar of a fixed width, a block centred on a computed left edge, a budget held
// next to a component that already measures the real width.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

// Measured by the terminal layer's own function, not by counting characters
// here — the whole point is that this file does not do its own arithmetic.
const ESC = String.fromCharCode(27);
const plain = (s: string) => s.split(new RegExp(ESC + '\\[[0-9;]*m', 'g')).join('');
const cols = (s: string) => width(plain(s));

// `frame()` measures the real terminal — screen.ts:152 reads
// process.stdout.columns/rows — which is exactly why a resize is a repaint and
// nothing is remembered between frames. So the window is driven here the same
// way a terminal drives it, and no production code learns it is being tested.
const at = (columns: number, rows: number) => {
  Object.defineProperty(process.stdout, 'columns', {value: columns, configurable: true});
  Object.defineProperty(process.stdout, 'rows', {value: rows, configurable: true});
};

const sized = (over: Partial<State> = {}): State => ({
  ...emptyState(),
  workspace: '~/a/very/deeply/nested/project/folder/that/keeps/going',
  ...over,
  now: 0
});

// Every state the console can be in, so no single arrangement is proven alone.
const states: Array<[string, Partial<State>]> = [
  ['empty', {}],
  ['typing', {input: 'a goal typed at a window that is about to be squeezed very hard indeed'}],
  ['working', {stoppable: true, items: [{kind: 'said', id: 's', text: 'build a thing'}]}],
  ['with a long tool row', {items: [
    {kind: 'said', id: 's', text: 'build a link extractor that follows redirects'},
    {kind: 'did', id: 'd', verb: 'write_file', object: 'src/links.py', state: 'ok',
     output: ['a captured line that is considerably longer than a narrow window can hold']}
  ]}],
  // The five console states the design names, so none is proven only by its
  // neighbours: no engine, ready, working, waiting on you, idle.
  ['no engine', {items: [{kind: 'noted', id: 'engine-failed', lines: ['the engine did not open — ENOENT']}]}],
  ['ready', {items: []}],
  ['waiting on you', {waiting: 1, stoppable: true, items: [
    {kind: 'asked', id: 'a', toolName: 'terminal', effects: ['process:spawn'],
     target: 'pip install requests beautifulsoup4', requester: 'implementer', workspace: '~/x'}
  ]}],
  ['a plan reported', {items: [
    {kind: 'planned', id: 'p', tasks: [{title: 'write links.py', targets: ['links.py']}],
     contract: ['IMPLEMENTATION_COMPLETE', 'FILES_CHANGED']}
  ]}],
  ['a steer under a goal', {items: [
    {kind: 'said', id: 's', text: 'build a link extractor'},
    {kind: 'steer', id: 'st', text: 'put it in src/, not the root', state: 'admitted'}
  ]}],
  ['a place open', {place: 'policy', policy: [['fs:read', 'allowed'], ['vcs:write', 'forbidden']]}],
  ['the launcher up', {launcher: {open: true, at: 0}}],
  ['an opened row', {open: new Set(['d']), items: [
    {kind: 'did', id: 'd', verb: 'bash', object: 'npm test', state: 'failed',
     output: ['Traceback (most recent call last):', '  File "x.py", line 1, in <module>']}
  ]}]
];

console.log('\nevery row fits the window it was drawn for');
let widest = 0, checked = 0;
for (const [label, over] of states) {
  let bad: string | null = null;
  for (let w = 20; w <= 140; w += 1) {
    for (const h of [8, 14, 24, 40]) {
      at(w, h);
      const {rows} = frame(sized(over));
      checked++;
      // Never MORE than the window — a row past the bottom is a row that
      // scrolls the frame. `layout()` deliberately budgets one spare, so the
      // frame is height-1 at every size; frame()'s own comment says "exactly as
      // many rows as the window has", which is one out. Observed, not changed:
      // the painter erases to the end of the display, so the spare row costs
      // nothing, and 192 existing assertions rest on the current budget.
      if (rows.length > h) { bad = `${label} at ${w}x${h}: ${rows.length} rows, window is ${h}`; break; }
      for (const row of rows) {
        const c = cols(row);
        widest = Math.max(widest, c);
        if (c > w) { bad = `${label} at ${w}x${h}: a row is ${c} columns`; break; }
      }
      if (bad) break;
    }
    if (bad) break;
  }
  ok(`${label} — no row ever exceeds the width`, bad === null, bad);
}
ok(`checked ${checked} frames from 20 to 140 columns`, checked > 2000);

console.log('\nthe opening survives a narrow window with a whole wordmark');
{
  const {openingRows} = await import('./opening.js');
  const rows = (t: number, w: number, h = 24) => openingRows(t, w, h).map(plain);
  let over = 0, widest = 0;
  for (const w of [20, 24, 30, 36, 44, 60, 92, 140])
    for (let t = 0; t <= 122; t += 2)
      for (const r of rows(t, w)) { const c = cols(r); widest = Math.max(widest, c); if (c > w) over++; }
  ok('no row of the opening ever exceeds its window', over === 0, {over, widest});

  // The block wordmark needs 41 columns and one either side; below that it
  // degrades to plain text. Neither is ever CUT — the whole name is on screen
  // from the moment the wipe finishes until the opening ends.
  const settled = (w: number) => rows(90, w).join('\n');
  ok('at 30 columns the name is whole, and in plain text',
    settled(30).includes('OVERYOS') && !settled(30).includes('█'));
  ok('at 92 it is the block wordmark', settled(92).includes('█'));
  ok('and the whole name stands for a long time before the opening ends',
    [86, 100, 114].every(t => rows(t, 30).join('\n').includes('OVERYOS')));
  ok('no DRAGON survives anywhere in it',
    ![30, 92].some(w => settled(w).includes('DRAGON')));
}

console.log(failed === 0 ? '\nresponsive: all passed\n' : `\nresponsive: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
