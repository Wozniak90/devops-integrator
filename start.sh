#!/bin/bash

# Přepni do složky kde leží tento skript (funguje odkudkoliv)
cd "$(dirname "$0")"

echo ""
echo " ╔══════════════════════════════════════════╗"
echo " ║       DevOps Integrator — spouštěč      ║"
echo " ╚══════════════════════════════════════════╝"
echo ""

# Kontrola Node.js
if ! command -v node &> /dev/null; then
    echo " ❌ Node.js NENÍ nainstalován!"
    echo ""
    echo " Nainstaluj Node.js jedním z těchto způsobů:"
    echo ""
    echo " macOS (Homebrew):  brew install node"
    echo " Ubuntu/Debian:     sudo apt install nodejs npm"
    echo " Nebo stáhni z:     https://nodejs.org/en/download/"
    echo ""
    # Pokus o otevření stránky v prohlížeči
    if command -v open &> /dev/null; then
        open "https://nodejs.org/en/download/"
    elif command -v xdg-open &> /dev/null; then
        xdg-open "https://nodejs.org/en/download/"
    fi
    exit 1
fi

NODE_VER=$(node --version)
echo " ✅ Node.js $NODE_VER nalezen"

# Instalace / ověření závislostí (vždy, rychlé když už jsou)
echo " 📦 Kontroluji závislosti..."
npm install --silent
if [ $? -ne 0 ]; then
    echo " ❌ npm install selhal."
    exit 1
fi
echo " ✅ Závislosti OK"

echo ""
echo " 🚀 Spouštím server na http://localhost:4242"
echo " Pro ukončení stiskni Ctrl+C"
echo ""

# Otevřít prohlížeč
(sleep 2 && (open "http://localhost:4242" 2>/dev/null || xdg-open "http://localhost:4242" 2>/dev/null)) &

node server.js
