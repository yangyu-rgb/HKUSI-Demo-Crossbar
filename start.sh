#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
BACKEND_PYTHON="${BACKEND_DIR}/.venv/bin/python"

BACKEND_PID=""
FRONTEND_PID=""

log() {
  printf '[CrossBorder AI] %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[CrossBorder AI] Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

cleanup() {
  local exit_code=$?

  trap - EXIT INT TERM

  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  [[ -z "${BACKEND_PID}" ]] || wait "${BACKEND_PID}" 2>/dev/null || true
  [[ -z "${FRONTEND_PID}" ]] || wait "${FRONTEND_PID}" 2>/dev/null || true

  if [[ -n "${BACKEND_PID}" || -n "${FRONTEND_PID}" ]]; then
    log "Services stopped."
  fi

  exit "${exit_code}"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

require_command python3
require_command node
require_command npm

if [[ ! -x "${BACKEND_PYTHON}" ]]; then
  log "Creating the backend virtual environment..."
  python3 -m venv "${BACKEND_DIR}/.venv"
fi

if ! "${BACKEND_PYTHON}" -c 'import fastapi, pydantic, uvicorn' >/dev/null 2>&1; then
  log "Installing backend dependencies..."
  "${BACKEND_PYTHON}" -m pip install -r "${BACKEND_DIR}/requirements.txt"
fi

if [[ ! -d "${FRONTEND_DIR}/node_modules" ]] || ! (
  cd "${FRONTEND_DIR}"
  npm ls --depth=0 >/dev/null 2>&1
); then
  log "Installing frontend dependencies..."
  (
    cd "${FRONTEND_DIR}"
    npm ci
  )
fi

log "Starting backend at http://127.0.0.1:8000"
(
  cd "${BACKEND_DIR}"
  exec "${BACKEND_PYTHON}" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
) &
BACKEND_PID=$!

log "Starting frontend at http://127.0.0.1:5173"
(
  cd "${FRONTEND_DIR}"
  exec "${FRONTEND_DIR}/node_modules/.bin/vite" --host 127.0.0.1 --port 5173 --strictPort
) &
FRONTEND_PID=$!

printf '\n'
log "Platform ready: http://127.0.0.1:5173"
log "API documentation: http://127.0.0.1:8000/docs"
log "Press Ctrl+C to stop both services."
printf '\n'

while kill -0 "${BACKEND_PID}" 2>/dev/null && kill -0 "${FRONTEND_PID}" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
  wait "${BACKEND_PID}" || exit_code=$?
  printf '[CrossBorder AI] Backend exited unexpectedly (status %s).\n' "${exit_code:-0}" >&2
  exit "${exit_code:-1}"
fi

wait "${FRONTEND_PID}" || exit_code=$?
printf '[CrossBorder AI] Frontend exited unexpectedly (status %s).\n' "${exit_code:-0}" >&2
exit "${exit_code:-1}"
