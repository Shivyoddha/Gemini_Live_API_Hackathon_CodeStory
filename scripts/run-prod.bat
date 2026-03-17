@echo off
REM Prod flow: Frontend local, backend on Cloud Run.
REM Requires: set CODESTORY_PROD_URL=https://your-service.run.app
setlocal
cd /d "%~dp0\.."

REM Default to team's deployed Cloud Run URL (for judges / zero-config demo)
if "%CODESTORY_PROD_URL%"=="" set "CODESTORY_PROD_URL=https://codestory-backend-953856802382.us-central1.run.app"

REM Remove trailing slash if present
if "%CODESTORY_PROD_URL:~-1%"=="/" set "CODESTORY_PROD_URL=%CODESTORY_PROD_URL:~0,-1%"

echo === CodeStory Prod flow ===
echo   Backend:  Cloud Run at %CODESTORY_PROD_URL%
echo   Frontend: local, will use the above URL for API and WebSocket
echo.

cd app
set VITE_API_BASE=%CODESTORY_PROD_URL%
set VITE_DEV_SKIP_PIPELINE=false
echo Starting frontend at http://localhost:5173 (API: %CODESTORY_PROD_URL%) ...
call npm run dev