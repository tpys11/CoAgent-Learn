@echo off
cd /d "D:\desktop\coAgent-Learn\frontend"
echo ========================================
echo   CoAgent-Learn Frontend Server
echo   http://localhost:5173
echo ========================================
echo.
echo Starting frontend service...
start "CoAgent-Learn Frontend" cmd /c "cd /d D:\desktop\coAgent-Learn\frontend && npm run dev"
echo Waiting for service ready...
timeout /t 4 /nobreak >nul
echo Opening browser...
start http://localhost:5173
pause
