#!/bin/bash
echo "===================================="
echo " AI Trading Bot - Mac/Linux Setup"
echo "===================================="
echo

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python3 not found! Install Python 3.9+"
    exit 1
fi
echo "[OK] Python found: $(python3 --version)"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found! Install Node.js 18+"
    exit 1
fi
echo "[OK] Node.js found: $(node --version)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Install backend dependencies
echo
echo "Installing backend dependencies..."
cd "$PROJECT_DIR/../backend"
pip3 install -r requirements.txt
echo "[OK] Backend dependencies installed"

# Build frontend
echo
echo "Building frontend..."
cd "$PROJECT_DIR/../frontend"
npm install
npm run build
echo "[OK] Frontend built"

# Install desktop dependencies
echo
echo "Installing desktop app dependencies..."
cd "$PROJECT_DIR"
npm install
echo "[OK] Desktop dependencies installed"

echo
echo "===================================="
echo " Setup Complete!"
echo "===================================="
echo
echo "To run in development: npm start"
echo "To build Mac DMG: npm run build:mac"
echo "To build Windows: npm run build:win"
