@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

:: Přepni do složky kde leží tento .bat soubor (funguje odkudkoliv)
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       DevOps Integrator — spouštěč      ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Kontrola Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Node.js NENÍ nainstalován!
    echo.
    echo  Node.js je potřeba pro spuštění aplikace.
    echo  Otevírám stránku pro stažení...
    echo.
    start https://nodejs.org/en/download/
    echo  Po dokončení instalace Node.js zavři toto okno
    echo  a spusť start.bat znovu.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  ✅ Node.js %NODE_VER% nalezen

:: Vždy clean install — zaručí kompatibilitu s aktuální verzí Node.js
echo  🧹 Čistím node_modules pro čistou instalaci...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "package-lock.json" del "package-lock.json"

echo  📦 Instaluji závislosti (npm install)...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  ❌ npm install selhal. Zkontroluj připojení k internetu.
    pause
    exit /b 1
)
if not exist "node_modules\express" (
    echo.
    echo  ❌ Balíčky se nenainstalovaly správně. Zkus spustit ručně:
    echo     npm install
    pause
    exit /b 1
)
echo  ✅ Závislosti OK

echo.
echo  🚀 Spouštím server na http://localhost:4242
echo  Pro ukončení stiskni Ctrl+C
echo.

:: Otevřít prohlížeč po krátké prodlevě
start /b cmd /c "timeout /t 2 >nul && start http://localhost:4242"

node server.js
pause
