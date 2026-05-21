@echo off
setlocal
cd /d "%~dp0"

node "%~dp0tools\make-password-hash.js"

echo.
pause
