@echo off
REM Stamps every asset link in the site with a fresh version number, so a
REM browser can never serve a stale script or stylesheet after a deploy.
REM DEPLOY-SA.bat runs this automatically; you never need to run it yourself.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stamp.ps1"
