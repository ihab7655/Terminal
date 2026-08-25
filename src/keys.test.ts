// A chunk is not a key. This is the property that failed once already: eight
// lines each ending in a carriage return became one 142-character run in the
// composer, because a chunk carrying text AND Enter was read as text alone.
import {decode} from './keys.js';

const ESC = String.fromCharCode(27);
const DEL = String.fromCharCode(127);

let failures = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`);
};

const names = (chunk: string) => decode(chunk).map(k => k.name || `«${k.text}»${k.ctrl ? ':ctrl' : ''}`);

console.log('\none key at a time');
check('a letter', names('a'), ['«a»']);
check('Enter', names('\r'), ['enter']);
check('Escape', names(ESC), ['escape']);
check('Backspace', names(DEL), ['backspace']);
check('Ctrl+C', names(''), ['«c»:ctrl']);
check('up arrow', names(ESC + '[A'), ['up']);
check('page down', names(ESC + '[6~'), ['pageDown']);

console.log('\nseveral keys in one chunk — the case that broke');
check('text then Enter', names('hello\r'), ['«hello»', 'enter']);
check('two lines at once', names('one\rtwo\r'), ['«one»', 'enter', '«two»', 'enter']);
check('text, arrow, more text', names('ab' + ESC + '[D' + 'cd'), ['«ab»', 'left', '«cd»']);
check('a paste ending in Enter', names('a long pasted line\r'), ['«a long pasted line»', 'enter']);
check('Ctrl+C after text', names('x'), ['«x»', '«c»:ctrl']);

console.log('\nsequences are never mistaken for their prefixes');
check('ESC[1~ is home, not ESC[1 + tilde', names(ESC + '[1~'), ['home']);
check('a bare ESC is Escape', names(ESC), ['escape']);
check('ESC followed by text', names(ESC + 'abc'), ['escape', '«abc»']);

console.log('\nnothing printable is lost');
{
  const line = 'goal number 1, long enough that it wraps on a narrow window';
  const keys = decode(line + '\r');
  check('the whole line arrives as one key', keys[0]!.text, line);
  check('and the Enter after it', keys[1]!.name, 'enter');
  check('and nothing else', keys.length, 2);
}

// ── The wheel ────────────────────────────────────────────────────────────────
//
// In the alternate buffer many terminals turn a wheel notch into an up/down
// arrow. Harmless while the arrows scrolled; not harmless now that they recall
// history — a person reading back would have watched their draft be replaced.
// So the wheel is asked for directly (screen.ts) and arrives as itself.
{
  const E = '\u001B';
  check('a wheel turn up is a wheel turn', names(`${E}[<64;10;5M`), ['wheelUp']);
  check('and down', names(`${E}[<65;10;5M`), ['wheelDown']);
  check('the release form is read too, not left as text', names(`${E}[<64;10;5m`), ['wheelUp']);
  check('a left click is a click, and carries its row', names(`${E}[<0;10;5M`), ['click']);
  check('and only on press — a release would toggle the same row shut again',
    names(`${E}[<0;10;5m`), []);
  check('the row is the one the terminal reported', decode(`${E}[<0;10;7M`)[0]!.row, 7);
  check('a middle or right click is dropped rather than leaking as text',
    names(`${E}[<1;10;5M${E}[<2;10;5M`), []);
  check('a wheel turn does not swallow what follows it',
    names(`${E}[<65;1;1Mhi`), ['wheelDown', '«hi»']);
  check('an arrow is still an arrow', names(`${E}[A`), ['up']);
  check('a wheel report with large coordinates still parses',
    names(`${E}[<64;1000;900M`), ['wheelUp']);
}

// ── Paste ────────────────────────────────────────────────────────────────────
//
// Without bracketed paste a terminal hands pasted text over as if typed, so a
// paste containing a line break IS Enter — three pasted lines sent three goals
// before the person could read what they had pasted. Reported from a real
// session, and the reason screen.ts asks for ESC[?2004h.
{
  const E = '\u001B';
  const paste = (body: string) => `${E}[200~${body}${E}[201~`;

  check('a pasted line is text, not a key', names(paste('hello')), ['«hello»']);
  check('and it is marked as pasted', decode(paste('hello'))[0]!.pasted, true);
  check('line breaks inside a paste do NOT send',
    names(paste('one\ntwo\nthree')), ['«one two three»']);
  check('\\r\\n inside a paste is one space too', names(paste('a\r\nb')), ['«a b»']);
  check('typing after a paste still works', names(`${paste('x')}y`), ['«x»', '«y»']);
  check('a real Enter after a paste still sends', names(`${paste('x')}\r`), ['«x»', 'enter']);
  check('an unterminated paste keeps what arrived', names(`${E}[200~half`), ['«half»']);
  check('an empty paste is nothing at all', names(paste('')), []);
  check('typed text is not marked as pasted', decode('abc')[0]!.pasted, undefined);
}

console.log(failures === 0 ? '\nall good.\n' : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
