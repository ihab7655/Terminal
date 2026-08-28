import type {Catalogue} from './catalogue.js';
import {ar} from './ar.js';
import {en} from './en.js';

// The registry. A new language is a file and one entry — the same shape the
// engine uses for its own extension points, and the reason nothing that renders
// or decides ever grows a branch per language.
export const catalogues: ReadonlyMap<string, Catalogue> = new Map([
  [en.id, en],
  [ar.id, ar]
]);

export const DEFAULT_LANGUAGE = en.id;

/** The catalogue for an id, or English. An unknown id is not an error. */
export const catalogueFor = (id: string | undefined): Catalogue =>
  catalogues.get(id ?? '') ?? en;

export type {Catalogue, Plural} from './catalogue.js';
export {fill} from './catalogue.js';
