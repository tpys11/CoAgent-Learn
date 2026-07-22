@echo off
echo ========================================
echo   CoAgent-Learn 一键启动
echo ========================================
echo.
echo [1/2] 启动后端 (Docker)...
docker compose -f "D:\desktop\coAgent-Learn\deploy\docker-compose.yml" up -d
echo.
echo [2/2] 等待服务就绪... 打开浏览器...
timeout /t 4 /nobreak >nul
start http://localhost:5173
echo.
echo 服务已启动！浏览器已打开。
pause
