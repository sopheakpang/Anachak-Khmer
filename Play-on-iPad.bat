@echo off
rem Khmer Kingdoms on iPad / phone over home Wi-Fi (D74). Double-click, then open the
rem address shown in Safari on the iPad. Keep this window open while playing.
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run ipad
pause
