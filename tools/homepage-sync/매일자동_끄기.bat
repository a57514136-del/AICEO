@echo off
chcp 65001 >nul
schtasks /Delete /F /TN "NakyungHomepageSync"
echo 매일 자동 실행을 껐습니다.
pause
