@echo off
setlocal enabledelayedexpansion

rem =====================================================
rem VS Code Extension Diagnostics (cmd only)
rem - Prints folder tree
rem - Finds package.json / src/extension.ts / tsconfig.json
rem - Prints key file excerpts (top lines)
rem =====================================================

set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=%CD%"

echo ==========================================
echo EXT DIAG
echo ROOT: "%ROOT%"
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set "TODAY=%%a-%%b-%%c"
echo DATE: %date% %time%
echo ==========================================
echo.

if not exist "%ROOT%" (
  echo ERROR: ROOT not found: "%ROOT%"
  exit /b 2
)

pushd "%ROOT%" >nul

echo [A] tree /f /a (depth hint: full)
echo ------------------------------------------
tree /f /a
echo.

echo [B] find key files (dir /s /b)
echo ------------------------------------------
echo - package.json:
dir /s /b package.json 2>nul
echo.
echo - tsconfig.json:
dir /s /b tsconfig.json 2>nul
echo.
echo - extension entry candidates:
dir /s /b src\extension.ts 2>nul
dir /s /b src\extension.js 2>nul
dir /s /b out\extension.js 2>nul
echo.

echo [C] show first 120 lines of package.json (if any)
echo ------------------------------------------
for /f "delims=" %%F in ('dir /s /b package.json 2^>nul') do (
  echo --- %%F ---
  call :print_head "%%F" 120
  echo.
)

echo [D] show first 120 lines of src\extension.ts (if any)
echo ------------------------------------------
for /f "delims=" %%F in ('dir /s /b src\extension.ts 2^>nul') do (
  echo --- %%F ---
  call :print_head "%%F" 120
  echo.
)

echo [E] quick sanity: npm scripts (from package.json)
echo ------------------------------------------
for /f "delims=" %%F in ('dir /s /b package.json 2^>nul') do (
  echo --- %%F ---
  findstr /n /i "\"name\"\|\"publisher\"\|\"version\"\|\"main\"\|\"activationEvents\"\|\"contributes\"\|\"scripts\"" "%%F"
  echo.
)

echo [F] list top-level dirs/files
echo ------------------------------------------
dir /a
echo.

popd >nul
exit /b 0

:print_head
set "FILE=%~1"
set "N=%~2"
set /a COUNT=0
for /f "usebackq delims=" %%L in ("%FILE%") do (
  set /a COUNT+=1
  echo %%L
  if !COUNT! geq %N% goto :eof
)
goto :eof
