# LLD — `.env` resolution, and the failure that has no guard

**Status:** written before implementation. Nothing changed yet.
**Scope:** four lines that resolve one path. No behaviour change where it works
today.

---

## 1. The defect, measured

Four sites resolve the repository's single `.env` the same way:

```ts
loadEnv({ path: path.resolve(process.env['INIT_CWD'] ?? process.cwd(), '.env') })
```

- `engine-core/src/core/config.ts:8`
- `engine-rest/src/main.ts:16`
- `engine-core/drizzle.config.ts:5`
- `scripts/jest-setup-test-db.cjs:25`

`config.ts:5-7` states the assumption in its own comment:

> *"npm workspace scripts (`npm run x -w engine-core`) shift `process.cwd()` to
> the package dir, but **always preserve `INIT_CWD`** as the original invocation
> dir — resolve against that so the single root `.env` stays the source of
> truth."*

**The assumption does not hold for `npm test --workspaces`.** Measured inside a
jest run started by `npm test` from the repository root:

```
cwd      = /home/spark/agent-engine/packages/engine-core
INIT_CWD = /home/spark/agent-engine/packages/engine-core
target   = /home/spark/agent-engine/packages/engine-core/.env
error    = ENOENT: no such file or directory
parsed   = 0
DEEPSEEK_API_KEY = UNSET
```

npm rewrites `INIT_CWD` per workspace when it recurses. The comment is right
about `-w`; `--workspaces` is a different invocation and nobody checked it.

**Why it survived: the failure is silent.** `loadEnv` returns `{ error }` and no
caller reads it. A missing `.env` is indistinguishable from an empty one, so the
run continues with no key and the first symptom appears far away — DeepSeek
answering `401 Authentication Fails (auth header format should be Bearer sk-...)`,
which describes an empty `Bearer ` header and reads like an account problem.
Measured cost: six integration suites reported as failing, and a live API key
with real balance (`is_available: true`, `$1.74`) suspected first.

`ce840e9`, which introduced this line into the test setup, wrote the rule this
breaks: *"A convention is what failed here; a guard is the fix."* It built a
guard for the database — a `DATABASE_URL` not ending in `_test` aborts the run —
and none for `.env`.

## 2. What is NOT the defect

**`npm test` also runs live suites without their timeout.** `test:live` passes
`--setupFilesAfterEnv=./tests/helpers/jest.setup.live.ts` (180 s); bare `jest`
picks the same files up with jest's default 5 s, and a real LLM call never
returns in 5 s. **Separate defect, separate change** — recorded here so it is not
mistaken for this one, and proven separately: the suite that failed passes 3/3
when run with its own runner and a loaded key.

## 3. Constraints on the fix

- `engine-core` is `private: true` — not consumed outside this repo, so the
  repository root is a legitimate anchor.
- `config.ts` runs from both `src/core/` and `dist/core/`; both are exactly four
  levels below the root — **verified**, not assumed.
- The current resolution works for `npm run x -w pkg`, for the CLI, and for the
  REST entry point. **It must keep working.** This adds a fallback; it does not
  replace the rule.

## 4. The change

One helper, used by all four sites:

```ts
// scripts/resolve-env.cjs (and a .ts twin, or one shared module — see §7)
//
// The single root .env, found whichever way the process was started.
//
// INIT_CWD stays first: it is correct for `npm run x -w pkg` and for a plain
// invocation from the root. What it is NOT correct for is
// `npm test --workspaces`, which rewrites INIT_CWD to each package as it
// recurses — measured, and the reason this exists.
//
// The failure this replaces was silent: dotenv returns { error } for a missing
// file and no caller read it, so a run continued with no key and reported the
// consequence four layers away.
function resolveEnvPath(fromFile) {
  const candidates = [
    process.env.INIT_CWD && path.resolve(process.env.INIT_CWD, '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(fromFile, '../../../../.env'),   // the repo root, from a package
  ].filter(Boolean)
  return candidates.find(fs.existsSync)
}
```

and at each site:

```ts
const envPath = resolveEnvPath(__dirname)
const loaded = envPath ? loadEnv({ path: envPath }) : { error: new Error('no .env found') }
if (loaded.error) log.warn({ tried: … }, '.env not loaded — env comes from the process only')
```

**The warning is the guard.** It does not abort: running with no `.env` is
legitimate (CI with real env vars, a container). What is not legitimate is
being unable to tell which happened.

## 5. What changes and what does not

| | |
|---|---|
| changes | the path resolution at 4 sites; a warning when nothing is found |
| does not change | any resolved value where a `.env` is found today — the first candidate is the current rule, so an environment that works keeps the identical path |
| does not change | dotenv's precedence: existing `process.env` still wins |
| does not touch | the `_test` database guard, jest configs, any test file, the live-timeout defect (§2) |

## 6. Acceptance

1. `INIT_CWD=<root> node -e "require('./packages/engine-core/dist/core/config.js')"` → key present *(works today; must still work)*
2. From `packages/engine-core`, with `INIT_CWD` unset → key present *(fails today)*
3. `npm test --workspaces` → `DEEPSEEK_API_KEY` set inside jest *(fails today)*
4. With `.env` renamed away → one warning naming the paths tried, and no crash
5. `npm run test:unit` — 172 suites / 1838 tests still green
6. `git diff` touches exactly the four sites plus the new helper

## 7. Open question — one, and it is a real choice

**Four sites, two module systems.** `jest-setup-test-db.cjs` is CommonJS;
`config.ts`, `main.ts` and `drizzle.config.ts` are ESM TypeScript. A single
shared module means either a `.cjs` the TS files import, or duplicating a
six-line function.

`engine-core/src/core/config.ts` cannot import from `scripts/` — it ships in
`dist`. So either the helper lives in `engine-core/src/core/` and
`jest-setup-test-db.cjs` reads it from `dist` (a test setup depending on a build
output), or the six lines exist twice with a comment binding them.

**Recommendation: duplicate, with the comment.** Six lines of path resolution
with no state, in two places, is cheaper than a build-order dependency between a
test setup and a compiled artifact — and `PATTERNS.md` P7 says permanent
structure is the last resort. Flagged rather than decided.
