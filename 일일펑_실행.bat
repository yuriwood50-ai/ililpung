@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PY_CMD="
where py >nul 2>nul
if not errorlevel 1 set "PY_CMD=py"
if not defined PY_CMD (
  where python >nul 2>nul
  if not errorlevel 1 set "PY_CMD=python"
)
if not defined PY_CMD (
  echo Python 실행기를 찾지 못했습니다.
  echo VS Code Live Server로 index.html을 열거나 Python을 설치해 주세요.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"
echo.
echo 일일펑 웹앱 실행 중: http://localhost:8000
echo 종료하려면 Ctrl+C를 누르세요.
echo.
%PY_CMD% -m http.server 8000
pause
