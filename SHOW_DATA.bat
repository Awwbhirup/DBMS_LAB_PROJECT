@echo off
rem Refreshes the readable copy of both databases in the data folder and opens it.
rem The server also refreshes it by itself after every change made in the app.
cd /d "%~dp0"
node scripts\export.js
start "" "%~dp0data"
