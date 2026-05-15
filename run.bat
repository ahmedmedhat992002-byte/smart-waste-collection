@echo off
title SmartWaste - Smart City Platform
setlocal EnableDelayedExpansion
color 0A
cls

echo.
echo ============================================================
echo   SmartWaste Smart City Platform - Local Server Launcher
echo ============================================================
echo.

:: =========================
:: 1. Check Node.js
:: =========================
node -v >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Node.js is NOT installed or not in PATH
    echo Please install it from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected
echo.

:: =========================
:: 2. Kill port 5000
:: =========================
echo [1/4] Checking port 5000...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    echo Killing process on PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 >nul

:: =========================
:: 3. Install dependencies
:: =========================
echo [2/4] Checking dependencies...

if not exist node_modules (
    echo Installing npm packages...
    call npm install
    if errorlevel 1 (
        color 0C
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
) else (
    echo Dependencies already installed
)

echo.

:: =========================
:: 4. Start backend server
:: =========================
echo [3/4] Starting backend server...

if not exist backend\server.js (
    color 0C
    echo [ERROR] backend/server.js not found
    pause
    exit /b 1
)

start "SmartWaste Backend" cmd /k "color 0A && node backend/server.js"

timeout /t 4 >nul

:: =========================
:: 5. Open browser
:: =========================
echo [4/4] Opening browser...

start http://localhost:5000/frontend/index.html

echo.
echo ============================================================
echo   SmartWaste is running at:
echo   http://localhost:5000
echo ============================================================
echo.

echo QUICK LINKS:
echo - Home:     http://localhost:5000/frontend/index.html
echo - Dashboard http://localhost:5000/dashboard.html
echo - Login:    http://localhost:5000/frontend/login.html
echo - Driver:   http://localhost:5000/frontend/driver.html
echo.

echo DEMO ACCOUNTS:
echo Admin   : admin@smartwaste.ai
echo Driver  : driver1@fleet.com
echo Citizen : sarah@me.com
echo Password: password
echo.

echo Press CTRL + C in backend window to stop server.
pause >nul