import {adjusted, apply, profileFor, profiles} from './profiles.js';
import {phosphor, themeFor, themes} from './themes.js';
import {defaults} from '../settings/store.js';
import {colour, mark, wear} from '../style.js';

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};

console.log('\nthree ways of working, each naming all three things');
ok('three profiles', profiles.length === 3);
ok('and three themes', themes.size === 3);
ok('an unknown id is not an error', themeFor('nope').id === 'phosphor' && profileFor('nope').id === 'phosphor');
ok('each profile carries a theme, a mode and a full table',
  profiles.every(p => p.theme && p.mode && Object.keys(p.policy).length === 6));

console.log('\nonly one of them widens what may happen, and it is confirmed');
ok('hacker asks to be typed', profileFor('hacker').confirm === true);
ok('the others do not', profiles.filter(p => !p.confirm).length === 2);
ok('and hacker really does allow everything',
  Object.values(profileFor('hacker').policy).every(v => v === 'allowed'));
ok('while the default still asks about git and the undeclared',
  profileFor('phosphor').policy['vcs:write'] === 'needs-approval' &&
  profileFor('phosphor').policy['undeclared'] === 'needs-approval');
ok('and vellum runs nothing at all', profileFor('vellum').mode === 'plan');

console.log('\na profile is a starting point, never a cage');
const p = profileFor('hacker');
const set = apply(p);
ok('applying gives exactly what it declared',
  set.mode === 'automatic' && set.theme === 'hacker');
ok('nothing is adjusted the moment it is applied',
  adjusted(p, set.mode, set.policy, set.theme) === false);
ok('a hand edit to the policy shows as adjusted',
  adjusted(p, set.mode, {...set.policy, 'vcs:write': 'forbidden'}, set.theme) === true);
ok('a hand edit to the mode shows as adjusted',
  adjusted(p, 'approval', set.policy, set.theme) === true);
ok('and so does changing the appearance alone',
  adjusted(p, set.mode, set.policy, 'vellum') === true);
ok('but the permissions did NOT move when the appearance did',
  set.policy['fs:write'] === 'allowed');

console.log('\nwearing one changes colour and hand, in place');
const before = colour.ink;
const beforeMark = mark.ok;
wear(themeFor('hacker'));
ok('the palette changed', colour.ink !== before);
ok('and so did the glyphs — a different instrument, not a repaint',
  mark.ok !== beforeMark && mark.ok === '◆');
ok('the rail is double-struck', mark.corners[0] === '╔' && mark.rule === '═');
wear(phosphor);
ok('and it changes back', colour.ink === before && mark.ok === beforeMark);

console.log('\nnothing that decides ever reads a colour');
ok('the shipped defaults do not mention a theme in their policy',
  Object.keys(defaults().policy).every(k => k.includes(':') || k === 'undeclared'));

console.log(failed === 0 ? '\ntheme: all passed\n' : `\ntheme: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
