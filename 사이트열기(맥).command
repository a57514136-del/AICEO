#!/bin/bash
cd "$(dirname "$0")"
echo "나경공인중개사사무소 사이트를 켭니다... (이 창을 닫으면 서버가 꺼집니다)"
( sleep 1; open "http://localhost:8000" ) &
python3 -m http.server 8000 || open index.html
