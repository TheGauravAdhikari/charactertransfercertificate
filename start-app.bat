@echo off
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 goto use_launcher
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 is required to start the Character Certificate Desk.
  echo Install Python from https://www.python.org/downloads/ and try again.
  pause
  exit /b 1
)
python server.py
if errorlevel 1 pause
exit /b

:use_launcher
py -3 server.py
if errorlevel 1 pause
