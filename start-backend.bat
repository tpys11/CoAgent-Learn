@echo off
cd /d "D:\desktop\coAgent-Learn"
echo ========================================
echo   CoAgent-Learn Backend Server
echo   http://localhost:8000
echo ========================================
echo.
call .venv\Scripts\python run.py
pause
