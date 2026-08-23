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

console.log(failures === 0 ? '\nall good.\n' : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
