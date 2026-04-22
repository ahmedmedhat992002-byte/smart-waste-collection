@echo off
title SmartWaste — Launch Server
setlocal EnableDelayedExpansion
color 0A
cls

echo.
echo  ============================================================
echo    SmartWaste Smart City Platform — Local Development Server
echo  ============================================================
echo.

:: Check Node is installed
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Kill existing process on port 5000
echo  [1/3] Cleaning up port 5000...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Install dependencies if node_modules is missing
if not exist "node_modules\" (
    echo  [2/3] Installing dependencies (first run)...
    call npm install
    echo.
) else (
    echo  [2/3] Dependencies found. Skipping install.
)

:: Start backend server
echo  [3/3] Starting SmartWaste backend server...
start "SmartWaste Backend" cmd /k "color 0A && echo SmartWaste Backend Server && echo ============================== && node backend/server.js"
timeout /t 3 /nobreak >nul

echo.
echo  ============================================================
echo   Server running at http://localhost:5000
echo  ============================================================
echo.
echo  Opening SmartWaste in your browser...
echo.

start http://localhost:5000/frontend/index.html

echo  ─────────────────────────────────────────────────────────────
echo.
echo   QUICK LINKS:
echo   Landing Page:  http://localhost:5000/frontend/index.html
echo   Dashboard:     http://localhost:5000/dashboard.html
echo   Login:         http://localhost:5000/frontend/login.html
echo   Driver Portal: http://localhost:5000/frontend/driver.html
echo.
echo   DEMO CREDENTIALS (password: "password" for all)
echo   Admin:   admin@smartwaste.ai
echo   Driver:  driver1@fleet.com
echo   Citizen: sarah@me.com
echo.
echo   Press Ctrl+C in the backend window to stop the server.
echo  ─────────────────────────────────────────────────────────────
echo.
pause >nul
