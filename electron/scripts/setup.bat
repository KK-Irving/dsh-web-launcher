@echo off
REM DSH Desktop - Quick Setup & Launch
REM Usage:
REM   setup.bat           Install deps + launch
REM   setup.bat --build   Install deps + build installer
REM   setup.bat --pack    Install deps only

cd /d "%~dp0\.."

echo === DSH Desktop Setup ===
echo.

REM Check node
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from https://nodejs.org/
    pause
    exit /b 1
)
echo   Node.js : 
node --version

REM Check pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo   pnpm not found, installing via corepack...
    corepack enable
    corepack prepare pnpm@latest --activate
)
echo   pnpm    : 
pnpm --version
echo.

REM Install
echo [1/2] Installing dependencies...
call pnpm install
if errorlevel 1 (
    echo ERROR: pnpm install failed
    pause
    exit /b 1
)
echo   Done.
echo.

if "%1"=="--build" (
    echo [2/2] Building distributable...
    call pnpm run build:win
    if errorlevel 1 (
        echo ERROR: Build failed
        pause
        exit /b 1
    )
    echo.
    echo   Build output: %cd%\dist\
    pause
    exit /b 0
)

if "%1"=="--pack" (
    echo Setup complete. Run "pnpm start" to launch.
    pause
    exit /b 0
)

REM Launch
echo [2/2] Launching DSH Desktop...
call pnpm start