@echo off
title Tier List Studio
cd /d "%~dp0"
set PYCMD=
where py >nul 2>nul && set PYCMD=py -3
if not defined PYCMD where python >nul 2>nul && set PYCMD=python
if not defined PYCMD (
    echo Tier List Studio needs Python 3 ^(free^).
    echo Download it from https://www.python.org/downloads/
    echo During install, tick "Add python.exe to PATH", then double-click this file again.
    echo.
    pause
    exit /b 1
)
echo Starting Tier List Studio... your browser will open in a moment.
echo Close this window to stop it.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:9100"
%PYCMD% server.py
pause
