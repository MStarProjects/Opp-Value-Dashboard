@echo off
setlocal

cd /d "%~dp0"
set "NEXT_TELEMETRY_DISABLED=1"

start "Opp Value Dashboard Server" cmd /c "cd /d ""%~dp0"" && call ""C:\Program Files\nodejs\npm.cmd"" run dev"

timeout /t 8 /nobreak >nul
start "" "http://127.0.0.1:3000"

endlocal
