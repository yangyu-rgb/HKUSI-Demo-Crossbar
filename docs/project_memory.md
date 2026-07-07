# Project Memory

Shared memory for team members and agents working on this repository. Update this file whenever a partial task is completed, especially after pulling or merging remote teammate changes.

## Current Status

- Repository scaffold is initialized for the SIUS2612 Topic 2 local AI demo.
- Local branch: `main`, configured to track `origin/main`.
- Locally known remote state on 2026-07-07: `main` aligned with `origin/main` at commit `93dd695` (`add demo scaffold`).
- Remote freshness caveat: `git fetch` was attempted on 2026-07-07, but GitHub SSL connection failed, so the latest remote state could not be verified during this update.
- Backend scaffold: FastAPI mock API in `backend/app/main.py`.
- Frontend scaffold: React + TypeScript + Vite dashboard in `frontend/`.
- Sample data: deterministic topic scenarios and outputs in `data/`.
- Documentation: README, API contract, demo script, team roles, agent instructions, and this memory file.

## Completed Tasks

| Date | Owner | Task | Changed Areas | Validation |
| --- | --- | --- | --- | --- |
| 2026-07-07 | Agent | Checked initialization state and added collaboration memory workflow. | `AGENTS.md`, `docs/project_memory.md`, `README.md` | `git status --short --branch`; JSON syntax checks for sample data; Python AST parse for backend entrypoint; package script inspection. Remote fetch attempted but failed due GitHub SSL connection. |

## In Progress

- Final project topic can still be chosen from WasteWise AI, ClinicFlow AI, or HireReady AI.
- Dependency install and full local runtime verification have not been completed in this memory log.
- No frontend lockfile is currently committed.

## Decisions

- Keep the repository demo-only and deterministic.
- Do not require real AI API keys, live job boards, clinic systems, POS systems, or deployment for the demo.
- Use `AGENTS.md` for agent operating instructions.
- Use this file for project memory, partial-task completion records, remote sync notes, and follow-ups.
- When remote teammate changes are integrated, update this file in the same change set to reflect what changed.

## Next Tasks

- Run backend locally after installing Python dependencies.
- Run frontend locally after installing Node dependencies.
- Add a frontend lockfile once dependencies are installed through the chosen package manager.
- Capture screenshots or a backup demo video after the UI is stable.
- Narrow the final presentation topic and update demo wording accordingly.

## Remote Sync Notes

- Before any future implementation task, run `git fetch`.
- If local `main` is behind `origin/main`, integrate remote changes before editing.
- After integrating remote changes, add a new `Completed Tasks` entry summarizing the teammate or agent changes.
- If Markdown conflicts occur in this file, merge entries chronologically and preserve both valid records.
