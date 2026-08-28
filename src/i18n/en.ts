import {fill, type Catalogue, type Plural} from './catalogue.js';

// English: two forms, and the rule is the familiar one.
export const en: Catalogue = {
  id: 'en',
  name: 'English',
  plural: (forms: Plural, n: number) => fill(n === 1 ? forms.one : forms.other, {n}),

  rail: {
    idle: 'idle',
    ready: 'ready',
    working: 'working',
    noEngine: 'no engine',
    waiting: {one: '{n} waiting', other: '{n} waiting'}
  },
  composer: {
    placeholder: 'say something to the engine',
    whileWorking: 'or say something while it works',
    keysHint: '? keys'
  },
  keys: {
    stops: 'Esc stops',
    unfolds: 'Tab unfolds',
    folds: 'Tab folds',
    rowsBelow: {one: '{n} row below · PgDn', other: '{n} rows below · PgDn'}
  },
  asked: {
    hint: 'it says this is what it will do',
    once: 'allow once',
    thisCommand: 'always this exact command',
    wholeRow: 'always this, here',
    refuse: 'refuse',
    askedBy: 'asked by'
  },

  engine: {
    waking: 'waking the engine',
    none: 'no engine — nothing to run this against',
    stopping: 'stopping — the engine finishes the work already in flight first'
  },
  did: {
    shell: {one: 'Ran 1 shell command', other: 'Ran {n} shell commands'},
    wrote: {one: 'Wrote 1 file', other: 'Wrote {n} files'},
    edited: {one: 'Edited 1 file', other: 'Edited {n} files'},
    read: {one: 'Read 1 file', other: 'Read {n} files'},
    listed: {one: 'Listed 1 directory', other: 'Listed {n} directories'},
    ranProject: {one: 'Ran the project', other: 'Ran the project {n} times'},
    ranTests: {one: 'Ran the tests', other: 'Ran the tests {n} times'},
    snippet: {one: 'Ran a snippet', other: 'Ran {n} snippets'},
    searched: {one: 'Searched the web', other: 'Searched the web {n} times'},
    other: {one: 'Called {tool}', other: 'Called {tool} {n} times'},
    failed: 'failed',
    someFailed: {one: '1 failed', other: '{n} failed'}
  },
  changes: {
    added: {one: '+{n} line', other: '+{n} lines'},
    removed: {one: '-{n} line', other: '-{n} lines'}
  }
};
