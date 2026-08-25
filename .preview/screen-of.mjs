// A virtual screen: apply a byte stream and show what a person would see.
// The recording says what was SENT. This says what LANDS, which is the only
// thing the defect was ever visible in.
const E = String.fromCharCode(27);

export function screenOf(bytes, cols, rows) {
  const grid = Array.from({length: rows}, () => Array(cols).fill(' '));
  let r = 0, c = 0, wrap = true;
  for (let i = 0; i < bytes.length; ) {
    const ch = bytes[i];
    if (ch === E && bytes[i + 1] === '[') {
      const m = /^\x1b\[([0-9;?]*)([@-~])/.exec(bytes.slice(i));
      if (!m) { i++; continue; }
      const [all, args, cmd] = m;
      const n = args.split(';').map(x => (x === '' ? undefined : Number(x)));
      if (cmd === 'H') { r = (n[0] ?? 1) - 1; c = (n[1] ?? 1) - 1; }
      else if (cmd === 'J') {
        const mode = n[0] ?? 0;
        if (mode === 2) grid.forEach(row => row.fill(' '));
        else if (mode === 0) {
          for (let x = c; x < cols; x++) grid[r] && (grid[r][x] = ' ');
          for (let y = r + 1; y < rows; y++) grid[y].fill(' ');
        }
      } else if (cmd === 'K') { for (let x = c; x < cols; x++) grid[r] && (grid[r][x] = ' '); }
      else if (cmd === 'B') { r = Math.min(rows - 1, r + (n[0] ?? 1)); }
      else if (cmd === 'G') { c = (n[0] ?? 1) - 1; }
      else if (cmd === 'h' && args === '?7') wrap = true;
      else if (cmd === 'l' && args === '?7') wrap = false;
      i += all.length;
      continue;
    }
    if (ch === '\n') { r = Math.min(rows - 1, r + 1); i++; continue; }
    if (ch === '\r') { c = 0; i++; continue; }
    if (ch === E) { i++; continue; }
    if (r < rows && c < cols) grid[r][c] = ch;
    c++;
    if (c >= cols) { if (wrap) { c = 0; r = Math.min(rows - 1, r + 1); } else c = cols - 1; }
    i++;
  }
  return grid.map(row => row.join('').replace(/\s+$/, ''));
}
