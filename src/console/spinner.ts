import {mark as glyph} from '../style.js';

/**
 * Which frame of the turning mark to draw.
 *
 * Read from the theme in use, so a profile with a different hand turns in its
 * own. It lives apart from both the frame and the transcript because both draw
 * it and neither owns it.
 */
export const spinnerFrame = (n: number) => glyph.spinner[n % glyph.spinner.length]!;
