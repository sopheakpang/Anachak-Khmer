@echo off
title The Temples - STREAM MODE
cd /d "%~dp0"
echo Checking packages (fast when nothing changed)...
call npm install --no-audit --no-fund --loglevel=error
echo Stream mode: builds the game once, then runs only the game window and the bridge (less RAM).
echo Host panel: http://localhost:7420/host/
echo Keep this window open while you are live. Close it to stop and save.
start "" cmd /c "timeout /t 25 /nobreak >nul & start http://localhost:7420/host/"
call npm run stream
pause
