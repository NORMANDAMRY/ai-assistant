@echo off
echo Starting AI Assistant services...
echo.
echo Starting Ollama...
start /B "" "C:\Users\User\AppData\Local\Programs\Ollama\ollama.exe" serve
timeout /t 3 /nobreak >nul

echo Starting Backend...
start /B python "C:\Users\User\ai-assistant\backend\main.py"
timeout /t 3 /nobreak >nul

echo Starting Frontend...
cd "C:\Users\User\ai-assistant\frontend"
start /B npm run dev -- --host --port 5173

echo.
echo Services started!
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo.
pause