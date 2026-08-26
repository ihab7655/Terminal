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

// The sentence a tool makes when it is not being looked at. Written per tool
// because "Ran 3 write_files" is not English and a reader should never have to
// translate a function name back into what it did.
//
// A tool with no sentence here falls back to its own name, which is honest —
// the console does not know every tool the engine may grow, and inventing a
// verb for one it has never seen would be a guess printed as a fact.
const SENTENCES: Record<string, {one: string; many: string}> = {
  bash: {one: 'Ran 1 shell command', many: 'Ran $n shell commands'},
  write_file: {one: 'Wrote 1 file', many: 'Wrote $n files'},
  edit_file: {one: 'Edited 1 file', many: 'Edited $n files'},
  read_file: {one: 'Read 1 file', many: 'Read $n files'},
  list_files: {one: 'Listed 1 directory', many: 'Listed $n directories'},
  run_artifact: {one: 'Ran the project', many: 'Ran the project $n times'},
  run_tests: {one: 'Ran the tests', many: 'Ran the tests $n times'},
  execute_code: {one: 'Ran a snippet', many: 'Ran $n snippets'},
  web: {one: 'Searched the web', many: 'Searched the web $n times'},
  web_search: {one: 'Searched the web', many: 'Searched the web $n times'}
};

/** The one line this run reads as while folded. */
export function sentenceOf(action: Action): string {
  const n = action.items.length;
  const verb = action.items[0]!.verb;
  const sentence = SENTENCES[verb];
  const text = sentence
    ? n === 1
      ? sentence.one
      : sentence.many.replace('$n', String(n))
    : n === 1
      ? `Called ${verb}`
      : `Called ${verb} ${n} times`;

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
        ? `+${added} ${added === 1 ? 'line' : 'lines'}`
        : added === 0
          ? `-${removed} ${removed === 1 ? 'line' : 'lines'}`
          : `+${added} -${removed}`;

  // A failure is not a detail of the sentence, it is the reason to open it. Said
  // plainly rather than left to a colour, which a screenshot or a colourblind
  // reader loses.
  const failed = action.items.filter(i => i.state === 'failed').length;
  const note = failed === 0 ? '' : failed === n ? 'failed' : `${failed} failed`;

  return [text, size, note].filter(Boolean).join(' · ');
}

/** Is any call in this run still going? */
export const isRunning = (action: Action): boolean =>
  action.items.some(i => i.state === 'running');
