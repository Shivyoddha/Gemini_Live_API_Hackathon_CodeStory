@echo off
REM Debug flow: Full pipeline locally, no GCP.
REM Backend runs pipeline; content in %%TEMP%%\sessions\session_id
setlocal
cd /d "%~dp0\.."

if exist ".venv\Scripts\activate.bat" call .venv\Scripts\activate.bat

set GCS_BUCKET=
set GOOGLE_CLOUD_PROJECT=

echo === CodeStory Debug flow ===
echo   Backend:  local, full pipeline, no GCP
echo   Frontend: local, GitHub URL -^> run pipeline -^> dashboard
echo.

echo Starting backend on http://localhost:8081 (WebSocket on 8080)...
start "CodeStory Backend" python app\server.py

timeout /t 2 /nobreak >nul

cd app
set VITE_DEV_SKIP_PIPELINE=false
set VITE_API_BASE=http://localhost:8081
echo Starting frontend at http://localhost:5173 ...
call npm run dev
