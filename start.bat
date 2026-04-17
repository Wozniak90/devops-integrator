@echo off
setlocal enabledelayedexpansion

:: Change to script directory (works from any location)
cd /d "%~dp0"

echo.
echo  ============================================
echo   DevOps Integrator - Launcher
echo  ============================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERR] Node.js is not installed!
    echo.
    echo  Node.js is required to run this application.
    echo  Opening download page...
    echo.
    start https://nodejs.org/en/download/
    echo  After installing Node.js, close this window
    echo  and run start.bat again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% found

:: Install dependencies only when missing (incremental - avoids 60s reinstall on every start)
if not exist "node_modules\express" (
    echo  [INFO] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERR] npm install failed. Check your internet connection.
        pause
        exit /b 1
    )
    if not exist "node_modules\express" (
        echo.
        echo  [ERR] Packages did not install correctly. Try running manually:
        echo     npm install
        pause
        exit /b 1
    )
    echo  [OK] Dependencies installed
) else (
    echo  [OK] Dependencies already present
)

echo.
echo  [INFO] Starting server at http://localhost:4242
echo  Press Ctrl+C to stop.
echo.

:: Open browser after short delay
start /b cmd /c "timeout /t 2 >nul && start http://localhost:4242"

node server.js
pause
