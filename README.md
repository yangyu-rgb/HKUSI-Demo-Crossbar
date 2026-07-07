# SIUS2612 Topic 2 AI Demo

Local demo workspace for the SIUS2612 Topic 2 AI business prototype.

This repository is intentionally demo-only. Proposal PDFs and LaTeX source files stay in the parent course workspace, not in this repo.

## Purpose

The repo supports a local frontend/backend prototype for any selected Topic 2 idea:

- WasteWise AI: campus food-waste demand forecasting
- ClinicFlow AI: outpatient scheduling and patient-flow optimization
- HireReady AI: student career-readiness coaching

The initial implementation is topic-agnostic. The UI and backend can switch between sample demo states, so the team can lock the final topic later without rebuilding the repo structure.

## Project Structure

```text
docs/
  api_contract.md
  demo_script.md
  team_roles.md
frontend/
  React + TypeScript + Vite dashboard
backend/
  FastAPI mock API
data/
  sample_input.csv
  sample_scenarios.json
  sample_output.json
screenshots/
  demo screenshots and fallback images
```

## Local Run

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal. By default the frontend calls `http://127.0.0.1:8000`.

## Demo Reliability

The demo must work without real AI API keys, live job boards, clinic systems, POS systems, or deployment. The backend returns deterministic mock analysis so the presentation timing stays stable.

## Collaboration

Before starting work, read:

- `AGENTS.md` for agent-specific repository instructions
- `docs/project_memory.md` for current project memory, completed tasks, and follow-ups
- `docs/team_roles.md` for ownership areas

Use feature branches:

- `frontend/<name>`
- `backend/<name>`
- `data/<name>`
- `docs/<name>`

Suggested commit style:

```text
feat: add dashboard layout
feat: add analyze API mock
data: add sample scenario files
docs: update demo script
fix: align API response shape
```

Every completed partial task should update `docs/project_memory.md` in the same change set. If remote teammates or agents change the repository, the next person or agent who pulls those changes should update the memory file so it reflects the latest completed work.

## GitHub Remote

Remote repository:

```text
https://github.com/yangyu-rgb/HKUSI-Demo.git
```

If local HTTPS push works in your terminal:

```bash
git remote add origin https://github.com/yangyu-rgb/HKUSI-Demo.git
git branch -M main
git push -u origin main
```
