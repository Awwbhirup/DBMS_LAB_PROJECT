@echo off
rem Rebuilds both databases from scratch so every demo starts from the same data,
rem then rewrites the readable copy in the data folder.
cd /d "%~dp0"
node scripts\setup.js
node scripts\export.js
pause
