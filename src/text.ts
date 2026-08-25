// Turning text into rows, at the width the window has right now.
//
// This is the whole of layout, and it is a function rather than a component
// tree on purpose: rows are produced fresh every frame from the current width,
// so a resize cannot leave anything behind to reconcile. There is nothing
// remembered between frames to be wrong.
//
// Wrapping is done here rather than left to the terminal, for one reason that
// matters when you own the screen: the frame is painted from HOME with a fixed
// number of rows, so a line the terminal decides to wrap is a row the frame did
// not account for and the bottom of the picture falls off. Every row this
// module returns fits the width it was given.

// ── MEASURING TEXT: COLUMNS, NOT CHARACTERS ──────────────────────────────────
//
// `.length` counts UTF-16 code units, and a terminal counts columns. The two
// disagree twice over, and both showed up in one real Arabic session:
//
//   * an emoji is TWO code units, so `slice(width)` can cut between them and
//     leave half a character behind. On screen that was `😊st` — half a smile
//     welded to the debris of the next word.
//   * an emoji occupies TWO columns, so a row measured as fitting overflows the
//     frame by one and pushes the bottom row off.
//
// Arabic itself is one column per character and needs nothing special here.
// What it does need is never to be cut mid-character, which is the first bullet.
//
// So everything below measures in columns and cuts only at character
// boundaries. Bidirectional REORDERING is still the terminal's job — this
// module never reverses anything, it only refuses to hand the terminal a broken
// character or an over-wide row.

/** Characters that take two columns in a terminal: emoji, CJK, and friends. */
function isWide(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) || // CJK radicals … Yi
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) || // Hangul syllables
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK compatibility
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) || // CJK forms
    (codePoint >= 0xff00 && codePoint <= 0xff60) || // fullwidth
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f9ff) || // emoji
    (codePoint >= 0x1fa70 && codePoint <= 0x1faff)
  );
}

/** Zero-width: combining marks (Arabic vowels among them) and joiners. */
function isZeroWidth(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x064b && codePoint <= 0x065f) || // Arabic diacritics
    codePoint === 0x0670 ||
    (codePoint >= 0x200b && codePoint <= 0x200f) || // ZWSP … RLM
    codePoint === 0xfeff
  );
}

const charWidth = (ch: string): number => {
  const cp = ch.codePointAt(0)!;
  if (isZeroWidth(cp)) return 0;
  return isWide(cp) ? 2 : 1;
};

/** How many columns this text occupies. The one measurement everything here uses. */
export function width(text: string): number {
  let n = 0;
  for (const ch of text) n += charWidth(ch);
  return n;
}

/** The longest prefix that fits in `columns`, never splitting a character. */
function take(text: string, columns: number): {taken: string; rest: string} {
  let taken = '';
  let used = 0;
  let i = 0;
  for (const ch of text) {
    const w = charWidth(ch);
    if (used + w > columns) break;
    taken += ch;
    used += w;
    i += ch.length;
  }
  return {taken, rest: text.slice(i)};
}

/**
 * Greedy word wrap. A word longer than the line is broken across as many as it
 * needs, and a line break in the text is a line break on screen.
 *
 * NEWLINES ARE NOT WHITESPACE HERE, THEY ARE ROWS. This used to split on spaces
 * alone, so `\n` travelled inside a "word" and was handed to the terminal
 * unaccounted for: the frame counted one row and the terminal drew five, and the
 * bottom of the picture fell off. Seen on a real answer — the engine's summary
 * of a finished goal arrived as four lines and rendered as debris with its
 * openings missing.
 *
 * Every row this returns is one row on screen. That is the property the frame
 * depends on, and it cannot hold if a row can contain a break.
 */
export function wrap(text: string, columns: number): string[] {
  if (columns <= 0) return [text];
  // \r\n and a lone \r both count as one break — a terminal treats a stray \r
  // as a carriage return and would otherwise overwrite the row just drawn.
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 1) return lines.flatMap(line => wrap(line, columns));

  // LEADING SPACE IS MEANING, NOT PADDING. Splitting on ' ' swallows it, and the
  // engine's answers contain code: a summary that showed
  //   for number in range(1, 11):
  //       print(number)
  // arrived on screen with the body unindented — the same four lines, saying
  // something Python would reject. Kept, and re-applied to continuation rows so
  // a wrapped block stays one block. Given up only when it would leave less
  // than half the line for text, which is the case where preserving it costs
  // more than it says.
  const indent = /^[ \t]*/.exec(text)![0].replace(/\t/g, '    ');
  if (indent !== '' && indent.length * 2 < columns) {
    return wrap(text.slice(/^[ \t]*/.exec(text)![0].length), columns - indent.length).map(
      row => indent + row
    );
  }

  const rows: string[] = [];
  let row = '';

  for (const word of text.split(' ')) {
    if (row === '') row = word;
    else if (width(row) + 1 + width(word) <= columns) row += ' ' + word;
    else {
      rows.push(row);
      row = word;
    }
    while (width(row) > columns) {
      const {taken, rest} = take(row, columns);
      // A character wider than the whole line would otherwise loop forever
      // taking nothing: give it its own row and move on.
      if (taken === '') {
        const first = [...row][0]!;
        rows.push(first);
        row = row.slice(first.length);
      } else {
        rows.push(taken);
        row = rest;
      }
    }
  }

  // The last row is dropped only when the line divided exactly and there is
  // something before it: `wrap('', n)` still answers with one empty row,
  // because a blank line is a row a caller asked for.
  if (row !== '' || rows.length === 0) rows.push(row);
  return rows;
}

/**
 * Cut to fit, with an ellipsis when something was cut. For rows that must not
 * wrap — so a break inside the text becomes a space rather than a second row
 * the frame never counted.
 */
export function fit(text: string, columns: number): string {
  if (columns <= 0) return '';
  if (/[\r\n]/.test(text)) text = text.replace(/\r\n|\r|\n/g, ' ');
  if (width(text) <= columns) return text;
  if (columns <= 1) return '…';
  return take(text, columns - 1).taken + '…';
}

/** Pad to exactly `columns`, cutting if it is over. Used where a column must line up. */
export function cell(text: string, columns: number): string {
  const cut = fit(text, columns);
  return cut + ' '.repeat(Math.max(0, columns - width(cut)));
}

/**
 * A label column and a body that wraps under itself.
 *
 * The continuation rows are indented to the body's own column rather than left
 * to fall against the frame edge — a wrapped line belongs under the line it
 * continues, and the two are told apart by nothing else.
 */
export function labelled(label: string, body: string, labelWidth: number, columns: number): string[] {
  const bodyWidth = Math.max(1, columns - labelWidth);
  const lines = wrap(body, bodyWidth);
  return lines.map((line, i) => (i === 0 ? cell(label, labelWidth) : ' '.repeat(labelWidth)) + line);
}

/**
 * Truncate to `width` VISIBLE columns, carrying escape sequences through
 * uncounted and closing with a reset if anything was cut.
 *
 * `fit` above measures the whole string, which is right for plain text and
 * wrong for a styled line: escapes occupy no columns at all. Compensating for the difference -- `fit(line, width + escapes)`
 * -- looks like it works and does not: it assumes every escape byte falls
 * before the cut, while the ones around the caret and the trailing reset fall
 * after it. Measured on a real session, that let a 76 column composer into a
 * 44 column window.
 */
const ESCAPE = '\u001B';

export function fitStyled(text: string, columns: number): string {
  if (columns <= 0) return '';
  let visible = 0;
  let out = '';
  let styled = false;
  for (let i = 0; i < text.length; ) {
    if (text[i] === ESCAPE) {
      const end = text.indexOf('m', i);
      const seq = end < 0 ? text.slice(i) : text.slice(i, end + 1);
      out += seq;
      styled = true;
      i += seq.length;
      continue;
    }
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    const w = charWidth(ch);
    // One column left and more to come: spend it on the ellipsis rather than on
    // a character that would sit at the edge with the rest silently gone.
    if (visible + w > columns - 1 && hasMoreVisible(text, i + ch.length)) {
      return out + '\u2026' + (styled ? `${ESCAPE}[0m` : '');
    }
    if (visible + w > columns) break;
    out += ch;
    visible += w;
    i += ch.length;
  }
  return out;
}

function hasMoreVisible(text: string, from: number): boolean {
  for (let i = from; i < text.length; ) {
    if (text[i] === ESCAPE) {
      const end = text.indexOf('m', i);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    return true;
  }
  return false;
}
