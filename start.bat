@echo off
REM ============================================
REM Windows 启动脚本 - 宿舍报修系统
REM 使用方法：双击此文件或从命令行运行 start.bat
REM ============================================

echo ========================================
echo   宿舍报修系统 - Windows 启动脚本
echo ========================================
echo.

REM 检查 Node.js 是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址：https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js 已安装
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 未检测到 Python，FastAPI 后端可能无法启动
    echo 下载地址：https://www.python.org/downloads/
    echo.
)

REM 选择要启动的后端
echo 请选择要启动的后端：
echo 1. Express 后端 (Node.js, 端口 3001)
echo 2. FastAPI 后端 (Python, 端口 8000)
echo.
set /p choice="请输入选项 (1 或 2，默认 2): "

if "%choice%"=="" set choice=2

if "%choice%"=="2" (
    echo.
    echo [信息] 正在安装前端依赖...
    cd frontend
    call npm install
    cd ..

    echo.
    echo [信息] 正在安装后端依赖...
    cd backend_fastapi
    pip install -r requirements.txt
    cd ..

    echo.
    echo [信息] 正在启动 FastAPI 后端和前端...
    echo.
    start "FastAPI Backend" cmd /k "cd backend_fastapi && python -m uvicorn main:app --reload --port 8000"
    timeout /t 3 /nobreak >nul
    start "Frontend" cmd /k "cd frontend && npm run dev"
    
    echo.
    echo ========================================
    echo   服务已启动！
    echo   前端：http://localhost:5173
    echo   后端：http://127.0.0.1:8000
    echo ========================================
) else (
    echo.
    echo [信息] 正在安装依赖...
    call npm install
    cd frontend
    call npm install
    cd ..\backend
    call npm install
    cd ..

    echo.
    echo [信息] 正在启动 Express 后端和前端...
    echo.
    start "Backend" cmd /k "cd backend && npm run dev"
    timeout /t 3 /nobreak >nul
    start "Frontend" cmd /k "cd frontend && npm run dev"
    
    echo.
    echo ========================================
    echo   服务已启动！
    echo   前端：http://localhost:5173
    echo   后端：http://localhost:3001
    echo ========================================
)

echo.
echo 按任意键关闭此窗口...
pause >nul
