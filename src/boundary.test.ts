import {readFileSync, readdirSync} from 'node:fs';

// ── CONSOLE DESCRIBES INTENT · TERMINAL RENDERS IT ──────────────────────────
//
// We build a console ON the terminal layer. We do not build a terminal, and we
// do not build a second layout engine beside the one that exists.
//
// The terminal layer — screen, text, cells, viewport, rail — owns measuring,
// cutting, wrapping, fitting, and adapting to the window. Everything above it
// owns CONTENT and LOGICAL STRUCTURE: what appears, what it means, what state
// it is in, and which of two things matters more right now.
//
// So this file is a boundary, enforced rather than described. It fails on the
// things that mean console code has started doing the terminal's job:
//
//   * a truncation budget invented in the source, next to components that
//     already measure the real width (removed once already: a `budget = 28`
//     that cut a path while `rail()` was measuring the same edge correctly)
//   * a width or height compared against a number the source chose
//   * measuring the window anywhere but the one function that builds a frame
//
// What it deliberately does NOT ban: the two-column indent. `INDENT` is the
// design's tab stop — a property of the arrangement, like the rail's corners.
// It reserves nothing, measures nothing, and hides nothing; the row it prefixes
// is still cut and wrapped by `text.ts` at the real width.

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

/** The layer that is allowed to know about columns, rows and cutting. */
const TERMINAL = new Set(['screen.ts', 'text.ts', 'cells.ts', 'viewport.ts', 'rail.ts', 'keys.ts']);
/** Where a frame is assembled, and the loop that repaints it on resize. */
const MAY_MEASURE = new Set(['console.ts', 'index.ts']);

const sources = readdirSync('src')
  .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map(f => [f, readFileSync(`src/${f}`, 'utf8')] as const);
// Comments say what a rule is FOR and quote the numbers it forbids; the code is
// what is judged.
const code = (text: string) =>
  text.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

console.log('\nthe console does not do the terminal\'s work');

const above = sources.filter(([f]) => !TERMINAL.has(f));

ok('no truncation budget is invented above the terminal layer',
  above.every(([, t]) => !/\.slice\(\s*0\s*,\s*\d+\s*\)/.test(code(t))),
  above.filter(([, t]) => /\.slice\(\s*0\s*,\s*\d+\s*\)/.test(code(t))).map(([f]) => f));

ok('no width or height is compared against a chosen number',
  above.every(([, t]) => !/\b(width|columns|height|rows)\s*[<>]=?\s*\d/.test(code(t))),
  above.filter(([, t]) => /\b(width|columns|height|rows)\s*[<>]=?\s*\d/.test(code(t))).map(([f]) => f));

ok('nothing above the terminal layer names a width budget of its own',
  above.every(([, t]) => !/\b(budget|maxWidth|MAX_WIDTH|MAX_COLS|COLUMN_BUDGET)\b/.test(code(t))),
  above.filter(([, t]) => /\b(budget|maxWidth|MAX_WIDTH|MAX_COLS|COLUMN_BUDGET)\b/.test(code(t))).map(([f]) => f));

ok('only the frame builder and the loop measure the window',
  sources.every(([f, t]) => !/screenSize\(/.test(code(t)) || TERMINAL.has(f) || MAY_MEASURE.has(f)),
  sources.filter(([f, t]) => /screenSize\(/.test(code(t)) && !TERMINAL.has(f) && !MAY_MEASURE.has(f)).map(([f]) => f));

ok('the terminal layer imports nothing from above it',
  [...TERMINAL].every(f => {
    const t = sources.find(([n]) => n === f);
    return !t || !/from '\.\/(console|adapter|action|engine|session|opening|demo|history)\.js'/.test(t[1]);
  }));

console.log('\nand nothing that decides ever reads how it looks');

// The separation between appearance and permission, made mechanical. A profile
// names both — that is its whole job — but the modules that DECIDE must never
// import the ones that draw, or a colour could come to stand for a permission.
const decides = ['policy/decide.ts', 'policy/middleware.ts', 'settings/store.ts', 'session.ts'];
const readSrc = (rel: string) => {
  try { return readFileSync(`src/${rel}`, 'utf8'); } catch { return ''; }
};
ok('the policy and the settings never import a theme or a palette',
  decides.every(f => !/from '.*(theme|style)/.test(code(readSrc(f)))),
  decides.filter(f => /from '.*(theme|style)/.test(code(readSrc(f)))));

ok('themes.ts imports nothing at all — it can have no opinion about anything',
  !/^import /m.test(code(readSrc('theme/themes.ts'))));

ok('profiles.ts is the ONLY module naming both sides',
  /from '..\/settings\/store.js'/.test(readSrc('theme/profiles.ts')) &&
  /from '.\/themes.js'/.test(readSrc('theme/profiles.ts')));

ok('and it holds no state — a profile is an act, not a coupling',
  !/\blet\b/.test(code(readSrc('theme/profiles.ts'))));

console.log(failed === 0 ? '\nboundary: all passed\n' : `\nboundary: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
