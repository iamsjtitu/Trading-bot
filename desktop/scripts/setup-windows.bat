@echo off
echo ====================================
echo  AI Trading Bot - Windows Setup
echo ====================================
echo.

REM Check Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found! Install Python 3.9+ from python.org
    pause
    exit /b 1
)
echo [OK] Python found

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found! Install Node.js 18+ from nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js found

REM Install backend dependencies
echo.
echo Installing backend dependencies...
cd /d "%~dp0..\backend"
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed

REM Build frontend
echo.
echo Building frontend...
cd /d "%~dp0..\frontend"
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build frontend
    pause
    exit /b 1
)
echo [OK] Frontend built

REM Install desktop dependencies
echo.
echo Installing desktop app dependencies...
cd /d "%~dp0"
call npm install
echo [OK] Desktop dependencies installed

echo.
echo ====================================
echo  Setup Complete!
echo ====================================
echo.
echo To run in development: npm start
echo To build Windows installer: npm run build:win
echo.
pause
