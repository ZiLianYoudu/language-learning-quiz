@echo off
rem Quiz launcher: rebuild data, then start the local server.
rem The server itself opens the browser once it is ready to accept requests.
rem NOTE: keep this file pure ASCII and CRLF - cmd.exe is fragile with
rem       UTF-8 content inside batch files.
cd /d "%~dp0"
chcp 65001 >nul

python build_data.py
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed. Fix the errors above, then run this again.
  pause
  exit /b 1
)

rem Start local server (window stays open; a second instance exits and
rem reuses the running one, so double-clicking twice is harmless).
start "Quiz Server - close this window to stop" /min cmd /k "python server.py --open"
