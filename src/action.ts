// What the engine DID, shown the way a person reads it.
//
// A tool call has two readings, and a transcript needs both at different times.
// While you are scanning back through a session you want the sentence — three
// commands ran, a file was written. When you stop on one, you want the call
// itself and everything it printed.
//
//   Ran 3 shell commands                      ← folded: what happened
//
//   ● Bash(cat /home/spark/notes)             ← opened: the call
//     ⎿  hello                                ← and what it said
//
// The folded line covers a RUN of calls to the same tool, because that is how
// they arrive: a worker tries a command, adjusts, tries again. Three rows of
// `✓ bash …` in a column is the reader doing the summarising that the console
// should have done. One line, opened when it matters.

import type {Item} from './console.js';
import {en} from './i18n/en.js';
import {fill, type Catalogue, type Plural} from './i18n/catalogue.js';

type Did = Extract<Item, {kind: 'did'}>;

/** A run of consecutive calls to the same tool — one line when folded. */
export type Action = {
  /** The item ids in this run, oldest first. Folding acts on all of them. */
  readonly ids: readonly string[];
  readonly items: readonly Did[];
};

/** Group consecutive `did` items by the tool they called. */
export function actionsOf(items: readonly Did[]): Action[] {
  const actions: Action[] = [];
  for (const item of items) {
    const last = actions[actions.length - 1];
    if (last && last.items[last.items.length - 1]!.verb === item.verb) {
      actions[actions.length - 1] = {
        ids: [...last.ids, item.id],
        items: [...last.items, item]
      };
      continue;
    }
    actions.push({ids: [item.id], items: [item]});
  }
  return actions;
}

// The sentence a tool makes when it is not being looked at. Keyed by the tool
// the engine named, because that is the ONLY thing the console is handed: the
// `tool.called` payload carries toolName, args, success, exitCode, durationMs
// and stdoutSummary — and no effects (verified at the publish site,
// workers/tool-caller.ts:271). Keying on a declared effect would mean the
// console holding its own name-to-effect map: a copy of engine knowledge it is
// never given, stale the moment the engine generates a tool.
//
// A tool with no phrase falls back to its own name, which is honest — the
// console cannot know every tool the engine may grow, and inventing a verb for
// one it has never seen would be a guess printed as a fact. In every language:
// the name passes through as the identifier it is.
const PHRASE: Record<string, keyof Catalogue['did']> = {
  bash: 'shell',
  write_file: 'wrote',
  edit_file: 'edited',
  read_file: 'read',
  list_files: 'listed',
  run_artifact: 'ranProject',
  run_tests: 'ranTests',
  execute_code: 'snippet',
  web: 'searched',
  web_search: 'searched'
};

/** The one line this run reads as while folded, in the language in use. */
export function sentenceOf(action: Action, say: Catalogue = en): string {
  const n = action.items.length;
  const verb = action.items[0]!.verb;
  const key = PHRASE[verb];
  const text = key
    ? say.plural(say.did[key] as Plural, n)
    : fill(say.plural(say.did.other, n), {tool: verb});

  // How much code changed, on the sentence itself. A person scanning back wants
  // to know a write was two lines rather than two hundred without opening it,
  // and that number is the one thing about a write that cannot be guessed from
  // its name.
  const added = action.items.reduce(
    (sum, i) => sum + (i.changes ?? []).filter(c => c.sign === '+').length,
    0
  );
  const removed = action.items.reduce(
    (sum, i) => sum + (i.changes ?? []).filter(c => c.sign === '-').length,
    0
  );
  const size =
    added === 0 && removed === 0
      ? ''
      : removed === 0
        ? say.plural(say.changes.added, added)
        : added === 0
          ? say.plural(say.changes.removed, removed)
          : `+${added} -${removed}`;

  // A failure is not a detail of the sentence, it is the reason to open it. Said
  // plainly rather than left to a colour, which a screenshot or a colourblind
  // reader loses.
  const failed = action.items.filter(i => i.state === 'failed').length;
  const note = failed === 0 ? '' : failed === n ? say.did.failed : say.plural(say.did.someFailed, failed);

  return [text, size, note].filter(Boolean).join(' · ');
}

/** Is any call in this run still going? */
export const isRunning = (action: Action): boolean =>
  action.items.some(i => i.state === 'running');
