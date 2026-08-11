@echo off
cd /d "D:\desktop\coAgent-Learn"
echo ========================================
echo   CoAgent-Learn Backend Server (local)
echo   http://localhost:8000
echo ========================================
echo.
netstat -ano | findstr ":8000 " >nul
if %errorlevel%==0 (
  echo [WARN] Port 8000 is already in use (Docker backend?).
  echo        Please stop Docker backend first:  docker stop guashuai-backend
  echo        Or just use http://localhost:8000 if Docker is already running.
  pause
  exit /b 1
)
call .venv\Scripts\python run.py
pause
