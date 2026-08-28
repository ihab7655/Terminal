import {matching, PLACES, queryOf} from './registry.js';
import {ar} from '../i18n/ar.js';
import {en} from '../i18n/en.js';

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

console.log('\none registry, two ways in');
ok('nothing typed offers every place', matching(null, en).length === PLACES.length);
ok('and so does a bare slash', matching(queryOf('/'), en).length === PLACES.length);
ok('/pol reaches What it may do', matching(queryOf('/pol'), en)[0]?.id === 'policy');
ok('/lang reaches Language', matching(queryOf('/lang'), en)[0]?.id === 'language');
ok('a name that matches nothing offers nothing',
  matching(queryOf('/zzz'), en).length === 0);

console.log('\na slash is only a command at the start of a line');
ok('src/index.ts is a path, not a launcher', queryOf('src/index.ts') === null);
ok('a leading slash is a command', queryOf('/keys') === 'keys');
ok('an empty line is not', queryOf('') === null);

console.log('\nthe filter reads the id AND the name in the language in use');
ok('English: "how" reaches How it runs',
  matching('how', en)[0]?.id === 'mode');
ok('Arabic: "اللغة" reaches Language',
  matching('اللغة', ar)[0]?.id === 'language', matching('اللغة', ar).map(p => p.id));
ok('and the id still works in Arabic — an id is an identifier',
  matching('policy', ar)[0]?.id === 'policy');

console.log('\nbeginnings come first, and the rest still match');
const mid = matching('run', en);
ok('"run" finds How it runs by its middle', mid.some(p => p.id === 'mode'), mid.map(p => p.id));

console.log('\na number belongs to a place, not to a row');
ok('every place has a distinct number',
  new Set(PLACES.map(p => p.number)).size === PLACES.length);
ok('and it does not move when a query narrows',
  matching(queryOf('/pol'), en)[0]?.number === PLACES.find(p => p.id === 'policy')?.number);

console.log(failed === 0 ? '\nplaces: all passed\n' : `\nplaces: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
