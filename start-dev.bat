@echo off
echo Starting Hit-the-Lights development servers...
start "Angular - ng serve" cmd /k "ng serve"
start "Backend - server.ts" cmd /k "cd src/backend/database && npx tsx server.ts"
echo.
echo Both servers are starting in separate windows.
echo   - Frontend:   http://localhost:4200
echo   - Backend:    http://localhost:3000
echo.
pause
