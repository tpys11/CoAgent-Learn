@echo off
chcp 65001 >nul
echo ========================================
echo   CoAgent-Learn
echo   http://localhost:5173
echo ========================================
echo.
echo Starting Docker services...
docker compose -f "D:\desktop\coAgent-Learn\deploy\docker-compose.yml" up -d
echo.
echo Waiting for services...
timeout /t 5 /nobreak >nul
echo.
echo Opening browser...
start "" http://localhost:5173
echo.
echo Done! Browser opened.
echo To stop: docker compose -f "D:\desktop\coAgent-Learn\deploy\docker-compose.yml" down
pause
