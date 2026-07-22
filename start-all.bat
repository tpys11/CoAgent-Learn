@echo off
echo ========================================
echo   CoAgent-Learn 一键启动
echo   后端 http://localhost:8000
echo   前端 http://localhost:5173
echo ========================================
echo.

echo [1/2] 启动后端...
start "CoAgent-Learn Backend" cmd /c "cd /d D:\desktop\guashuai-project && .venv\Scripts\python run.py"

echo [2/2] 启动前端...
start "CoAgent-Learn Frontend" cmd /c "cd /d D:\desktop\guashuai-project\frontend && npm run dev"

echo 等待服务就绪...
timeout /t 5 /nobreak >nul

echo 打开浏览器...
start http://localhost:5173

echo.
echo 服务已启动，浏览器已打开。
pause
