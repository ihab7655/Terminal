# How this console is verified

Three tiers, and the third is the one that has found every real defect.

## 1 · Unit — `npm test`

17 suites, run under `tsx`, plus a repaint proof. Everything here is pure: a
frame is a function of state, `decide()` is a function of a mode and a table,
the middleware is exercised with fabricated contexts and **no engine present**.

## 2 · Recorded sessions — `.preview/`

The console is driven in a real pty and the recording is replayed frame by
frame (`.preview/frames.mjs`). This is where anything about the SCREEN is
proved, because the defects that mattered were only ever visible in a sequence.

## 3 · Live, against the real engine

The console is run for real, a real goal is submitted, and the result is checked
**in the engine's own database** — not in the console's output, which is the
thing under test.

### Run it from a scratch workspace, never from this repository

The console's workspace is the directory it is launched from, and the engine
writes files there. Running a live test from inside this repository puts the
goal's output into the working tree — two artefacts reached a commit that way on
2026-08-28 before this was written down.

```bash
mkdir -p /tmp/ov-scratch
cd /tmp/ov-scratch
XDG_CONFIG_HOME=/tmp/ov-config npx --prefix /home/spark/Terminal tsx /home/spark/Terminal/src/index.ts
```

`XDG_CONFIG_HOME` points the settings file somewhere disposable, so a test can
choose a language, a mode and a policy without touching a person's own.

**Verified working:** a goal run this way recorded
`workspace_path = /tmp/ov-scratch`, wrote its file there, and left this
repository with no changes.

### What a live test asserts

Never "the screen looked right". Always something outside the console:

* the row in `goals` — its `status`, its `session_id`, its `workspace_path`
* whether the file the goal was asked for exists, and where
* `planning_snapshots` and `tool_calls`, when the question is how far it got

A goal that plans for over a minute is normal; if a live check finds nothing,
check `planning_snapshots` before changing any code — an empty result usually
means the window was too short, not that the path is broken.
