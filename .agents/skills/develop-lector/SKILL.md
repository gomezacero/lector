---
name: develop-lector
description: Implement, diagnose, review, test, document, package, or release changes in the Lector Electron PDF reader. Use for work involving its PDF ingestion, reading modes, guided pace, search, notes, dictionary, offline speech, OCR, persistence, IPC, SDD requirements, UI, accessibility, Windows builds, or GitHub releases.
---

# Develop Lector

## Establish context

1. Resolve the repository root with `git rev-parse --show-toplevel`.
2. Read `AGENTS.md` completely before taking task actions.
3. Inspect `git status --short`; preserve unrelated user changes.
4. Classify the request and load only its canonical references:
   - product behavior: `docs/sdd/README.md`, master SDD, then the matching spec;
   - architecture or lifecycle: `docs/architecture.md`;
   - persistence, locators, cache, notes or settings: `docs/data-model.md` and
     `src/contracts/models.js`;
   - distribution: `CODE_SIGNING_POLICY.md` and
     `docs/distribution/windows-code-signing.md`;
   - public contribution: `CONTRIBUTING.md`, `SECURITY.md` and license notices.

Do not treat README marketing copy as the detailed behavioral contract.

## Execute the change

1. Reproduce a reported defect or identify observable evidence before editing.
2. Trace ownership from UI event through controller, reader/worker and
   repository instead of patching only the visible symptom.
3. Update the applicable spec before implementation when behavior changes.
4. Add a requirement ID to tests when the spec defines one.
5. Implement the smallest complete vertical that preserves locator, session
   cancellation, offline operation, atomic persistence and accessibility.
6. Use `apply_patch` for source and documentation edits.
7. Avoid modifying generated artifacts, real user data or copyrighted PDFs.

## Select verification

Follow the matrix in `AGENTS.md`. Default to:

```bash
npm run check
npm test
git diff --check
```

Add `npm run fixtures` for ingestion/model changes and the relevant Electron
task for UI or integration work:

```bash
npm run smoke
npm run e2e:read
npm run e2e:experience
npm run e2e:visual
npm run smoke:tts
```

Do not build installers for an unrelated code or documentation change. Do not
publish or sign unless the user's scope explicitly includes distribution.

## Review before handoff

- Inspect the final diff and repository status.
- Confirm no new runtime network dependency, telemetry or remote fallback.
- Confirm locator stability, stale callback rejection and `flush()` where
  relevant.
- State which checks passed, which could not run and why.
- Link concrete files and distinguish implemented behavior from beta,
  platform-dependent or externally blocked work.

When a task changes the development protocol itself, update `AGENTS.md` first
and keep this skill procedural and concise.
