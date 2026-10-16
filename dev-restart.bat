@echo off
setlocal EnableExtensions
title Q-Scan - stop ^& restart local dev
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "LOGDIR=%TEMP%\opencode"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOCKDIR=%LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\scrapeflow"

if /i "%~1"=="stop" goto stoponly

echo ============================================================
echo   Q-Scan local dev  -  STOP ^& RESTART
echo   Project : %ROOT%
echo ============================================================
echo.

echo [1/7] Stopping Next dev server (port 3001)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue).OwningProcess; if($p){$p|ForEach-Object{Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue}; Write-Host '        dev server stopped'}else{Write-Host '        dev server was not running'}"

echo [2/7] Stopping Prisma dev daemon (scrapeflow)...
call npx prisma dev stop scrapeflow

echo [3/7] Waiting 6s for file handles to release...
ping -n 7 127.0.0.1 >nul

echo [4/7] Killing leftover cli-dev procs + clearing stale locks (DB data is safe)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ds='%LOCKDIR%'; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'cli-dev' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; for($i=0;$i -lt 15;$i++){ Get-ChildItem -Path $ds -Filter 'server.lock*' -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue; if(-not (Test-Path (Join-Path $ds 'server.lock.lock')) -and -not (Test-Path (Join-Path $ds 'server.lock'))){ break }; Start-Sleep -Milliseconds 800 }; if((Test-Path (Join-Path $ds 'server.lock.lock')) -or (Test-Path (Join-Path $ds 'server.lock'))){ Write-Host '        WARNING: stale locks STILL present' -ForegroundColor Red } else { Write-Host '        locks cleared' -ForegroundColor Green }"

echo [5/7] Starting Prisma dev daemon (scrapeflow)  -^>  127.0.0.1:51214 ...
start "qscan-db" /min cmd /c "npx prisma dev -d -n scrapeflow > %LOGDIR%\daemon.log 2>&1"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 60;$i++){ if(Get-NetTCPConnection -State Listen -LocalPort 51214 -ErrorAction SilentlyContinue){$ok=$true;break}; Start-Sleep -Seconds 1 }; if($ok){Write-Host '        database is up' -ForegroundColor Green}else{Write-Host '        WARNING: db not up in 60s - see %LOGDIR%\daemon.log' -ForegroundColor Red}"

echo [6/7] Starting Next dev server  -^>  http://localhost:3001 ...
start "qscan-dev" /min cmd /c "node node_modules\next\dist\bin\next dev -p 3001 > %LOGDIR%\dev.log 2>&1"

echo [7/7] Waiting for the app to answer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 60;$i++){ try{ $r=Invoke-RestMethod -Uri 'http://localhost:3001/api/health/db' -TimeoutSec 2; if($r.ok){$ok=$true;break} }catch{}; Start-Sleep -Seconds 2 }; if($ok){Write-Host '        app is up, database reachable' -ForegroundColor Green}else{Write-Host '        app not ready yet - see %LOGDIR%\dev.log' -ForegroundColor Yellow}"

echo.
echo ============================================================
echo   Ready:
echo     App   : http://localhost:3001
echo     Admin : http://localhost:3001/admin   (secret: local-dev-secret)
echo     DB    : 127.0.0.1:51214
echo     Logs  : %LOGDIR%\dev.log   ^|   %LOGDIR%\daemon.log
echo ============================================================
echo.
pause
exit /b 0

:stoponly
echo Stopping Next dev server (port 3001)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=(Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue).OwningProcess; if($p){$p|ForEach-Object{Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue}; Write-Host '        dev server stopped'}else{Write-Host '        dev server was not running'}"
echo Stopping Prisma dev daemon (scrapeflow)...
call npx prisma dev stop scrapeflow
echo Done. Everything stopped.
pause
exit /b 0
