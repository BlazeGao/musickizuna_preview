@echo off
echo Starting MusicKizuna dev server...
cd /d "%~dp0"
node node_modules\vite\bin\vite.js --host
