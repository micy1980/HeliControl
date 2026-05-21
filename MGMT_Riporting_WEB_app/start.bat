@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MGM Reporting Codex

if not defined HOST set "HOST=0.0.0.0"
if not defined PORT set "PORT=3002"

echo.
echo ============================================
echo   MGM Reporting Codex - helyi hálózat
echo ============================================
echo.
echo Indítás után ezt a gépet a böngészőben így lehet elérni:
echo   http://localhost:%PORT%
echo.
echo A program a helyi hálózati IP címeket is kiírja.
echo Másik gépen ugyanazt az IP-címet kell megnyitni.
echo.
echo Alap belépés:
echo   admin / Admin123!
echo.
echo Leállítás: Ctrl+C
echo.

echo Ellenőrzés: fut-e már a szerver...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:%PORT%/api/health' -TimeoutSec 2; if ($r.success -and $r.data.app -eq 'MGM Reporting Codex') { exit 0 } exit 1 } catch { exit 1 }" >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  echo.
  echo A program már fut ezen a gépen.
  echo Megnyitás: http://localhost:%PORT%
  start "" "http://localhost:%PORT%"
  echo.
  echo Ha újra akarod indítani, előbb állítsd le a régi példányt.
  pause
  exit /b 0
)

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  echo.
  echo A %PORT%-es port már foglalt, de nem válaszol az MGM Reporting Codex.
  echo Zárj be minden régi szervert, vagy indíts másik porttal.
  echo Példa: set PORT=3003 ^& start.bat
  echo.
  pause
  exit /b 1
)

node server.js

echo.
echo Szerver leállt.
pause
