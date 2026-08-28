import type {EffectTable, Mode, Permission} from '../settings/store.js';
import {themeFor, type Theme} from './themes.js';

// ── A PROFILE IS A WAY OF WORKING, UNDER ONE NAME ───────────────────────────
//
// How the console looks, how it runs, and what it may do. Choosing one applies
// all three — there is no second list to visit and no preset to remember.
//
// They are NOT called themes. A theme means colours everywhere else it appears,
// including in the tool most people reading this have open, where `theme` and
// `permissionMode` are separate keys. A control that changes what the engine
// may do must not borrow a word that promises it only changes how things look.
//
// THE SEPARATION IS KEPT WHERE IT MATTERS AND ONLY THERE. `themes.ts` holds
// colour and marks and imports nothing; `settings/store.ts` holds the mode and
// the table and never reads a theme. THIS file is the only one that names both,
// it holds no state, and its single verb is `apply`. So a profile is a one-time
// act, not a coupling: turn Hacker on, then set the theme back to vellum, and
// the permissions do not move — nothing downstream ever asked what the colours
// were.

const every = (v: Permission): EffectTable => ({
  'fs:read': v, 'fs:write': v, 'process:spawn': v,
  'network:read': v, 'vcs:write': v, undeclared: v
});

export type Profile = {
  readonly id: string;
  readonly theme: Theme;
  readonly mode: Mode;
  readonly policy: EffectTable;
  /**
   * Entering this profile widens what may happen, so it is confirmed once — by
   * TYPING its name, not by pressing a key. A word is the record that a person
   * chose it; a keypress is not.
   */
  readonly confirm: boolean;
};

export const profiles: readonly Profile[] = [
  {
    id: 'phosphor',
    theme: themeFor('phosphor'),
    // What the engine does with no middleware at all, so a fresh console does
    // not behave differently from the engine's own default. The two rows that
    // ask are the two nothing can reason about: a capability that declares no
    // effects, and git, which rewrites history rather than files.
    mode: 'automatic',
    policy: {...every('allowed'), 'vcs:write': 'needs-approval', undeclared: 'needs-approval'},
    confirm: false
  },
  {
    id: 'vellum',
    theme: themeFor('vellum'),
    // Reading light, and a mode that reads: it shows what it would do and runs
    // none of it. For a bright room, a shared screen, and a plan you want to
    // see before it happens.
    mode: 'plan',
    policy: every('allowed'),
    confirm: false
  },
  {
    id: 'hacker',
    theme: themeFor('hacker'),
    mode: 'automatic',
    policy: every('allowed'),
    confirm: true
  }
];

export const profileFor = (id: string | undefined): Profile =>
  profiles.find(p => p.id === id) ?? profiles[0]!;

/** What a profile sets. The only thing this module does. */
export const apply = (p: Profile): {theme: string; mode: Mode; policy: EffectTable} => ({
  theme: p.theme.id,
  mode: p.mode,
  policy: {...p.policy}
});

/**
 * Has a hand edit moved anything the profile set?
 *
 * The profile's name stops being the whole story the moment one does, and the
 * screen says `adjusted` rather than claiming otherwise. Nothing is reverted:
 * the hand edit wins and it stays — a profile is where a way of working starts,
 * never a cage.
 */
export const adjusted = (p: Profile, mode: Mode, policy: EffectTable, theme: string): boolean =>
  p.mode !== mode ||
  p.theme.id !== theme ||
  (Object.keys(p.policy) as Array<keyof EffectTable>).some(k => p.policy[k] !== policy[k]);
