# Red-team review — 2026-05-20

Scope:
- SCSS Alias Jump intermittent stall fix plan
- Obsidian-Codex connection added for `scss-alias-jump`

Status: **runtime blockers addressed in code; Obsidian connection artifacts still require surgical staging/manifest cleanup before commit.**

## Runtime stall plan blockers

Implementation status: addressed in the 2026-05-20 runtime slice. Verified with `npm run compile`, `npm run verify:stability`, and `npm run vscode:prepublish`.


- `findPlaceholderDefinitions` must be mandatory in cancellable scan Slice 2; it is already a definition-provider hot path.
- `CancellationToken` only cancels APIs that accept it. `workspace.fs.readFile()` and synchronous line scans require max-size guards, periodic token checks, and chunk/yield behavior.
- Repeated hover can launch duplicate in-flight scans before result caches are written. Add in-flight de-dupe and backpressure.
- Scoped search requires cache keys to include scan kind, query, scope folder, fallback mode, and effective exclude/config version.
- `workspace.findFiles` token must be the 4th argument: `findFiles(include, exclude, maxResults, token)`.
- `scanExclude` array settings need conversion/post-filtering because VS Code `findFiles` exclude is one `GlobPattern`.
- Sass path cache watcher should clear on create/delete and config/workspace changes, not every content change.
- Activation events reduce startup gap but are not evidence that runtime stalls are fixed.
- Add deterministic cancellation/backpressure/cache-invalidation guard beyond `npm run compile`.

## Obsidian connection blockers

- `/Users/seongwonseo/Documents/knowledge-hub` is a large mixed dirty worktree; use surgical staging only.
- `manifest.json`, `manifest.generated.json`, and generated bundle artifacts are not in parity for the new SCSS preset.
- `auto_current/*` is volatile and must not be treated as durable commit artifact.
- The no-task selected SCSS bundle can include unrelated fallback context unless the preset/build logic prevents cross-project fallback.
- Project Hub currently references repo-local `AGENTS.md` and plan docs that are untracked in the SCSS repo.
- Existing startup-core guard in knowledge-hub may be red due stale hard-coded paths; do not trust bridge green status alone until guard is repaired or scoped.

## Safe next actions

1. Update the stall fix plan before implementation. Done in `INTERMITTENT_STALL_FIX_PLAN_2026-05-20.md`.
2. Do not stage `knowledge-hub/40_Working/codex_export/auto_current/*`.
3. Before committing Obsidian connection, isolate only the SCSS preset/hub/doc changes and verify `git diff --cached --name-status`.
4. Either track `AGENTS.md` and the plan doc in the SCSS repo, or remove them from Obsidian Hub sources until tracked.
5. Regenerate durable manifest/generated bundle artifacts in a clean lane, or explicitly defer committing them.

## Follow-up implementation notes — 2026-05-20

Runtime blockers above were addressed in code and guarded by `npm run verify:stability`.

Obsidian follow-up applied:

- SCSS preset limit reduced to 2 to prevent unrelated fallback bundle leakage in no-task startup.
- `scss_alias_jump` project label mapping added so generated/selected bundle context displays `SCSS Alias Jump` instead of title-cased fallback.
- Re-ran startup without `--task-type`; current bundle has `fallback_matches: 0` and bundle entries are only the SCSS project hub plus the capped common policy note.

Still not safe to broadly commit the vault state:

- `knowledge-hub` remains a large mixed dirty worktree.
- `auto_current/*` remains volatile and must not be committed.
- Durable manifest/generated-bundle parity cleanup should be a separate clean-lane task.
