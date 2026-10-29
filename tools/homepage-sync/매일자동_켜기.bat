@echo off
chcp 65001 >nul
cd /d "%~dp0"
schtasks /Create /F /SC DAILY /ST 07:00 /TN "NakyungHomepageSync" /TR "\"%~dp0run_daily.bat\""
if errorlevel 1 (
  echo 등록하지 못했습니다. 이 파일을 마우스 오른쪽 클릭 - 관리자 권한으로 실행해 주세요.
) else (
  echo 매일 아침 7시에 제주올 매물 전체 점검을 자동으로 실행합니다. 노트북이 켜져 있어야 합니다.
)
pause
