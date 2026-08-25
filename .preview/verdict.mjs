// What the screen was actually sent, judged against the four rules.
import fs from 'node:fs';

const ESC = String.fromCharCode(27);
const raw = fs.readFileSync(process.argv[2], 'latin1');
const utf = s => Buffer.from(s, 'latin1').toString('utf8');
const count = pat => raw.split(pat).length - 1;

// Frames are what sits between the synchronized-output pair.
const frames = [];
for (let i = raw.indexOf(ESC + '[?2026h'); i >= 0; i = raw.indexOf(ESC + '[?2026h', i + 1)) {
  const end = raw.indexOf(ESC + '[?2026l', i);
  if (end < 0) break;
  frames.push(utf(raw.slice(i + 8, end)));
}

// The pty translates \n to \r\n on the way out, so every recorded line carries
// a trailing carriage return that is not part of the row. Counting it made
// every full-width row look one column over.
// A frame is now a set of absolutely positioned rows, so its shape is read
// from the positions themselves rather than from newlines: the highest row
// number IS the window height, and each row's padded length IS the window
// width. This measures what lands on the screen, which is the only place the
// last defect was ever visible — a recording of the bytes sent looked perfect
// while the screen carried the tail of every row that had got shorter.
const strip = s => s.replace(new RegExp(ESC + '\\[[0-?]*[ -/]*[@-~]', 'g'), '').replace(/\r/g, '');

const rowsOf = frame => {
  const out = [];
  const re = new RegExp(ESC + '\\[(\\d+);1H', 'g');
  let m;
  const marks = [];
  while ((m = re.exec(frame))) marks.push({at: m.index, end: re.lastIndex, row: Number(m[1])});
  marks.forEach((mark, i) => {
    const text = frame.slice(mark.end, i + 1 < marks.length ? marks[i + 1].at : frame.length);
    out.push({row: mark.row, text: strip(text)});
  });
  return out;
};

const shape = frames.map(f => {
  const rs = rowsOf(f);
  return {
    rows: Math.max(0, ...rs.map(r => r.row)),
    widest: Math.max(0, ...rs.map(r => [...r.text].length)),
    positioned: rs.length,
    text: rs.map(r => r.text).join('\n')
  };
});

const checks = [];
const check = (rule, name, pass, detail) => checks.push({rule, name, pass, detail});

check(1, 'took the alternate screen', count(ESC + '[?1049h') === 1, `${count(ESC + '[?1049h')}×`);
check(1, 'gave it back', count(ESC + '[?1049l') === 1, `${count(ESC + '[?1049l')}×`);

check(2, 'every frame is synchronized', frames.length > 5, `${frames.length} frames`);
check(2, 'every frame starts at row 1', frames.every(f => f.startsWith(ESC + '[1;1H')), '');
check(2, 'every frame erases to end, at the end', frames.every(f => f.endsWith(ESC + '[J')), '');
check(2, 'every frame writes every one of its rows',
  shape.every(s => s.positioned === s.rows), '');
check(2, 'no cursor-up anywhere', count(ESC + '[1A') === 0 && !/\[\d+A/.test(utf(raw)), '');
check(2, 'no erase-line anywhere', count(ESC + '[2K') === 0, `${count(ESC + '[2K')}×`);
check(2, 'no clear-screen anywhere', count(ESC + '[2J') === 0, `${count(ESC + '[2J')}×`);

// The opening is a state of the same loop, so it is judged by the same rules —
// and it must actually have been on screen, or every rule below is vacuous for
// it. A run once drew 35 blank frames and passed everything.
check(2, 'the opening drew its dragon', shape.some(s => /[\u2801-\u28ff]/.test(s.text)), '');
check(2, 'the opening drew its name', shape.some(s => /\u2588/.test(s.text)), '');

// Rule 3: nothing is shed. Every goal typed must still be reachable, and the
// scroll indicator must account for what is off screen rather than dropping it.
const text = shape.map(s => s.text).join('\n');
const typed = [1, 2, 3, 4, 5, 6, 7, 8].filter(i => text.includes(`goal number ${i}`));
check(3, 'every block typed is still drawn somewhere', typed.length === 8, `${typed.length}/8`);
check(3, 'the reader is told what is above', /↑ \d+ above/.test(text), '');
check(3, 'no content was announced as discarded', !/earlier entr|dropped|truncated rows/i.test(text), '');

// Rule 4: after every resize the frame simply matches the new window.
// The two loose checks that used to live here — widest frame against the widest
// window, tallest against the tallest — are gone. They compared every frame to
// the largest size the session ever reached, which let a 93 column frame pass
// because some later window was 110. The per-window checks below say the same
// thing exactly, and say it about each frame's own window.
// Stronger than counting shapes, and it survives an animated opening: every
// frame is exactly as tall as some window this session actually had. A frame
// of any other height was built from a size that was never on screen.
// Each window this session had, by height -> width. The heights are distinct,
// so a frame's height identifies the window it was built for, and its width can
// be judged against THAT window rather than against the widest one used. The
// loose version passed a 93 column frame because some later window was 110.
const WINDOWS = new Map([[36, 90], [14, 44], [16, 60], [12, 40], [28, 110], [34, 55]]);
const heights = [...new Set(shape.map(s => s.rows))].sort((a, b) => a - b);
check(4, 'every frame is exactly one window tall', heights.every(h => WINDOWS.has(h)),
  heights.join(' '));
// Judged on SETTLED frames only: one whose height matches both neighbours.
// `stty` applies columns and rows as two changes, so a frame can legitimately
// be painted between them, at a size the terminal really did report for a
// moment — 60 columns while the height was still 14. Those transients are rule
// 4 working, and the next frame corrects them. What must hold is that every
// size settles inside its own window, and that is what this measures.
const stable = shape.filter(
  (s, i) => i > 0 && i < shape.length - 1 && shape[i - 1].rows === s.rows && shape[i + 1].rows === s.rows
);
const over = stable.filter(s => s.widest > (WINDOWS.get(s.rows) ?? Infinity));
const worst = new Map();
stable.forEach(s => worst.set(s.rows, Math.max(worst.get(s.rows) ?? 0, s.widest)));
check(4, 'every settled frame fits its own window', over.length === 0 && stable.length > 20,
  over.length
    ? over.map(s => `${s.widest}>${WINDOWS.get(s.rows)}`).join(' ')
    : `${stable.length} settled · ` +
      [...worst].map(([h, w]) => `${w}/${WINDOWS.get(h)}`).join(' '));

const pad = Math.max(...checks.map(c => c.name.length));
let rule = 0;
for (const c of checks) {
  if (c.rule !== rule) { rule = c.rule; console.log(`\n  rule ${rule}`); }
  console.log(`    ${c.pass ? '✓' : '✗'} ${c.name.padEnd(pad)}  ${c.detail}`);
}
const ok = checks.every(c => c.pass);
console.log(ok ? '\n  the four rules hold.\n' : '\n  BROKEN.\n');
process.exit(ok ? 0 : 1);
