import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CURRENT_VERSION, defaults, load, save, settingsPath} from './store.js';

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond && got !== undefined) console.log(`      got: ${JSON.stringify(got)}`);
};
const dir = mkdtempSync(join(tmpdir(), 'overyos-settings-'));
const at = (name: string) => join(dir, name);
const write = (name: string, body: string) => { const p = at(name); writeFileSync(p, body); return p; };

console.log('\nwhere it lives');
ok('under XDG when it is set',
  settingsPath({XDG_CONFIG_HOME: '/x', HOME: '/h'} as NodeJS.ProcessEnv) === '/x/overyos/console.json');
ok('and under ~/.config otherwise',
  settingsPath({HOME: '/h'} as NodeJS.ProcessEnv) === '/h/.config/overyos/console.json');

console.log('\nround trip');
const mine = {...defaults(), language: 'ar', mode: 'approval' as const, firstRunComplete: true};
mine.policy['vcs:write'] = 'forbidden';
mine.standing = [{kind: 'command', value: 'npm test', workspace: '~/x', granted: '2026-08-28'}];
mine.session.id = 'abc';
ok('saving reports no trouble', save(mine, at('round.json')) === null);
const back = load(at('round.json')).settings;
ok('everything comes back', JSON.stringify(back) === JSON.stringify(mine), back);

console.log('\nnot having settings is an ordinary state');
const fresh = load(at('nothing-here.json'));
ok('an absent file yields defaults', fresh.settings.mode === 'automatic');
ok('and says nothing about it — a first run is not a problem', fresh.unreadable.length === 0);

console.log('\na file that cannot be read never throws, and never lies');
const broken = load(write('broken.json', '{ this is not json'));
ok('malformed yields defaults', broken.settings.language === 'en');
ok('and SAYS so, rather than behaving differently in silence', broken.unreadable.length === 1);

const wrongShape = load(write('array.json', '[1,2,3]'));
ok('an array is not a settings file', wrongShape.unreadable.length === 1);

const future = load(write('future.json', JSON.stringify({version: CURRENT_VERSION + 9, mode: 'plan'})));
ok('a newer version does not guess at a shape from the future',
  future.settings.mode === 'automatic');
ok('and says why', future.unreadable[0]?.includes('newer') === true);

console.log('\none bad field does not discard the rest');
const partial = load(write('partial.json', JSON.stringify({
  version: 1, language: 'ar', mode: 'sideways',
  policy: {'fs:write': 'maybe', 'vcs:write': 'forbidden'},
  standing: [{kind: 'command', value: 'ok', workspace: '~', granted: 'd'}, {junk: true}]
})));
ok('the good language survives a bad mode', partial.settings.language === 'ar');
ok('the bad mode falls back alone', partial.settings.mode === 'automatic');
ok('a bad permission falls back alone', partial.settings.policy['fs:write'] === 'allowed');
ok('while a good one beside it is kept', partial.settings.policy['vcs:write'] === 'forbidden');
ok('a malformed standing approval is dropped, not trusted',
  partial.settings.standing.length === 1);
ok('and every casualty is named', partial.unreadable.length === 2, partial.unreadable);

console.log('\nwriting is atomic, and a failure is reported not thrown');
// A path whose parent is a FILE: mkdir fails immediately with ENOTDIR. (A path
// under /proc was tried first and does not fail at all — mkdirSync hangs there
// rather than throwing, which is worth knowing and not worth testing against.)
const blocker = write('a-file-not-a-dir', 'x');
const err = save(defaults(), join(blocker, 'console.json'));
ok('an unwritable path returns the reason rather than throwing', typeof err === 'string', err);
ok('and the console is still running to report it', true);

console.log(failed === 0 ? '\nsettings: all passed\n' : `\nsettings: ${failed} FAILED\n`);
if (failed > 0) process.exit(1);
