// Rule 3, checked: the window moves, the content never shrinks.
//
// Run with `npx tsx src/viewport.test.ts`. No framework — a list of cases and
// a count, because a test that needs a runner to explain it is a test nobody
// runs while they are deciding something.
import {START, reflow, scroll, windowOnto, type Viewport} from './viewport.js';

const content = Array.from({length: 100}, (_, i) => `line ${i}`);
let failures = 0;

const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};

console.log('\nthe window starts at the end, following');
{
  const w = windowOnto(content, START, 10);
  check('shows the last 10 rows', w.rows[0], 'line 90');
  check('90 rows above it', w.above, 90);
  check('nothing below', w.below, 0);
}

console.log('\nscrolling back stops it following');
{
  const v = scroll(START, {kind: 'lines', delta: -5}, 100, 10);
  check('offset moved back 5', v.offset, 85);
  check('no longer following', v.following, false);
  const w = windowOnto(content, v, 10);
  check('first row is line 85', w.rows[0], 'line 85');
  check('5 rows below', w.below, 5);
}

console.log('\nnothing is ever lost');
{
  let v: Viewport = START;
  for (let i = 0; i < 40; i++) v = scroll(v, {kind: 'lines', delta: -3}, 100, 10);
  check('stops at the top, never past it', v.offset, 0);
  const w = windowOnto(content, v, 10);
  check('the oldest line is still there', w.rows[0], 'line 0');
  check('and 90 rows are below, not gone', w.below, 90);
}

console.log('\nhalf a page, a page, top, bottom');
{
  check('half page up', scroll(START, {kind: 'halfPage', delta: -1}, 100, 20).offset, 70);
  check('page up', scroll(START, {kind: 'page', delta: -1}, 100, 20).offset, 61);
  check('top', scroll(START, {kind: 'top'}, 100, 20).offset, 0);
  const atTop = scroll(START, {kind: 'top'}, 100, 20);
  check('bottom returns and follows', scroll(atTop, {kind: 'bottom'}, 100, 20), {offset: 80, following: true});
}

console.log('\ncontent shorter than the window');
{
  const short = content.slice(0, 4);
  const w = windowOnto(short, START, 20);
  check('shows all of it', w.rows.length, 4);
  check('nothing above', w.above, 0);
  check('nothing below', w.below, 0);
  check('cannot scroll past nothing', scroll(START, {kind: 'lines', delta: -9}, 4, 20).offset, 0);
}

console.log('\na resize recomputes, it does not drag the reader');
{
  const following = reflow(START, 100, 30);
  check('following stays at the new end', following, {offset: 70, following: true});

  const readBack = scroll(START, {kind: 'lines', delta: -40}, 100, 10);
  check('a reader is at 50', readBack.offset, 50);
  check('a taller window keeps their first row', reflow(readBack, 100, 30).offset, 50);

  const nearEnd = scroll(START, {kind: 'lines', delta: -2}, 100, 10);
  check('and clamps when the window grows past it', reflow(nearEnd, 100, 95), {offset: 5, following: true});
}

console.log(failures === 0 ? '\nall good.\n' : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
