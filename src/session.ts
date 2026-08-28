// ── Who the console is talking to, and where it is standing ─────────────────
//
// Two facts the engine DECLARES as part of a goal and this console never sent.
// Neither is new engine surface: `sessionId` and `workspaceDir` are both
// fields on `GoalRequest` (brain/types.ts:45), and `sessionId` is declared
// REQUIRED there. Supplying them is host work.
//
// WHAT THE SESSION BUYS, measured rather than assumed. The engine keeps a
// conversation memory keyed on this id — `ContextService.get()` assembles a
// session summary, a compacted context and the recent turns, and the reading
// of a message uses them AS the conversation. Without an id the engine reads
// every message as if nothing preceded it: 59 goals this console sent between
// 25 and 27 August carry `session_id = NULL`, and none of them could see each
// other. Sessions of 252 and 248 goals exist in the same database, so the
// mechanism works the moment a host supplies one.
//
// WHAT THE WORKSPACE BUYS. Unset, the engine's tools anchor to `process.cwd()`
// — tools/registry.ts:132, filesystem.tool.ts:10, git.tool.ts:111. That is the
// same directory the console was launched from, so the behaviour does not
// change; what changes is that it is STATED. A person can see where files will
// land before they ask for one, which a permission table is meaningless
// without. The official CLI already does this (cli.ts:106).

import {randomUUID} from 'node:crypto';

export type Standing = {
  /** The conversation every goal from this console belongs to. */
  readonly sessionId: string;
  /** Where work lands. The directory the console was launched from. */
  readonly workspace: string;
};

/**
 * One session for the life of the console, or the one it was given.
 *
 * A remembered id is continued so a person who quits and comes back is still
 * in the same conversation — which is the whole reason the engine keeps one.
 * An absent or unusable id yields a fresh one rather than an error: not having
 * talked before is an ordinary state.
 */
export function standing(remembered?: string, cwd = process.cwd()): Standing {
  const usable = typeof remembered === 'string' && UUID.test(remembered);
  return {sessionId: usable ? remembered : randomUUID(), workspace: cwd};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How the workspace READS — a naming decision, not a fitting one.
 *
 * The home directory becomes `~` because that is how a person refers to it.
 * That is all this does.
 *
 * IT DOES NOT TRUNCATE, and the absence is the point (rule 5: the content
 * decides the layout, never the other way round). An earlier version of this
 * function carried a `budget = 28` and cut the path to fit — a fixed dimension
 * invented here, held next to a rail that already measures the real width and
 * gives way correctly: `rail()` drops its status WHOLE first, then cuts the
 * title with an ellipsis, at whatever width the window actually is. Two
 * opinions about the same edge, one of them blind to the window, is precisely
 * the arithmetic that has to be re-derived at every size — and the sizes are
 * unbounded.
 *
 * So this says what the workspace IS, and the rail decides what survives.
 */
export function workspaceName(path: string, home = process.env['HOME'] ?? ''): string {
  return home !== '' && path.startsWith(home) ? '~' + path.slice(home.length) : path;
}
