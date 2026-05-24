@echo off
REM Comm Center launcher — runs production server at http://localhost:3002
REM Used by Windows Task Scheduler for auto-boot, or run manually.
REM
REM First run will build automatically. Subsequent runs skip the build.

cd /d "%~dp0"

REM Ensure dependencies are installed (idempotent — npm checks lockfile)
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
  )
)

REM Build if .next/BUILD_ID is older than any source file, or doesn't exist
if not exist ".next\BUILD_ID" (
  echo No build found. Building...
  call npm run build
  if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
  )
)

echo Starting Comm Center on http://localhost:3002 ...
set PORT=3002
call npm start
