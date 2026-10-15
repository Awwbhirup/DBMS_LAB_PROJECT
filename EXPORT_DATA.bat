@echo off
cd /d "%~dp0"
node scripts\export.js
start "" "%~dp0export"
