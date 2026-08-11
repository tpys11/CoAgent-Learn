@echo off
echo ========================================
echo   CoAgent-Learn
echo   http://127.0.0.1:5173
echo ========================================
echo.
echo Starting Docker services...
docker compose -f "D:\desktop\coAgent-Learn\deploy\docker-compose.yml" up -d
echo.
echo Opening browser...
start "" http://127.0.0.1:5173
echo.
echo Done!
echo To stop: docker compose -f "D:\desktop\coAgent-Learn\deploy\docker-compose.yml" down
pause
