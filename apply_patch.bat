@echo off
chcp 65001 >nul
title Perfect World Arena Korean Patch

cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('관리자 권한이 필요합니다.`napply_patch.bat을 우클릭한 뒤 ''관리자 권한으로 실행''을 선택해 주세요.', 'Perfect World Arena Korean Patch', 'OK', 'Warning')"
  color 0C
  echo.
  echo [error] 관리자 권한이 필요합니다.
  echo apply_patch.bat을 우클릭한 뒤 "관리자 권한으로 실행"을 선택해 주세요.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*完美世界竞技平台*' }; if ($p) { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Perfect World Arena가 실행 중입니다.`n패치 전 完美世界竞技平台을 완전히 종료해 주세요.', 'Perfect World Arena Korean Patch', 'OK', 'Warning') | Out-Null; exit 1 }"

if %errorlevel% neq 0 (
  color 0C
  echo.
  echo [error] Perfect World Arena가 실행 중입니다.
  echo 패치 전 完美世界竞技平台을 완전히 종료해 주세요.
  echo.
  pause
  exit /b 1
)

cls
if exist "%~dp0intro.txt" (
  type "%~dp0intro.txt"
) else (
  echo ============================================================
  echo   Perfect World Arena Korean Patch
  echo   완미세계 경기 플랫폼 한국어 패치
  echo ============================================================
)
echo(
powershell -NoProfile -Command "Write-Host 'Created by Midori, Team Ataks' -ForegroundColor Magenta"
echo(

pause >nul

cls
echo ============================================================
echo   PWA Korean Patch - Applying...
echo ============================================================
echo.
echo [info] Current folder: %cd%
echo.

set "NODE_EXE=%~dp0tools\node-v26.2.0-win-x64\node.exe"

if not exist "%NODE_EXE%" (
  color 0C
  echo [error] portable node.exe를 찾을 수 없습니다.
  echo 경로: %NODE_EXE%
  echo.
  pause
  exit /b 1
)

"%NODE_EXE%" "%~dp0patcher.js"

if %errorlevel% neq 0 (
  color 0C
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('패치 중 오류가 발생했습니다.`n콘솔 로그를 확인해 주세요.', 'Perfect World Arena Korean Patch', 'OK', 'Error')"
  echo.
  echo [error] 패치 중 오류가 발생했습니다.
  echo.
  pause
  exit /b 1
)

color 0A
echo.
echo ============================================================
echo   패치가 완료되었습니다!
echo ============================================================
echo.
echo [안내]
echo 1. 바탕화면의 pwa_korean_patch_work는 이제 지우셔도 됩니다.
echo 2. 패치된 app.asar는 설치 폴더에 백업된 app.asar_backup으로 복구할 수 있습니다.
echo 3. 즐거운 게임 되세요!
powershell -NoProfile -Command "Write-Host 'Created by Midori, Team Ataks' -ForegroundColor Magenta"
echo.
pause