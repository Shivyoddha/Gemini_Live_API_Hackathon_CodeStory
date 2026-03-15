@echo off
REM Dev flow: Dashboard only, no pipeline.
REM Uses workspace documentation/ and slides/. Backend and frontend run locally.
setlocal
cd /d "%~dp0\.."

if exist ".venv\Scripts\activate.bat" call .venv\Scripts\activate.bat

set GCS_BUCKET=
set GOOGLE_CLOUD_PROJECT=

echo === CodeStory Dev flow ===
echo   Backend:  local, content from documentation/ and slides/
echo   Frontend: local, starts at dashboard (skips pipeline)
echo.

echo Starting backend on http://localhost:8081 (WebSocket on 8080)...
start "CodeStory Backend" python app\server.py

timeout /t 2 /nobreak >nul

cd app
set VITE_DEV_SKIP_PIPELINE=true
set VITE_API_BASE=http://localhost:8081
echo Starting frontend at http://localhost:5173 ...
call npm run dev
