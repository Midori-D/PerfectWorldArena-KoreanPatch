@echo off
chcp 65001 >nul
setlocal

title Perfect World Arena Korean Patch - Restore Backup
color 0E

cd /d "%~dp0"
set "PATCH_DIR=%~dp0"
set "PATH_FILE=%PATCH_DIR%pwa_path.txt"
set "PS1_FILE=%TEMP%\pwa_restore_backup.ps1"

net session >nul 2>&1
if %errorlevel% neq 0 (
  color 0C
  echo.
  echo [error] 관리자 권한이 필요합니다.
  echo restore_patch.bat을 우클릭한 뒤 "관리자 권한으로 실행"을 선택해 주세요.
  echo.
  pause
  exit /b 1
)

cls
echo ============================================================
echo   Perfect World Arena Korean Patch - Restore Backup
echo   완미세계 한국어 패치 복구 도구
echo ============================================================
echo.
echo 반갑습니다!
echo 이 도구는 Perfect World Arena 설치 폴더의 resources\app.asar.backup 파일로
echo app.asar를 복구합니다.
echo.
echo [주의사항]
echo  1. Perfect World Arena를 완전히 종료해 주세요.
echo  2. 복구 대상 백업 파일은 app.asar.backup 입니다.
echo  3. 복구가 완료되면 app.asar.backup과 임시 백업 파일을 삭제합니다.
echo.
echo 시작하려면 아무 키나 눌러주세요.
pause >nul

echo.
echo [info] Perfect World Arena 프로세스를 종료합니다...
taskkill /F /IM PerfectWorldArena.exe /T >nul 2>&1
taskkill /F /IM perfectworldarena.exe /T >nul 2>&1
taskkill /F /IM pwa.exe /T >nul 2>&1
taskkill /F /IM PWA.exe /T >nul 2>&1

echo.
echo [info] 복구 스크립트를 준비합니다...

> "%PS1_FILE%" echo $ErrorActionPreference = 'Stop'
>> "%PS1_FILE%" echo $patchDir = $env:PATCH_DIR
>> "%PS1_FILE%" echo $pathFile = Join-Path $patchDir 'pwa_path.txt'
>> "%PS1_FILE%" echo $installDir = 'C:\Program Files (x86)\perfectworldarena'
>> "%PS1_FILE%" echo if (Test-Path $pathFile) {
>> "%PS1_FILE%" echo   $line = Get-Content -Encoding UTF8 $pathFile ^| Where-Object { $v=$_.Trim(); $v -and -not $v.StartsWith('#') } ^| Select-Object -First 1
>> "%PS1_FILE%" echo   if ($line) {
>> "%PS1_FILE%" echo     $installDir = $line.Trim()
>> "%PS1_FILE%" echo     if (($installDir.StartsWith([char]34) -and $installDir.EndsWith([char]34)) -or ($installDir.StartsWith([char]39) -and $installDir.EndsWith([char]39))) { $installDir = $installDir.Substring(1, $installDir.Length - 2) }
>> "%PS1_FILE%" echo   }
>> "%PS1_FILE%" echo }
>> "%PS1_FILE%" echo $res = Join-Path $installDir 'resources'
>> "%PS1_FILE%" echo $app = Join-Path $res 'app.asar'
>> "%PS1_FILE%" echo $backup = Join-Path $res 'app.asar.backup'
>> "%PS1_FILE%" echo Write-Host "[info] 설치 폴더: $installDir" -ForegroundColor Cyan
>> "%PS1_FILE%" echo Write-Host "[info] resources: $res" -ForegroundColor Cyan
>> "%PS1_FILE%" echo if (!(Test-Path $res)) { throw "resources 폴더를 찾을 수 없습니다: $res" }
>> "%PS1_FILE%" echo if (!(Test-Path $backup)) { throw "복구 가능한 백업 파일을 찾지 못했습니다: $backup" }
>> "%PS1_FILE%" echo $backupItem = Get-Item $backup
>> "%PS1_FILE%" echo if ($backupItem.Length -le 102400) { throw "백업 파일 용량이 비정상적으로 작습니다: $backup" }
>> "%PS1_FILE%" echo Write-Host "[info] 선택된 백업 파일: $backup" -ForegroundColor Yellow
>> "%PS1_FILE%" echo Write-Host "[info] 백업 파일 크기: $($backupItem.Length) bytes"
>> "%PS1_FILE%" echo $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
>> "%PS1_FILE%" echo $before = $null
>> "%PS1_FILE%" echo if (Test-Path $app) { $before = Join-Path $res "app.asar.before_restore_$stamp"; Copy-Item $app $before -Force; Write-Host "[backup] 현재 app.asar 임시 백업: $before" -ForegroundColor Cyan }
>> "%PS1_FILE%" echo Copy-Item $backup $app -Force
>> "%PS1_FILE%" echo $restored = Get-Item $app
>> "%PS1_FILE%" echo if ($restored.Length -le 102400) { throw "복구 후 app.asar 용량이 비정상적으로 작습니다." }
>> "%PS1_FILE%" echo Write-Host "[success] 복구 완료: $app" -ForegroundColor Green
>> "%PS1_FILE%" echo Write-Host "[info] 복구된 app.asar 크기: $($restored.Length) bytes"
>> "%PS1_FILE%" echo $targets = Get-ChildItem $res -File ^| Where-Object { $_.Name -eq 'app.asar.backup' -or $_.Name -like 'app.asar.before_restore_*' }
>> "%PS1_FILE%" echo foreach ($f in $targets) {
>> "%PS1_FILE%" echo   Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue
>> "%PS1_FILE%" echo   Write-Host "[cleanup] 삭제: $($f.FullName)" -ForegroundColor DarkGray
>> "%PS1_FILE%" echo }

echo.
echo [info] 복구를 시작합니다...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_FILE%"

if %errorlevel% neq 0 (
  color 0C
  echo.
  echo [error] 복구에 실패했습니다.
  echo 위 오류 내용을 확인해 주세요.
  echo.
  pause
  exit /b 1
)

color 0A
echo.
echo ============================================================
echo   복구가 완료되었습니다!
echo ============================================================
echo.
echo Perfect World Arena를 다시 실행해 확인해 주세요.
echo.
pause
exit /b 0
