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
  session: 'session',
  keySheet: [
    ['Enter', 'send · or open the chosen place'],
    ['↑ ↓', 'what you typed before · or choose a place'],
    ['Tab', 'unfold every output'],
    ['click', 'unfold one row'],
    ['^K', 'places'],
    ['/', 'places, filtered by what follows'],
    ['y c r n', 'answer a held call'],
    ['Esc', 'close what is open, then stop the goal'],
    ['^C', 'quit']
  ],
  modes: {
    automatic: 'it does not ask. It carries on.',
    approval: 'it stops where the policy says to stop',
    plan: 'it shows the plan. No tool is called.',
    separate: 'what it may do is a separate table, and this does not touch it',
    forbiddenHolds: 'forbidden holds in every mode'
  },

  steer: {
    received: 'heard',
    scoped: 'read',
    delivered: 'the worker has it',
    admitted: 'it goes into the plan',
    superseded: 'replaced by what you said next',
    not_delivered: 'the goal ended before it arrived'
  },

  phases: {
    starting: 'starting',
    reading: 'reading the request',
    planning: 'planning',
    planned: 'planned',
    executing: 'executing',
    waveFinished: 'wave finished',
    working: 'working',
    checkpoint: 'saved a checkpoint'
  },
  outcome: {
    completed: 'completed',
    finished: 'finished',
    failed: 'the goal failed',
    verificationFailed: 'verification failed',
    retrying: 'retrying',
    stopping: 'stopping — the engine finishes the work already in flight first',
    buildingCapability: 'building a capability it does not have',
    judgesUnreliable: 'the engine judges {tool} unreliable — from its record, not from this goal',
    repairing: 'repairing {tool}',
    repaired: 'repaired {tool}',
    noEngineHere: 'no engine — nothing to run this against',
    endedBadly: 'the goal ended badly',
    replanned: 'the plan changed for the next attempt'
  },

  places: {
    title: 'PLACES',
    keys: 'Keys', keysHint: 'what every key does here',
    mode: 'How it runs', modeHint: 'whether it stops and comes back to you',
    policy: 'What it may do', policyHint: 'set by you, read in every mode',
    language: 'Language', languageHint: 'every word this console writes',
    workspace: 'Workspace', workspaceHint: 'where work lands, and this session',
    engine: 'Engine', engineHint: 'what it was given, and whether it answered',
    history: 'History', historyHint: 'every goal this engine has run',
    loading: 'reading the record…',
    nothingYet: 'nothing on record yet',
    choose: '↑↓ choose · Enter open · Esc close',
    nothingMatches: 'nothing by that name'
  },

  planned: {
    heading: 'the plan it produced',
    nothingRan: 'no tool was called',
    judgedAgainst: 'judged against:',
    howToRun: 'switch to automatic and ask again to run this'
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
