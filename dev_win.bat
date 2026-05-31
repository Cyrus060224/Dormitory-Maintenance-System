@echo off
setlocal enabledelayedexpansion

REM Dorm Repair System - Windows dev launcher (FastAPI + React)
REM Usage: double click this file, or run dev_win.bat in cmd.

echo ========================================
echo   Dorm Repair System - Dev Launcher
echo   Backend: FastAPI on http://127.0.0.1:8000
echo   Frontend: Vite on http://localhost:5173
echo ========================================
echo.

echo [Check] Node.js
node --version >nul 2>&1
if !errorlevel! neq 0 (
    echo [Error] Node.js is required. Install it from https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo.

echo [Check] Python
set "PY_CMD=python"
python --version >nul 2>&1
if !errorlevel! neq 0 (
    py -3 --version >nul 2>&1
    if !errorlevel! neq 0 (
        echo [Error] Python is required. Install it from https://www.python.org/downloads/
        pause
        exit /b 1
    )
    set "PY_CMD=py -3"
)
%PY_CMD% --version
echo.

echo [Check] Frontend dependencies
if not exist "frontend\node_modules" (
    cd frontend
    call npm install
    if !errorlevel! neq 0 exit /b !errorlevel!
    cd ..
) else (
    echo [OK] frontend/node_modules exists
)
echo.

echo [Check] Python virtual environment
if not exist ".venv\Scripts\python.exe" (
    %PY_CMD% -m venv .venv
    if !errorlevel! neq 0 exit /b !errorlevel!
)
call .venv\Scripts\activate
pip install -r backend_fastapi\requirements.txt
if !errorlevel! neq 0 exit /b !errorlevel!
echo.

echo [Start] Opening backend and frontend terminals...
start "Dorm Backend FastAPI" cmd /k "cd backend_fastapi && ..\.venv\Scripts\activate && python -m uvicorn main:app --reload --port 8000"
timeout /t 3 /nobreak >nul
start "Dorm Frontend Vite" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo   Services are starting
echo   Frontend: http://localhost:5173
echo   Backend docs: http://127.0.0.1:8000/docs
echo ========================================
echo.
pause
