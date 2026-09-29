@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 나경공인중개사사무소 사이트를 켭니다... (이 창을 닫으면 서버가 꺼집니다)
where python >nul 2>nul && (start "" http://localhost:8000 & python -m http.server 8000 & goto :eof)
where py >nul 2>nul && (start "" http://localhost:8000 & py -m http.server 8000 & goto :eof)
where node >nul 2>nul && (start "" http://localhost:8000 & npx --yes http-server -p 8000 -c-1 & goto :eof)
echo 파이썬이 없어 서버 없이 바로 엽니다.
start "" "%~dp0index.html"
pause
