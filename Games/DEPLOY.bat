@echo off
title KBS Deploy  --  publish all three portals
cd /d "%~dp0"

echo.
echo  ============================================================
echo    KAUN BANEGA SIDDHATMA  --  deploying
echo  ============================================================
echo.

if not exist "MOBILE.html"     goto :missing
if not exist "NEWKBSHOST.html" goto :missing
if not exist "PROJECTOR.html"  goto :missing
if not exist "public" mkdir public

echo   Staging files...
copy /Y "MOBILE.html"     "public\index.html"  >nul
copy /Y "NEWKBSHOST.html" "public\host.html"   >nul
copy /Y "PROJECTOR.html"  "public\screen.html" >nul
echo     index.html   ^<- MOBILE.html      (audience)
echo     host.html    ^<- NEWKBSHOST.html  (controller, login required)
echo     screen.html  ^<- PROJECTOR.html   (main screen, read only)
echo.

echo   Deploying to Firebase...
echo.
REM hosting:kbs, not hosting -- there are two sites in this project now, and
REM plain "hosting" would try to publish the games platform from here too.
call firebase.cmd deploy --only hosting:kbs,database
if errorlevel 1 goto :failed

echo.
echo  ============================================================
echo    DEPLOY SUCCESSFUL
echo.
echo    AUDIENCE    https://kounbanegasiddhatma.web.app
echo    HOST        https://kounbanegasiddhatma.web.app/host.html
echo    PROJECTOR   https://kounbanegasiddhatma.web.app/screen.html
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
echo    The live site is UNCHANGED. Read the error above.
echo.
echo    Try, in this order:
echo      1. Run DEPLOY.bat again  (most errors here are temporary)
echo      2. firebase.cmd deploy --only hosting:kbs (skips the rules)
echo      3. firebase.cmd login --reauth            (if it mentions login)
echo      4. firebase.cmd deploy --only hosting --debug   (send Claude the output)
echo  ############################################################
echo.
pause
exit /b 1

:missing
echo.
echo   ERROR: a source file is missing from %CD%
echo   Expected MOBILE.html, NEWKBSHOST.html and PROJECTOR.html
echo.
pause
exit /b 1
