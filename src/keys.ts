// Keyboard, read raw.
//
// A CHUNK IS NOT A KEY. Typing fast, pasting, or a script feeding stdin all
// deliver several keys in one read, and one of them is often Enter at the end
// of a line. Decoding a chunk as a single key keeps only its first meaning:
// measured, eight lines each ending in a carriage return arrived as one
// 142-character run in the composer, because every Enter fell through the
// printable filter and vanished.
//
// So a chunk is split into keys, and the caller is handed them one at a time.

export type KeyName =
  | ''
  | 'up' | 'down' | 'left' | 'right'
  | 'enter' | 'escape' | 'tab' | 'backspace' | 'delete'
  | 'home' | 'end' | 'pageUp' | 'pageDown';

export type Key = {
  /** A settled name for the keys that have one; empty for ordinary text. */
  name: KeyName;
  /** The printable characters. A pasted run arrives whole, as one key. */
  text: string;
  ctrl: boolean;
};

const ESC = '\u001B';
const DEL = '\u007f';

// Longest first, so ESC[1~ is never read as ESC[1 followed by a tilde.
const SEQUENCES: ReadonlyArray<readonly [string, KeyName]> = [
  [ESC + '[1~', 'home'],
  [ESC + '[4~', 'end'],
  [ESC + '[5~', 'pageUp'],
  [ESC + '[6~', 'pageDown'],
  [ESC + '[3~', 'delete'],
  [ESC + '[A', 'up'],
  [ESC + '[B', 'down'],
  [ESC + '[C', 'right'],
  [ESC + '[D', 'left'],
  [ESC + '[H', 'home'],
  [ESC + '[F', 'end'],
  [ESC + 'OA', 'up'],
  [ESC + 'OB', 'down'],
  [ESC + 'OC', 'right'],
  [ESC + 'OD', 'left']
];

const SINGLE: Readonly<Record<string, KeyName>> = {
  '\r': 'enter',
  '\n': 'enter',
  '\t': 'tab',
  [DEL]: 'backspace',
  '\b': 'backspace',
  [ESC]: 'escape'
};

/** Every key in one chunk, in the order they were typed. */
export function decode(chunk: string): Key[] {
  const keys: Key[] = [];
  let text = '';

  const flush = () => {
    if (text !== '') keys.push({name: '', text, ctrl: false});
    text = '';
  };

  let i = 0;
  while (i < chunk.length) {
    const rest = chunk.slice(i);

    const match = SEQUENCES.find(([seq]) => rest.startsWith(seq));
    if (match) {
      flush();
      keys.push({name: match[1], text: '', ctrl: false});
      i += match[0].length;
      continue;
    }

    const ch = chunk[i]!;
    const named = SINGLE[ch];
    if (named) {
      flush();
      keys.push({name: named, text: '', ctrl: false});
      i++;
      continue;
    }

    // A control character is its letter minus 0x60: Ctrl+A is 0x01.
    if (ch < ' ') {
      flush();
      keys.push({name: '', text: String.fromCharCode(ch.charCodeAt(0) + 96), ctrl: true});
      i++;
      continue;
    }

    text += ch;
    i++;
  }

  flush();
  return keys;
}

/** Read keys until the returned function is called. Leaves the terminal as it was found. */
export function onKey(handler: (key: Key) => void, input: NodeJS.ReadStream = process.stdin): () => void {
  const wasRaw = input.isRaw ?? false;
  if (input.isTTY) input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');

  const listener = (chunk: string) => {
    for (const key of decode(chunk)) handler(key);
  };
  input.on('data', listener);

  return () => {
    input.off('data', listener);
    if (input.isTTY) input.setRawMode(wasRaw);
    input.pause();
  };
}
