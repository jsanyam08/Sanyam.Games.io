@echo off
title Sarvodaya Ahinsa  --  rehearsal (no internet needed)
cd /d "%~dp0"

echo.
echo  ============================================================
echo    REHEARSAL MODE
echo.
echo    Everything is saved on THIS computer only.
echo    Nothing goes online. No login. No audience.
echo    Use it to practise the whole show before the real day.
echo  ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 goto :nopython

echo   Starting the local server on port 5180...
start "SA rehearsal server" /min python -m http.server 5180 --directory sarvodayahinsa
timeout /t 2 /nobreak >nul

echo   Opening the studio...
start "" "http://localhost:5180/studio.html?demo=1"

echo.
echo  ------------------------------------------------------------
echo    Open these in separate windows, all with  ?demo=1
echo.
echo    STUDIO      http://localhost:5180/studio.html?demo=1
echo    HOST        http://localhost:5180/host.html?demo=1
echo    PROJECTOR   open it from the host panel
echo    PHONE       open it from the host panel ^(or the QR^)
echo.
echo    They talk to each other across windows, exactly like the
echo    real show does. Close this window to stop the server.
echo  ------------------------------------------------------------
echo.
pause
exit /b 0

:nopython
echo   Python is not installed, so the rehearsal server cannot start.
echo.
echo   Either install Python from https://python.org
echo   or just rehearse on the live site instead:
echo       https://sarvodayahinsa.web.app/studio?demo=1
echo.
pause
exit /b 1
