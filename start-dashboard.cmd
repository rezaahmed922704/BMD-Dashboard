@echo off
REM Starts the ACL Trade dashboard on http://localhost:8767/
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0serve-dashboard.ps1"
echo Dashboard starting at http://localhost:8767/
