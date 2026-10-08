@echo off
title KBS Local Server  --  KEEP THIS WINDOW OPEN DURING THE SHOW
cd /d "%~dp0"

echo.
echo  ============================================================
echo    KAUN BANEGA SIDDHATMA  --  starting local server
echo  ============================================================
echo.

if not exist "NEWKBSHOST.html" (
  echo   ERROR: NEWKBSHOST.html was not found in this folder:
  echo   %CD%
  echo.
  echo   Move START-SHOW.bat into D:\Games and run it again.
  echo.
  pause
  exit /b 1
)

echo   Folder: %CD%
echo   Port  : 8765
echo.
echo   Two browser tabs will open in a few seconds:
echo.
echo     HOST CONTROLLER  ..  your control desk
echo     PROJECTOR        ..  drag to the projector, press F11
echo.
echo   AUDIENCE PHONES  ..  https://kounbanegasiddhatma.web.app
echo.
echo   ---^> DO NOT CLOSE THIS WINDOW. Closing it kills both screens.
echo   ---^> To stop after the show: press Ctrl+C, then Y
echo.
echo  ============================================================
echo.

start "" cmd /c "timeout /t 5 >nul && start http://localhost:8765/NEWKBSHOST.html && timeout /t 2 >nul && start http://localhost:8765/PROJECTOR.html"

call npx --yes http-server . -p 8765 -c-1

echo.
echo  ------------------------------------------------------------
echo   The server stopped.
echo   If it closed immediately, the port may be in use or npx
echo   could not download http-server. Read any message above.
echo  ------------------------------------------------------------
pause
