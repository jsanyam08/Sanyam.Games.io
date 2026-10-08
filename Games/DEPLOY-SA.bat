@echo off
title Sarvodaya Ahinsa  --  publish the games site
cd /d "%~dp0"

echo.
echo  ============================================================
echo    SARVODAYA AHINSA  --  deploying the games platform
echo  ============================================================
echo.

if not exist "sarvodayahinsa\index.html" goto :missing
if not exist "firebase.json"             goto :missing

echo   Refreshing the two older games from their originals...
if not exist "sarvodayahinsa\kbs" mkdir "sarvodayahinsa\kbs"
copy /Y "MOBILE.html"     "sarvodayahinsa\kbs\index.html"  >nul
copy /Y "NEWKBSHOST.html" "sarvodayahinsa\kbs\host.html"   >nul
copy /Y "PROJECTOR.html"  "sarvodayahinsa\kbs\screen.html" >nul
copy /Y "Akshay nidhi by Shastri Sanyam Pujari.html" "sarvodayahinsa\akshaynidhi.html" >nul
echo     kbs\index.html   ^<- MOBILE.html
echo     kbs\host.html    ^<- NEWKBSHOST.html
echo     kbs\screen.html  ^<- PROJECTOR.html
echo     akshaynidhi.html ^<- Akshay nidhi...html
echo.

echo   Stamping asset versions (so browsers cannot serve stale files)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stamp.ps1"
echo.

echo   Deploying site + database rules...
echo.
call firebase.cmd deploy --only hosting:sa,database
if errorlevel 1 goto :failed

echo.
echo  ============================================================
echo    DEPLOY SUCCESSFUL
echo.
echo    HOME        https://sarvodayahinsa.web.app
echo    HOST        https://sarvodayahinsa.web.app/host
echo    STUDIO      https://sarvodayahinsa.web.app/studio
echo    PROJECTOR   opens from the host panel
echo    TICKETS     https://sarvodayahinsa.web.app/tickets
echo.
echo    Kaun Banega Siddhatma is untouched and still lives at
echo    https://kounbanegasiddhatma.web.app
echo.
echo    Hard-refresh open tabs with Ctrl+Shift+R
echo  ============================================================
echo.
pause
exit /b 0

:failed
echo.
echo  ############################################################
echo    DEPLOY FAILED  --  NOTHING WAS PUBLISHED
echo.
echo    Both sites are UNCHANGED. Read the error above.
echo.
echo    If it says the site "sarvodayahinsa" does not exist, run
echo    this once and then try again:
echo.
echo        firebase.cmd hosting:sites:create sarvodayahinsa
echo.
echo    If that name is taken, pick another, then change it in
echo    .firebaserc (the "sa" line) and run this again.
echo.
echo    Other things to try, in order:
echo      1. DEPLOY-SA.bat again        (most errors are temporary)
echo      2. firebase.cmd deploy --only hosting:sa   (skips the rules)
echo      3. firebase.cmd login --reauth             (if it mentions login)
echo      4. firebase.cmd deploy --only hosting:sa --debug
echo  ############################################################
echo.
pause
exit /b 1

:missing
echo.
echo   ERROR: a required file is missing from %CD%
echo   Expected firebase.json and the sarvodayahinsa folder.
echo.
pause
exit /b 1
