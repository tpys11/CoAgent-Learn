@echo off
cd /d "D:\desktop\guashuai-project\frontend"
echo ========================================
echo   CoAgent-Learn Frontend Server
echo   http://localhost:5173
echo ========================================
echo.

echo 启动前端服务...
start "CoAgent-Learn Frontend" cmd /c "cd /d D:\desktop\guashuai-project\frontend && npm run dev"

echo 等待服务就绪...
timeout /t 4 /nobreak >nul

echo 打开浏览器...
start http://localhost:5173

pause
