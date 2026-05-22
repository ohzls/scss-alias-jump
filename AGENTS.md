## scss-alias-jump — Agent Guide (LLM-focused)

This file is optimized for an LLM coding agent.
Goal: keep the VS Code extension stable and reviewable while preserving release/package integrity.

---

## Context budget / duplicate suppression (critical)

- For long or repetitive work, follow `/Users/seongwonseo/Documents/knowledge-hub/10_Common/Codex Context Budget Policy.md`.
- Do not repeatedly paste the same full file, function body, stack trace, long command output, diff, or runtime snapshot into the session.
- Create a compact context checkpoint after the same artifact is referenced 3+ times, when a major phase ends, when roughly 30 minutes of same-task work has elapsed, or when the user asks to compress/summarize context.
- Treat checkpoints as derived working memory only; before implementation decisions or final claims, reopen repo-local source truth or rerun validation.

## First-read order

1. `/Users/seongwonseo/Documents/projects/scss-alias-jump/README.md`
2. `/Users/seongwonseo/Documents/projects/scss-alias-jump/CHANGELOG.md`

## Verification defaults (critical)

- Default representative verification: `npm run compile`.
- If the change affects packaging/release behavior, also run `npm run vscode:prepublish`.
- For local Cursor/VSIX packaging, prefer `npm run bundle`; use `npm run bundle:cursor` only when the generated VSIX should be installed into Cursor immediately.
- For Marketplace publishing, run `npm run publish:marketplace:dry` before any real publish. Real publish requires `VSCE_PAT` and should use `npm run publish:marketplace -- --skip-duplicate` or the `Publish VS Code Extension` GitHub Actions workflow.
- If the change affects hover/definition workspace scans, cancellation, caching, activation events, or generated-folder scan settings, also run `npm run verify:stability`.

## Extension packaging boundary (critical)

- Treat alias-resolution behavior and VS Code activation/package surfaces as contract-sensitive.
- Keep release/versioning notes aligned with `CHANGELOG.md`; do not cut a release script change without updating the documented workflow.

---

## Documentation + Obsidian policy (critical)

- Repo-local docs remain the SSOT for implementation and review decisions: `AGENTS.md`, `README.md`, stable `docs/*` policy/contract files, and task-specific reference docs when this repo uses them.
- Obsidian may be used as a search/index layer, hub, or mirrored summary to reduce discovery cost, but it must **not** replace repo doc updates.
- When a durable rule, contract, verification path, workflow, or operating note changes, update the repo-local doc first in the same slice and sync Obsidian in the same change or immediately after.
- Prefer Obsidian for “start here” hub notes, cross-links, and condensed history/context. Prefer repo docs for normative requirements, commands, and completion criteria.
- If Obsidian and repo docs disagree, treat repo docs + current code/tests as authoritative and record any vault sync follow-up explicitly.

## Repeat-mistake prevention loop (critical)

When a bug, review finding, or false “done” claim exposes a workflow gap,
do **not** stop at patching the immediate code.
Add a recurrence guard in the same change whenever feasible.

Rules:

- Treat repeat mistakes as a **process bug**, not only a code bug.
- Prefer an **enforced guard** over a memory-only reminder.
  - Good guards: tests, verification scripts, assertions, or a documented mandatory checklist step.
- A hook/script only counts as protection if it is **actually enforced or re-run** in the normal workflow.
- Do **not** use tool limitations as a reason to skip automation.
  - If a shell one-liner is brittle, use a small helper script or intermediate-file pattern instead.
- If a completion claim was disproved, rerun the representative verification path end-to-end before claiming completion again.
- When the lesson is repo-wide agent behavior, update `AGENTS.md`.
- When the lesson is task-specific, update the relevant plan/checklist/reference doc with the exact verification path.

## Finding-Fix Discipline (critical)

When the user asks to address a specific review finding, regression, or disproved claim:

- First land the **narrowest change** that closes that exact finding.
- In the same slice, add the **smallest recurrence guard** that proves the finding is closed.
- Do **not** mix adjacent helper extraction, cleanup, or opportunistic refactors into the finding fix unless they are required to make the fix work or are forced by failing verification.
- After a finding-driven fix lands, treat the touched file/module boundary as **frozen for the rest of the turn**.
  - Re-open it only if a failing verification path or new falsifying evidence requires it.
- If broader cleanup is still desirable, do it in a **follow-up slice** and label it explicitly as follow-up cleanup, not as part of the finding fix.
- Do **not** delete/rewrite previously stabilized code just because a nearby abstraction looks cleaner.
  - Require concrete evidence of drift, duplication harm, or incorrect behavior first.
- If a refactor is unavoidable while fixing, preserve behavior with boundary-level before/after regression coverage.

Self-challenge rule:

- Before declaring a sensitive slice “done,” ask:
  - **What evidence would prove this claim wrong?**
- Then run at least one check that could falsify the claim, not just confirm the happy path.

## Completion checklist

- Keep docs in sync when user-visible behavior, workflow, repo policy, or operator runbook changes.
- Re-run the representative verification path for the slice you changed.
- For responsiveness/stall fixes, include `npm run verify:stability` and document any manual VS Code/Cursor smoke test that remains.
- Sync the corresponding Obsidian hub/mirror note if this change updates durable guidance.
- Do one explicit self-challenge pass before saying the task is done.
