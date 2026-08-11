@echo off
cd /d "D:\desktop\coAgent-Learn\frontend"
echo ========================================
echo   CoAgent-Learn Frontend Server (local)
echo   http://localhost:5173
echo ========================================
echo.
netstat -ano | findstr ":5173 " >nul
if %errorlevel%==0 (
  echo [WARN] Port 5173 is already in use (Docker frontend?).
  echo        Please stop Docker frontend first:  docker stop guashuai-frontend
  echo        Or just use http://localhost:5173 if Docker is already running.
  pause
  exit /b 1
)
start "CoAgent-Learn Frontend" cmd /c "cd /d D:\desktop\coAgent-Learn\frontend && npm run dev"
echo Waiting for service ready...
timeout /t 4 /nobreak >nul
echo Opening browser...
start http://localhost:5173
pause
