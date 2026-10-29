@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 나경 홈페이지 연동
set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if not defined PY (
  echo 파이썬을 찾을 수 없습니다. 오일장 비서를 실행하는 것과 같은 방법으로 실행해 주세요.
  pause
  exit /b 1
)
%PY% -c "import streamlit, PIL" 2>nul || (
  echo 처음 한 번 필요한 프로그램을 설치합니다...
  %PY% -m pip install --quiet streamlit pillow
)
echo 나경 홈페이지 연동을 엽니다. 이 검은 창을 닫으면 프로그램이 꺼집니다.
start "" http://localhost:8503
%PY% -m streamlit run app.py --server.port 8503 --server.headless true --browser.gatherUsageStats false
pause
