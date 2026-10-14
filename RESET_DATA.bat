@echo off
rem Rebuilds both databases from scratch so every demo starts from the same data.
cd /d "%~dp0"
node scripts\setup.js
pause
