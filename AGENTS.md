# Agent Collaboration Instructions

These instructions apply to the whole repository.

## Required Startup Checks

Before changing files, every agent must:

1. Read `README.md`.
2. Read `docs/project_memory.md`.
3. Read any task-relevant files under `docs/`, `backend/`, `frontend/`, or `data/`.
4. Check the current branch and working tree:

```bash
git status --short --branch
```

5. Attempt to refresh remote refs:

```bash
git fetch
```

If `git fetch` succeeds, compare the current branch with its upstream before editing. If the local branch is behind the remote branch, integrate the remote changes first using the team's normal Git workflow.

If `git fetch` fails because the network or permissions are unavailable, continue only if the task can be completed safely from local context, and record that limitation in `docs/project_memory.md`.

## Project Memory Requirement

Every completed partial task must update `docs/project_memory.md` in the same change set.

The update must include:

- Date.
- Owner or agent.
- Completed task summary.
- Files or areas changed.
- Validation performed.
- Any remote sync limitation, conflict, or follow-up.

If a remote teammate changes the repository, the next agent who pulls or merges those changes must also update `docs/project_memory.md` so the memory reflects the latest completed work.

## Conflict and Remote Change Rules

- Preserve valid teammate changes.
- Do not overwrite remote work just to make a local plan fit.
- When Markdown memory conflicts happen, merge entries chronologically and keep both sides unless one is clearly obsolete.
- If behavior, API shape, or demo flow changes, update the relevant docs and record the decision in `docs/project_memory.md`.
- Keep repo-specific instructions in this file and task history in `docs/project_memory.md`.

## Current Repo Shape

This is a local demo scaffold for SIUS2612 Topic 2 with:

- FastAPI mock backend in `backend/`.
- React + TypeScript + Vite frontend in `frontend/`.
- Deterministic sample data in `data/`.
- Demo and collaboration docs in `docs/`.

The project is demo-only. Do not add real API keys, live production integrations, or deployment assumptions unless the team explicitly decides to expand scope.
