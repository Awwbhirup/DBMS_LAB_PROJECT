@echo off
rem Stops the pharmacy app. The databases keep running as Windows services.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do taskkill /PID %%p /F
pause
