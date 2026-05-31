@echo off
REM Dorm Repair System - Windows launcher
REM FastAPI + SQLite is the primary demo stack.

echo ========================================
echo   Dorm Repair System
echo ========================================
echo.
echo 1. Start primary demo stack: FastAPI + React
echo 2. Start legacy stack: Express + React
echo.
set /p choice="Choose an option (default 1): "
if "%choice%"=="" set choice=1

if "%choice%"=="2" (
    echo [Legacy] Starting Express backend and React frontend...
    call npm install
    cd frontend
    call npm install
    cd ..\backend
    call npm install
    cd ..
    start "Dorm Backend Express" cmd /k "cd backend && npm run dev"
    timeout /t 3 /nobreak >nul
    start "Dorm Frontend Vite" cmd /k "cd frontend && npm run dev"
    echo.
    echo Frontend: http://localhost:5173
    echo Express backend: http://localhost:3001
) else (
    call dev_win.bat
)

echo.
pause
