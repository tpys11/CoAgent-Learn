@echo off
cd /d "D:\desktop\coAgent-Learn\deploy"
echo ========================================
echo   CoAgent-Learn (Docker mode)
echo   Frontend: http://localhost:5173
echo   Backend : http://localhost:8000
echo ========================================
echo.
echo Starting services via Docker...
docker compose up -d --build
echo.
echo Waiting for services ready...
timeout /t 8 /nobreak >nul
echo Opening browser...
start http://localhost:5173
pause
