// Replay a recording onto a virtual screen and print chosen frames.
import fs from 'node:fs';
import {screenOf} from './screen-of.mjs';
const E = String.fromCharCode(27);
const raw = fs.readFileSync(process.argv[2], 'latin1');
const cols = Number(process.argv[3] ?? 92), rows = Number(process.argv[4] ?? 28);
const pick = process.argv[5];
const utf = s => Buffer.from(s, 'latin1').toString('utf8');
const frames = [];
for (let i = raw.indexOf(E + '[?2026h'); i >= 0; i = raw.indexOf(E + '[?2026h', i + 1)) {
  const end = raw.indexOf(E + '[?2026l', i);
  if (end < 0) break;
  frames.push(screenOf(utf(raw.slice(i, end + 8)), cols, rows).join('\n').replace(/\s+$/, ''));
}
const wanted = pick ? pick.split(',').map(n => Number(n) < 0 ? frames.length + Number(n) : Number(n)) : [];
if (wanted.length === 0) { console.log(`${frames.length} frames`); process.exit(0); }
for (const n of wanted) {
  console.log(`\n\x1b[7m frame ${n}/${frames.length} \x1b[0m`);
  console.log(frames[n] ?? '(none)');
}
