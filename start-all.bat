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
echo [TIP] If browser cannot open, your proxy (VPN) is blocking 127.0.0.1.
echo       Add 127.0.0.1 / localhost to proxy bypass list, then open http://127.0.0.1:5173 manually.
echo.
echo Done!
echo To stop: docker compose -f "D:\desktop\coAgent-Learn\deploy\docker-compose.yml" down
pause
