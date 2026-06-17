@echo off
setlocal

if defined WT_SESSION goto main

where wt.exe >nul 2>&1
if %errorlevel%==0 (
  start "" wt.exe cmd /k "\"%~f0\""
  exit /b
)

:main
chcp 65001 >nul
title Perfect World Arena Korean Patch

cd /d "%~dp0"

echo Running...

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

powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; $targets = @(Get-Process | Where-Object { $_.MainWindowTitle -like '*完美世界竞技平台*' }); if ($targets.Count -gt 0) { $msg = 'Perfect World Arena가 실행 중입니다.' + [Environment]::NewLine + [Environment]::NewLine + '패치를 진행하려면 완미를 종료해야 합니다.' + [Environment]::NewLine + '지금 완미를 종료하고 패치를 계속할까요?'; $answer = [System.Windows.MessageBox]::Show($msg, 'Perfect World Arena Korean Patch', 'YesNo', 'Question'); if ($answer -ne 'Yes') { Write-Host '[info] User cancelled.'; exit 1 }; Write-Host '[info] Perfect World Arena process detected. Trying to close...'; $targets | ForEach-Object { Write-Host ('[info] PID=' + $_.Id + ' NAME=' + $_.ProcessName + ' TITLE=' + $_.MainWindowTitle); if ($_.MainWindowHandle -ne 0) { $null = $_.CloseMainWindow() } }; Start-Sleep -Seconds 3; $alive = @(); foreach ($p in $targets) { try { $alive += Get-Process -Id $p.Id -ErrorAction Stop } catch {} }; if ($alive.Count -gt 0) { Write-Host '[info] Force closing remaining Perfect World Arena process...'; $alive | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 }; $alive2 = @(); foreach ($p in $targets) { try { $alive2 += Get-Process -Id $p.Id -ErrorAction Stop } catch {} }; if ($alive2.Count -gt 0) { [System.Windows.MessageBox]::Show('Perfect World Arena 프로세스를 종료하지 못했습니다.' + [Environment]::NewLine + '작업 관리자에서 完美世界竞技平台을 종료한 뒤 다시 실행해 주세요.', 'Perfect World Arena Korean Patch', 'OK', 'Warning') | Out-Null; exit 2 } else { Write-Host '[info] Perfect World Arena process closed.' } }"

if %errorlevel% neq 0 (
  color 0C
  echo.
  echo [error] Perfect World Arena 종료가 취소되었거나 실패했습니다.
  echo 완미를 종료한 뒤 다시 실행해 주세요.
  echo.
  pause
  exit /b 1
)

cls
set "PATCH_DIR=%~dp0"

if not exist "%~dp0pwa_intro.txt" goto INTRO_FALLBACK

powershell -NoProfile -ExecutionPolicy Bypass -Command "$patchDir=$env:PATCH_DIR; $introPath=Join-Path $patchDir 'pwa_intro.txt'; $pathFile=Join-Path $patchDir 'pwa_path.txt'; $pwaPath='(pwa_path.txt에 설치 경로를 입력해 주세요)'; if (Test-Path $pathFile) { $line=Get-Content -Encoding UTF8 $pathFile | Where-Object { $v=$_.Trim(); $v -and -not $v.StartsWith('#') } | Select-Object -First 1; if ($line) { $pwaPath=$line.Trim(); if (($pwaPath.StartsWith([char]34) -and $pwaPath.EndsWith([char]34)) -or ($pwaPath.StartsWith([char]39) -and $pwaPath.EndsWith([char]39))) { $pwaPath=$pwaPath.Substring(1,$pwaPath.Length-2) } } }; if (Test-Path $introPath) { $intro=Get-Content -Raw -Encoding UTF8 $introPath; Write-Host ($intro.Replace('{{PWA_PATH}}',$pwaPath)) } else { Write-Host 'pwa_intro.txt를 찾을 수 없습니다.' }"

goto INTRO_DONE

:INTRO_FALLBACK
echo ============================================================
echo   Perfect World Arena Korean Patch
echo   완미세계 경기 플랫폼 한국어 패치
echo ============================================================

:INTRO_DONE
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