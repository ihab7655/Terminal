import {openingRows} from '../src/opening.js';
const [cols, rows, tick] = process.argv.slice(2).map(Number);
console.log(openingRows(tick, cols, rows).join('\n'));
