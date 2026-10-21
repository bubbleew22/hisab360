@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Hisab360 v7.2.1 - Build Signed APK
cls
echo ============================================================
echo          HISAB360 v7.2.1 - SIGNED APK BUILDER
echo ============================================================
echo   Auto-detects/checks Java 21, Android SDK, Node and npm.
echo   Creates a NEW permanent signing key only when needed.
echo   Reuses the SAME verified key for future app updates.
echo   APK + full log are saved in OUTPUT.
echo ============================================================
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0_BUILD_SIGNED.ps1"
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo [OK] Hisab360 signed APK is ready in OUTPUT.
) else (
  echo [FAILED] Check OUTPUT\BUILD_LOG_SIGNED.txt
)
echo.
pause
exit /b %RC%
