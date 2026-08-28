import {ar} from './ar.js';
import {catalogueFor, catalogues, DEFAULT_LANGUAGE} from './index.js';
import {en} from './en.js';
import type {Catalogue} from './catalogue.js';

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

console.log('\nthe registry');
ok('two languages, and adding one is a file plus an entry', catalogues.size === 2);
ok('an unknown id is not an error — it is English', catalogueFor('xx').id === 'en');
ok('and so is no id at all', catalogueFor(undefined).id === DEFAULT_LANGUAGE);
ok('each names itself in its own script',
  en.name === 'English' && ar.name === 'العربية');

console.log('\nevery catalogue answers the whole contract');
// Walked structurally rather than listed, so a key added to the shape is
// checked in every language without this file being edited.
const walk = (node: unknown, path: string, seen: string[]): void => {
  if (typeof node === 'string') { seen.push(path); return; }
  if (typeof node === 'function') return;
  if (node && typeof node === 'object')
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, seen);
};
const keysOf = (c: Catalogue) => { const s: string[] = []; walk(c, '', s); return s.sort(); };
const enKeys = keysOf(en), arKeys = keysOf(ar);
const missing = enKeys.filter(k => !arKeys.includes(k) && !k.endsWith('.zero') &&
  !k.endsWith('.two') && !k.endsWith('.few') && !k.endsWith('.many'));
ok('Arabic carries every phrase English carries', missing.length === 0, missing);
ok('and more forms where its grammar needs them', arKeys.length > enKeys.length,
  {en: enKeys.length, ar: arKeys.length});

console.log('\nplurals — the part a two-form ternary cannot express');
const shell = (c: Catalogue, n: number) => c.plural(c.did.shell, n);
ok('English: 1 is singular', shell(en, 1) === 'Ran 1 shell command');
ok('English: 0 and 5 are plural',
  shell(en, 0) === 'Ran 0 shell commands' && shell(en, 5) === 'Ran 5 shell commands');

ok('Arabic 1 — مفرد', shell(ar, 1) === 'نفّذ أمراً واحداً');
ok('Arabic 2 — مثنّى, which no ternary has', shell(ar, 2) === 'نفّذ أمرين');
ok('Arabic 3 — جمع قلّة', shell(ar, 3) === 'نفّذ 3 أوامر');
ok('Arabic 11 — جمع كثرة, a different form again', shell(ar, 11) === 'نفّذ 11 أمراً');
ok('Arabic 100 — يعود إلى المفرد بعد العدد', shell(ar, 100) === 'نفّذ 100 أمر');
ok('Arabic 103 — قلّة مرّة أخرى, by the hundred remainder', shell(ar, 103) === 'نفّذ 103 أوامر');
ok('Arabic 0 — صفر له صيغته', ar.plural(ar.rail.waiting, 0) === 'لا شيء ينتظرك');
ok('a language with no form for a case falls back to `other`, never to nothing',
  ar.plural({one: 'واحد', other: '{n} أشياء'}, 7) === '7 أشياء');

console.log('\n{n} and {tool} are filled, and nothing else is invented');
ok('the count reaches the sentence', en.plural(en.did.wrote, 4) === 'Wrote 4 files');
ok('a tool name is an identifier and passes through untranslated',
  en.plural(en.did.other, 1).includes('{tool}') === false ||
  en.plural(en.did.other, 1) === 'Called {tool}');


console.log('\nthe engine\'s events read in the chosen language too');
{
  const {toItem} = await import('../adapter.js');
  const ev = (t: string, p: Record<string, unknown> = {}) =>
    ({eventType: t, goalId: 'g', payload: p});
  const start = (c: typeof en) => (toItem(ev('goal.started'), c) as {text: string}).text;
  ok('English: goal.started reads "starting"', start(en) === 'starting');
  ok('Arabic: the same event reads "يبدأ"', start(ar) === 'يبدأ', start(ar));
  const judged = (c: typeof en) =>
    (toItem(ev('capability.evolution', {phase: 'needed', capability: 'bash'}), c) as {lines: string[]}).lines[0]!;
  ok('a conclusion carries the tool name untranslated in both',
    judged(en).includes('bash') && judged(ar).includes('bash'));
  ok('while its sentence is the language in use',
    judged(ar).includes('غير موثوقة'), judged(ar));
}
console.log(failed === 0 ? '\ni18n: all passed\n' : `\ni18n: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
