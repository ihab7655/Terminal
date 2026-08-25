import {decode} from '../src/keys.ts';
const cases = [
  ['NUL', String.fromCharCode(0)],
  ['a letter', 'a'],
  ['Enter', '\r'],
  ['Escape', String.fromCharCode(27)],
  ['space', ' '],
  ['Ctrl+K', String.fromCharCode(11)]
];
const isRealKey = k => !k.ctrl && (k.name !== '' || [...k.text].some(c => c >= ' '));
for (const [name, chunk] of cases) {
  const k = decode(chunk)[0];
  console.log(`  ${name.padEnd(10)} -> ${JSON.stringify(k)}  skips: ${isRealKey(k)}`);
}
