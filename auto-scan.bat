@echo off
setlocal EnableExtensions
title Q-Scan - auto-scan scheduler
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "LOGDIR=%TEMP%\opencode"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

rem Interval in seconds (default 900 = 15 min). Optional 1st arg overrides.
if "%~1"=="" (set "INTERVAL=120") else (set /a INTERVAL=%~1)
set "SECRET=local-dev-cron-secret"
set "URL=http://localhost:3001/api/cron/fetch?secret=%SECRET%"

echo ============================================================
echo   Q-Scan auto-scan scheduler
echo   Runs the same job the Vercel cron does: every enabled source
echo   whose fetch interval (1h by default) has elapsed.
echo   Pinging every %INTERVAL% seconds.
echo   URL  : %URL%
echo   Log  : %LOGDIR%\autoscan.log
echo   Stop : press Ctrl+C  (or just close this window)
echo ============================================================
echo.

:loop
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; try { $r = Invoke-RestMethod -Uri '%URL%' -TimeoutSec 1800; $line = $p + '  ran=' + $r.ran } catch { $line = $p + '  failed: ' + $_.Exception.Message }; Write-Host $line; Add-Content -Path '%LOGDIR%\autoscan.log' -Value $line"
echo   next ping in %INTERVAL%s...
timeout /t %INTERVAL% /nobreak >nul
goto loop
