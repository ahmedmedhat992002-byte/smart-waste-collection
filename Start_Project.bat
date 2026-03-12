@echo off
title Smart Waste Collection Launcher
echo Starting Smart Waste Collection System...

:: Kill existing process on port 5000
echo Cleaning up environment...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do taskkill /F /PID %%a 2>nul

echo Starting Centralized Server (Backend + Frontend)...
start /b node backend/server.js

echo Waiting for database synchronization...
timeout /t 3 /nobreak > nul

echo Launching Smart City Dashboard...
start http://localhost:5000

echo.
echo ===================================================
echo   SYSTEM ONLINE: http://localhost:5000
echo ===================================================
echo Keep this window open while using the application.
echo ===================================================
pause
