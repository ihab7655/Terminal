// ── WHO THE CONSOLE IS TALKING TO, AND WHERE IT IS STANDING ─────────────────
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
// — tools/registry.ts:132, filesystem.tool.ts:10, git.tool.ts:111. What
// changes when it is SENT is that it is stated: `tool-caller.ts:179` injects
// it as `args.__cwd` for every call, so where files land is a fact of the
// goal rather than a property of the directory a terminal happened to be in.
//
// ── LAUNCHING IS NOT RESUMING ───────────────────────────────────────────────
//
// This file used to CONTINUE a remembered id: the console wrote its session
// into its settings file and read it back at the next boot, so quitting and
// starting again put you back in the conversation you had left, silently, on
// an empty screen.
//
// It was wrong, and the record says how wrong. The settings file is per USER,
// not per workspace, so one id followed a person between projects: session
// f780a142 holds goals from a scratch workspace on 26 August and from
// `/home/spark/Terminal` on 28 August — two days and two directories read by
// the engine as one conversation, with a clean screen in front of it.
//
// So: a launch has NO conversation. The first message begins one, and that is
// the only thing that ever does. Resuming is an act a person performs, in
// Conversations, by choosing the one they mean — which is also what makes a
// resume worth anything, because a person who chose it knows what is behind
// them. Nothing about a conversation is remembered by this console: the
// conversations themselves are the engine's record, and Conversations reads
// them from it.

import {randomUUID} from 'node:crypto';

export type Standing = {
  /**
   * The conversation every goal from this console belongs to, or `null` when
   * there is not one yet — the ordinary state of a console that has just been
   * started and has not been spoken to.
   */
  readonly sessionId: string | null;
  /** Where work lands: the directory goals are sent against. */
  readonly workspace: string;
};

/** A console that has just started: standing somewhere, talking to no one. */
export function atLaunch(cwd = process.cwd()): Standing {
  return {sessionId: null, workspace: cwd};
}

/** A console mid-conversation: the same standing, with the conversation real. */
export type Talking = {
  readonly sessionId: string;
  readonly workspace: string;
};

/**
 * The conversation this message belongs to, begun if it does not exist.
 *
 * Called at the one place a message becomes a goal, so an id exists only when
 * there is something in it. A conversation is not a thing the console holds
 * and might never use: the engine creates the session row when the first goal
 * carrying the id is saved (`saveSession`, upserted), and a conversation with
 * no goals is not a conversation anywhere.
 */
export function begun(now: Standing, mint: () => string = randomUUID): Talking {
  return {sessionId: now.sessionId ?? mint(), workspace: now.workspace};
}

/**
 * Continue one, chosen. Its workspace comes with it.
 *
 * Where the work happened is part of what is being resumed — continuing a
 * conversation while standing somewhere else would send the next goal into a
 * different directory from every goal above it in the same session.
 */
export function resumed(now: Standing, chosen: {id: string; workspace: string | null}): Standing {
  return {sessionId: chosen.id, workspace: chosen.workspace ?? now.workspace};
}

/**
 * Start a new one, in a chosen place.
 *
 * The id is NOT minted here, and the absence is the design: this leaves the
 * console in exactly the state a fresh launch is in, so "new conversation"
 * means one thing in the whole console and the first message begins it either
 * way. One rule, not two that could drift.
 */
export function fresh(workspace: string): Standing {
  return {sessionId: null, workspace};
}

/** One conversation as Conversations reads it from the engine's record. */
export type Conversation = {
  readonly id: string;
  readonly workspace: string | null;
  readonly goals: number;
  readonly last: string;
  readonly at: string;
};

/** One working location, and how much was said there. */
export type Location = {
  readonly workspace: string;
  readonly conversations: number;
  readonly at: string;
};

/**
 * WHERE THE WORK WAS DONE, before WHAT WAS SAID THERE.
 *
 * A flat list mixes conversations from every project a person has ever opened
 * this console in, and the first question anyone actually has about an old
 * conversation is which piece of work it belonged to. So the place asks that
 * first, and this derives the answer from the rows themselves rather than from
 * anything the console keeps: the engine records `workspace_path` per goal
 * (LLD-E1), and a conversation is listed under the location its goals ran in.
 *
 * Newest first, by the most recent thing said in each — the order a person
 * carries in their head.
 */
export function locations(rows: readonly Conversation[]): Location[] {
  const byPath = new Map<string, {conversations: number; at: string}>();
  for (const c of rows) {
    if (c.workspace === null) continue;   // a goal with no workspace on record
    const seen = byPath.get(c.workspace);
    if (seen) { seen.conversations += 1; if (c.at > seen.at) seen.at = c.at; }
    else byPath.set(c.workspace, {conversations: 1, at: c.at});
  }
  return [...byPath].map(([workspace, m]) => ({workspace, ...m})).sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** The conversations that happened in one location, newest first. */
export function inLocation(rows: readonly Conversation[], workspace: string): Conversation[] {
  return rows.filter(c => c.workspace === workspace).sort((a, b) => (a.at < b.at ? 1 : -1));
}

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
