@echo off
REM Prod flow: Frontend local, backend on Cloud Run.
REM Requires: set CODESTORY_PROD_URL=https://your-service.run.app
setlocal
cd /d "%~dp0\.."

if "%CODESTORY_PROD_URL%"=="" (
  echo CODESTORY_PROD_URL is not set.
  echo Set it to your Cloud Run backend URL, e.g.:
  echo   set CODESTORY_PROD_URL=https://codestory-backend-XXXXX.run.app
  echo Then run: scripts\run-prod.bat
  exit /b 1
)

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
