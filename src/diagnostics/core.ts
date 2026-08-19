// What sits around the emblem: nothing structural. No frame, no ring, no sweep
// — those read as a borrowed HUD and pull attention off the mark itself. Just a
// fine dust that gathers near it and breathes, so the space feels alive without
// competing with what is in it.
const TAU = Math.PI * 2;

// Single-dot braille glyphs. Each sits in a different corner of its cell, so a
// scattering of them reads as grain rather than as a row of full stops.
const GRAIN = ['⠁', '⠂', '⠄', '⠈', '⠐', '⠠'];

export type Mark = {row: number; column: number; ch: string; bright: boolean};

function hash(a: number, b: number, salt: number) {
  let value = (a + 1) * 374761393 + (b + 1) * 668265263 + (salt + 1) * 1442695041;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

const DENSITY = 0.34;
const INNER = 0.6; // stays clear of the mark itself
const PEAK = 0.85;
const OUTER = 1.3;

export function aura(cols: number, rows: number, tick: number, energy: number): Mark[] {
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const marks: Mark[] = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < cols; column++) {
      // Normalised so the field is round on screen, not an upright ellipse.
      const dx = (column - cx) / ((cols - 1) / 2);
      const dy = (row - cy) / ((rows - 1) / 2);
      const distance = Math.hypot(dx, dy);
      if (distance < INNER || distance > OUTER) continue;

      // Thickest just off the mark, thinning outwards.
      const falloff =
        distance < PEAK
          ? (distance - INNER) / (PEAK - INNER)
          : 1 - (distance - PEAK) / (OUTER - PEAK);
      if (hash(row, column, 11) >= DENSITY * falloff * energy) continue;

      // Each grain keeps its own phase, so the field shimmers rather than blinks.
      const breath = Math.sin(tick / 13 + hash(row, column, 29) * TAU);
      if (breath < -0.2) continue;
      marks.push({
        row,
        column,
        ch: GRAIN[Math.floor(hash(row, column, 47) * GRAIN.length)]!,
        bright: breath > 0.85
      });
    }
  }
  return marks;
}
