#!/bin/bash
set -e

# Dorm Repair System - macOS/Linux dev launcher (FastAPI + React)
# Usage: chmod +x dev_mac.sh && ./dev_mac.sh

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"

echo "========================================"
echo "  Dorm Repair System - Dev Launcher"
echo "  Backend: FastAPI on http://127.0.0.1:8000"
echo "  Frontend: Vite on http://localhost:5173"
echo "========================================"
echo ""

echo "[Check] Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "[Error] Node.js is required."
  exit 1
fi
node --version
echo ""

echo "[Check] Python 3"
if ! command -v python3 >/dev/null 2>&1; then
  echo "[Error] Python 3 is required."
  exit 1
fi
python3 --version
echo ""

echo "[Check] Frontend dependencies"
if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  (cd "$ROOT_DIR/frontend" && npm install)
else
  echo "[OK] frontend/node_modules exists"
fi
echo ""

echo "[Check] Python virtual environment"
if [ ! -d "$ROOT_DIR/.venv" ]; then
  python3 -m venv "$ROOT_DIR/.venv"
fi
source "$ROOT_DIR/.venv/bin/activate"
pip install -r "$ROOT_DIR/backend_fastapi/requirements.txt"
mkdir -p "$LOG_DIR"
echo ""

start_backend() {
  cd "$ROOT_DIR/backend_fastapi"
  source "$ROOT_DIR/.venv/bin/activate"
  python -m uvicorn main:app --reload --port 8000
}

start_frontend() {
  cd "$ROOT_DIR/frontend"
  npm run dev
}

echo "[Start] Opening backend and frontend..."
OS_TYPE="$(uname -s)"
if [ "$OS_TYPE" = "Darwin" ]; then
  osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR/backend_fastapi' && source '$ROOT_DIR/.venv/bin/activate' && python -m uvicorn main:app --reload --port 8000\""
  sleep 2
  osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR/frontend' && npm run dev\""
  echo ""
  echo "Frontend: http://localhost:5173"
  echo "Backend docs: http://127.0.0.1:8000/docs"
else
  start_backend > "$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  sleep 2
  start_frontend > "$LOG_DIR/frontend.log" 2>&1 &
  FRONTEND_PID=$!

  echo ""
  echo "Frontend: http://localhost:5173"
  echo "Backend docs: http://127.0.0.1:8000/docs"
  echo "Backend PID: $BACKEND_PID"
  echo "Frontend PID: $FRONTEND_PID"
  echo "Logs: tail -f logs/backend.log logs/frontend.log"
  echo ""
  echo "Press Ctrl+C to stop both services."

  cleanup() {
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  }
  trap cleanup INT TERM EXIT
  wait
fi
