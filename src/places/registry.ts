import type {Catalogue} from '../i18n/catalogue.js';

// ── ONE REGISTRY, TWO WAYS IN ───────────────────────────────────────────────
//
// `^K` raises the list with nothing typed; a `/` at the start of an empty line
// raises the same list, filtered by what follows. There is no second parser and
// no second list, so `/settings` and picking Settings are two ways of naming
// one thing rather than two lists that drift.
//
// A place's NUMBER is its own, not its position in a filtered list — so it does
// not move as a query narrows, and the number a person learned stays true.

export type PlaceId = 'keys' | 'mode' | 'policy' | 'language' | 'workspace' | 'engine';

export type Place = {
  readonly id: PlaceId;
  readonly number: number;
  /** How this place names itself, in the language in use. */
  name(say: Catalogue): string;
  hint(say: Catalogue): string;
};

export const PLACES: readonly Place[] = [
  {id: 'keys',      number: 1, name: s => s.places.keys,      hint: s => s.places.keysHint},
  {id: 'mode',      number: 2, name: s => s.places.mode,      hint: s => s.places.modeHint},
  {id: 'policy',    number: 3, name: s => s.places.policy,    hint: s => s.places.policyHint},
  {id: 'language',  number: 4, name: s => s.places.language,  hint: s => s.places.languageHint},
  {id: 'workspace', number: 5, name: s => s.places.workspace, hint: s => s.places.workspaceHint},
  {id: 'engine',    number: 6, name: s => s.places.engine,    hint: s => s.places.engineHint}
];

/** The query behind a leading slash, or null when the line is not a command. */
export function queryOf(line: string): string | null {
  // Only at the start. A slash anywhere else belongs to what is being written —
  // `src/index.ts` is a path, not a command.
  return line.startsWith('/') ? line.slice(1) : null;
}

/**
 * Which places a query means.
 *
 * What was typed is usually the beginning of a name, so those come first; the
 * rest still match, because half-remembering the middle of a word is the case
 * a filter exists for. Matched against the id AND the translated name, so a
 * person types in whichever they are thinking in.
 */
export function matching(query: string | null, say: Catalogue): Place[] {
  if (query === null || query === '') return [...PLACES];
  const needle = query.toLowerCase();
  const starts: Place[] = [];
  const contains: Place[] = [];
  for (const place of PLACES) {
    const names = [place.id, place.name(say)].map(n => n.toLowerCase());
    if (names.some(n => n.startsWith(needle))) starts.push(place);
    else if (names.some(n => n.includes(needle))) contains.push(place);
  }
  return [...starts, ...contains];
}
