import {mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {DEFAULT_LANGUAGE} from '../i18n/index.js';

// ── WHAT THE CONSOLE REMEMBERS ──────────────────────────────────────────────
//
// One file, owned by the console, per user rather than per workspace: a
// person's language and the way they work follow them between projects.
//
// The engine's own `.env` is READ for display and never written by this
// project. Changing a provider or a key means re-opening the engine, which is
// a restart and not a settings change — so Settings shows what the engine was
// given and says where it lives.
//
// What is NOT remembered, deliberately: the transcript, the scroll position,
// which rows were open, anything waiting for an answer. The console restores a
// CONFIGURATION; a conversation is restored from the engine's own record,
// which is the only place it actually lives.

export type Mode = 'automatic' | 'approval' | 'plan';
export type Permission = 'allowed' | 'needs-approval' | 'forbidden';

/** The effects a capability can declare — ADR-009's ids, plus the absence. */
export const EFFECTS = [
  'fs:read', 'fs:write', 'process:spawn', 'network:read', 'vcs:write', 'undeclared'
] as const;
export type EffectId = (typeof EFFECTS)[number];
export type EffectTable = Record<EffectId, Permission>;

/** An answer a person gave once and asked to be kept. */
export type Standing = {
  /** `command` is one exact command; `effect` is a whole row, in one workspace. */
  readonly kind: 'command' | 'effect';
  readonly value: string;
  readonly workspace: string;
  readonly granted: string;
};

export type Settings = {
  version: number;
  language: string;
  /** The way of working in use, and the appearance it set. */
  profile: string;
  theme: string;
  mode: Mode;
  policy: EffectTable;
  standing: Standing[];
  session: {id: string | null};
  firstRunComplete: boolean;
};

export const CURRENT_VERSION = 1;

/**
 * What a console with no file behaves as.
 *
 * `automatic` because that is what the engine does with no middleware at all,
 * and a fresh install should not behave differently from the engine's own
 * default. The two rows that ask are the two nothing can reason about: a
 * capability that declares no effects, and git — which rewrites history rather
 * than files.
 */
export const defaults = (): Settings => ({
  version: CURRENT_VERSION,
  language: DEFAULT_LANGUAGE,
  profile: 'phosphor',
  theme: 'phosphor',
  mode: 'automatic',
  policy: {
    'fs:read': 'allowed',
    'fs:write': 'allowed',
    'process:spawn': 'allowed',
    'network:read': 'allowed',
    'vcs:write': 'needs-approval',
    undeclared: 'needs-approval'
  },
  standing: [],
  session: {id: null},
  firstRunComplete: false
});

export const settingsPath = (env: NodeJS.ProcessEnv = process.env): string =>
  join(env['XDG_CONFIG_HOME'] ?? join(env['HOME'] ?? '.', '.config'), 'overyos', 'console.json');

const isMode = (v: unknown): v is Mode =>
  v === 'automatic' || v === 'approval' || v === 'plan';
const isPermission = (v: unknown): v is Permission =>
  v === 'allowed' || v === 'needs-approval' || v === 'forbidden';

/**
 * Read what was remembered, field by field, keeping anything valid.
 *
 * A malformed file is NOT an error and never throws: not having settings, or
 * having settings written by a version that knew more, are ordinary states for
 * a console to be in — the same judgement `EngineFailure` already makes about
 * not finding an engine. What could not be read falls back to the default for
 * that field alone, so one bad row does not discard the rest.
 *
 * Returns what it read AND what it could not, so the console can say so rather
 * than silently behaving differently from what a person configured.
 */
export function load(path = settingsPath()): {settings: Settings; unreadable: string[]} {
  const settings = defaults();
  const unreadable: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    const code = (error as {code?: string}).code;
    // No file at all is the ordinary first run, and says nothing.
    if (code !== 'ENOENT') unreadable.push('the settings file could not be read');
    return {settings, unreadable};
  }
  // `typeof [] === 'object'` and an array is not null, so it has to be ruled
  // out by name — otherwise a JSON array reads every field as absent and yields
  // defaults in silence, which is the one outcome this function exists to
  // prevent: behaving differently from what a person configured, without
  // saying so.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    unreadable.push('the settings file is not a settings file');
    return {settings, unreadable};
  }
  const f = raw as Record<string, unknown>;

  if (typeof f['version'] === 'number' && f['version'] > CURRENT_VERSION) {
    // Written by something that knew more. Defaults, and said out loud — a
    // guess at a shape from the future is how a setting silently changes
    // meaning.
    unreadable.push('these settings were written by a newer console');
    return {settings, unreadable};
  }

  if (typeof f['language'] === 'string') settings.language = f['language'];
  if (typeof f['profile'] === 'string') settings.profile = f['profile'];
  if (typeof f['theme'] === 'string') settings.theme = f['theme'];
  if (isMode(f['mode'])) settings.mode = f['mode'];
  else if (f['mode'] !== undefined) unreadable.push('how it runs');

  const policy = f['policy'];
  if (policy && typeof policy === 'object') {
    for (const id of EFFECTS) {
      const v = (policy as Record<string, unknown>)[id];
      if (isPermission(v)) settings.policy[id] = v;
      else if (v !== undefined) unreadable.push(`what it may do · ${id}`);
    }
  }

  if (Array.isArray(f['standing'])) {
    settings.standing = f['standing'].filter(
      (s): s is Standing =>
        !!s && typeof s === 'object' &&
        ((s as Standing).kind === 'command' || (s as Standing).kind === 'effect') &&
        typeof (s as Standing).value === 'string' &&
        typeof (s as Standing).workspace === 'string' &&
        typeof (s as Standing).granted === 'string'
    );
  }

  const session = f['session'];
  if (session && typeof session === 'object' && typeof (session as {id?: unknown}).id === 'string')
    settings.session.id = (session as {id: string}).id;

  if (typeof f['firstRunComplete'] === 'boolean') settings.firstRunComplete = f['firstRunComplete'];

  return {settings, unreadable};
}

/**
 * Write, atomically.
 *
 * A temporary file in the same directory, then a rename — which is atomic on
 * one filesystem. A half-written settings file must be impossible: a console
 * interrupted mid-save would otherwise come back with a policy nobody chose,
 * and a permission that changed because a process died is the worst kind.
 *
 * A failure to write is reported, never thrown. Not being able to remember is
 * a thing to say, not a reason to lose a session.
 */
export function save(settings: Settings, path = settingsPath()): string | null {
  try {
    mkdirSync(dirname(path), {recursive: true});
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    renameSync(temp, path);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
