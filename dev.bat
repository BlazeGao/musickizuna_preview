@echo off
echo Starting MusicKizuna dev server...
cd /d "%TEMP%\opencode\pkg_tmp"
node node_modules\vite\bin\vite.js --host
