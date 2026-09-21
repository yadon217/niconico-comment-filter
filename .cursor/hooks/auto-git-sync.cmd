@echo off
setlocal EnableExtensions

rem Manual fallback when Node is unavailable. hooks.json uses auto-git-sync.mjs instead.
rem Cursor on Windows may open .sh paths in the editor; this wrapper runs bash safely.
set "SCRIPT=%~dp0auto-git-sync.sh"

if exist "C:\Program Files\Git\bin\bash.exe" (
  "C:\Program Files\Git\bin\bash.exe" "%SCRIPT%"
  exit /b %ERRORLEVEL%
)

where bash >nul 2>&1
if %ERRORLEVEL%==0 (
  bash "%SCRIPT%"
  exit /b %ERRORLEVEL%
)

exit /b 0
