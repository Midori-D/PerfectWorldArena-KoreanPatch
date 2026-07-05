@echo off
chcp 65001 >nul
setlocal

title Perfect World Arena Korean Patch - Debug Mode

cls
echo ============================================================
echo   Perfect World Arena Korean Patch - Debug Mode
echo   완미세계 경기 플랫폼 한국어 패치 - 디버그 모드
echo ============================================================
echo.
echo 이 모드는 패치를 실행한 뒤,
echo 번역 매핑이 정상 적용되었는지 logs 폴더에 기록합니다.
echo.
echo 생성 예시:
echo   logs\mapping_check_20260611_153000.log
echo   logs\static_mapping_check_20260611_153000.log
echo.
echo 상태 설명:
echo   [OK]       이번 실행에서 적용됨 또는 한국어 결과가 있음
echo   [ALREADY]  이미 한국어가 있음
echo   [MISS]     중국어는 있는데 한국어가 없음
echo   [CHANGED?] 원문/구조가 업데이트로 바뀌었을 가능성
echo.
pause

set "PATCH_DIR=%~dp0"
set "INTERNAL_DIR=%PATCH_DIR%_internal"

set "PATCHER=%INTERNAL_DIR%\patcher_debug.js"
set "DEBUG_TOOLS=%INTERNAL_DIR%\patcher_debug.js"
set "LOCAL_NODE=%PATCH_DIR%tools\node-v26.2.0-win-x64\node.exe"

echo.
echo [info] 패치 폴더:
echo %PATCH_DIR%
echo.

if not exist "%PATCHER%" (
  color 0C
  echo [error] patcher.js를 찾을 수 없습니다.
  echo 위치: %PATCHER%
  echo.
  pause
  exit /b 1
)

if not exist "%DEBUG_TOOLS%" (
  color 0C
  echo [error] debug_tools.js를 찾을 수 없습니다.
  echo 위치: %DEBUG_TOOLS%
  echo.
  echo debug_tools.js를 patcher.js와 같은 폴더에 넣어 주세요.
  echo.
  pause
  exit /b 1
)

if exist "%LOCAL_NODE%" (
  set "NODE_CMD=%LOCAL_NODE%"
) else (
  set "NODE_CMD=node"
)

echo [info] Node 실행 파일:
echo %NODE_CMD%
echo.

echo [info] 디버그 모드로 패치를 실행합니다...
echo.

"%NODE_CMD%" "%PATCHER%" --debug

set "RESULT=%errorlevel%"

echo.
if not "%RESULT%"=="0" (
  color 0C
  echo ============================================================
  echo   디버그 패치 실행 중 오류가 발생했습니다.
  echo ============================================================
  echo.
  echo errorlevel: %RESULT%
  echo.
  pause
  exit /b %RESULT%
)

color 0A
echo ============================================================
echo   디버그 패치가 완료되었습니다.
echo ============================================================
echo.
echo logs 폴더에서 아래 파일을 확인해 주세요.
echo.
echo   mapping_check_날짜.log
echo   static_mapping_check_날짜.log
echo.

if exist "%PATCH_DIR%logs" (
  explorer "%PATCH_DIR%logs"
)

pause
exit /b 0