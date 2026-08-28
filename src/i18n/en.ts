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
    keysHint: '? help'
  },
  keys: {
    stops: 'Esc stops',
    unfolds: 'Tab unfolds',
    folds: 'Tab folds',
    rowsBelow: {one: '{n} row below · PgDn', other: '{n} rows below · PgDn'}
  },
  session: 'session',
  profile: {
    adjusted: 'adjusted',
    appliesAll: 'choosing one sets all three · anything you change afterwards stays',
    confirmHead: 'this sets how it runs to automatic and every row to allowed',
    confirmBody: 'the shell and any command · writing, editing and deleting · the network · git',
    confirmDoesNot: 'it grants nothing this account cannot already do · every call is still on the transcript · Esc still stops',
    confirmType: 'type the name to turn it on',
    cancel: 'Esc cancels'
  },
  record: {
    status: 'status', attempts: 'attempts', took: 'took', plan: 'plan',
    proved: 'proved', workers: 'workers', retries: 'retries',
    guardian: 'guardian', nothing: 'nothing recorded'
  },
  help: {
    title: 'OVERYOS / HELP',
    subtitle: 'Keyboard shortcuts and console controls',
    sections: [
      {name: 'NAVIGATION', entries: [
        {key: '↑ ↓', does: 'Move between items'},
        {key: 'Enter', does: 'Open or choose the item under the cursor'},
        {key: 'Esc', does: 'Go back, or close what is open'},
        {key: '^K', does: 'Open the list of places'},
        {key: '/', does: 'Open the same list, filtered by what follows'}
      ]},
      {name: 'EXECUTION', entries: [
        {key: 'Enter', does: 'Send what you have written to the engine'},
        {key: 'y', does: 'Allow a held call, this once'},
        {key: 'c', does: 'Allow this exact command from now on'},
        {key: 'r', does: 'Allow everything on this row, in this workspace'},
        {key: 'n', does: 'Refuse the held call'},
        {key: 'Esc', does: 'Stop the goal that is running'}
      ]},
      {name: 'READING', entries: [
        {key: 'Tab', does: 'Unfold every captured output, or fold them again'},
        {key: 'click', does: 'Unfold the one row under the pointer'},
        {key: 'PgUp PgDn', does: 'Scroll a page at a time'},
        {key: 'Home End', does: 'Jump to the beginning, or back to following'}
      ]},
      {name: 'WRITING', entries: [
        {key: '↑ ↓', does: 'Recall what you typed before'},
        {key: '← →', does: 'Move the caret'},
        {key: '^A ^E', does: 'Jump to the start or the end of the line'},
        {key: '^U', does: 'Clear the line'}
      ]},
      {name: 'THE CONSOLE', entries: [
        {key: '?', does: 'Open this page'},
        {key: '^P', does: 'Open what the engine may do here'},
        {key: '^C', does: 'Quit — the engine is told, and work in flight is recorded'}
      ]}
    ]
  },
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
    forbiddenHolds: 'forbidden holds in every mode',
    inUse: 'in use',
    enterCycles: '↑↓ move · Enter changes it · allowed → needs approval → forbidden'
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
    replanned: 'the plan changed for the next attempt',
    couldNotBuild: 'could not build it',
    missingCapability: 'missing a capability'
  },

  places: {
    title: 'PLACES',
    help: 'Help', helpHint: 'keyboard shortcuts and console controls',
    mode: 'How it runs', modeHint: 'whether it stops and comes back to you',
    policy: 'What it may do', policyHint: 'set by you, read in every mode',
    language: 'Language', languageHint: 'every word this console writes',
    workspace: 'Workspace', workspaceHint: 'where work lands, and this session',
    engine: 'Engine', engineHint: 'what it was given, and whether it answered',
    history: 'History', historyHint: 'every goal this engine has run',
    inspector: 'Inspector', inspectorHint: 'one execution, read whole',
    capabilities: 'Capabilities', capabilitiesHint: 'what the engine can reach for',
    profiles: 'Profiles', profilesHint: 'how it looks, how it runs, what it may do',
    settings: 'Settings', settingsHint: 'what the engine was given · read only',
    conversations: 'Conversations', conversationsHint: 'where the work was done, and what was said there',
    thisSession: 'this one',
    resume: '↑↓ move · Enter open · Esc back to the places',
    whereWorked: 'the places work has been done',
    conversationsHere: {one: '{n} conversation', other: '{n} conversations'},
    openLocation: '↑↓ move · Enter see the conversations there · Esc back',
    newConversation: 'new conversation',
    startNew: 'start a new conversation here',
    startedNew: 'new conversation',
    pickAGoal: 'open History and press Enter on a goal',
    openARow: '↑↓ move · Enter inspect · Esc back',
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
