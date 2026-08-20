@echo off
cd /d "%~dp0"
title Yahro development services
npm.cmd run dev:all
if errorlevel 1 (
  echo.
  echo Yahro could not start. Review the error above.
  pause
)
