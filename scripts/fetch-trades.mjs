#!/usr/bin/env node
/**
 * 국토교통부 아파트 매매 실거래가 자동 조회 → data/trades.json
 *
 * 사용법:
 *   MOLIT_API_KEY=발급받은_인증키 node scripts/fetch-trades.mjs
 *
 * 인증키: 공공데이터포털(data.go.kr) → "국토교통부_아파트 매매 실거래가 자료" 활용신청
 * 지역코드(LAWD_CD, 시군구 5자리)는 LAWD_CODES 환경변수로 바꿀 수 있습니다.
 *   예) LAWD_CODES="50110:제주시,50130:서귀포시"
 * Node 18 이상 필요 (내장 fetch 사용, 외부 패키지 없음).
 */
import { writeFile } from "node:fs/promises";

const KEY = process.env.MOLIT_API_KEY;
if (!KEY) {
  console.error("MOLIT_API_KEY 환경변수가 없습니다.");
  process.exit(1);
}

const ENDPOINT =
  "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade";
const CODES = (process.env.LAWD_CODES || "50110:제주시,50130:서귀포시")
  .split(",")
  .map((s) => s.trim().split(":"))
  .map(([code, name]) => ({ code, name: name || code }));
const MONTHS = Number(process.env.MONTHS || 2); // 이번 달 포함 최근 N개월
const LIMIT = Number(process.env.LIMIT || 60);

function recentYmds(n) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// 의존성 없이 XML <item> 파싱 (신규 영문 태그 / 구버전 한글 태그 모두 지원)
function parseItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const obj = {};
    for (const f of m[1].matchAll(/<([^\/>\s]+)>([\s\S]*?)<\/\1>/g)) {
      obj[f[1]] = f[2].trim();
    }
    items.push(obj);
  }
  return items;
}

const pick = (o, ...keys) => keys.map((k) => o[k]).find((v) => v != null && v !== "");

function normalize(it, regionName) {
  const y = pick(it, "dealYear", "년");
  const mo = pick(it, "dealMonth", "월");
  const d = pick(it, "dealDay", "일");
  return {
    date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    region: `${regionName} ${pick(it, "umdNm", "법정동") || ""}`.trim(),
    name: pick(it, "aptNm", "아파트") || "",
    area: Number(pick(it, "excluUseAr", "전용면적") || 0),
    floor: pick(it, "floor", "층") || "",
    price: Number(String(pick(it, "dealAmount", "거래금액") || "0").replace(/[,\s]/g, "")), // 만원
    canceled: Boolean(pick(it, "cdealType", "해제여부")),
  };
}

async function fetchOne(code, ymd) {
  const url = new URL(ENDPOINT);
  // data.go.kr 키는 이미 인코딩된 형태로 발급되는 경우가 많아 그대로 붙입니다.
  const qs = `serviceKey=${KEY}&LAWD_CD=${code}&DEAL_YMD=${ymd}&pageNo=1&numOfRows=1000`;
  const res = await fetch(`${url.origin}${url.pathname}?${qs}`);
  const text = await res.text();
  const code_ = text.match(/<resultCode>([^<]*)<\/resultCode>/)?.[1];
  if (!res.ok || (code_ && !/^0+$/.test(code_))) {
    throw new Error(`${code}/${ymd} 요청 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return parseItems(text);
}

const all = [];
for (const { code, name } of CODES) {
  for (const ymd of recentYmds(MONTHS)) {
    try {
      const items = await fetchOne(code, ymd);
      all.push(...items.map((it) => normalize(it, name)));
      console.log(`✓ ${name}(${code}) ${ymd}: ${items.length}건`);
    } catch (e) {
      console.warn(`✗ ${e.message}`);
    }
  }
}

const trades = all
  .filter((t) => !t.canceled && t.price > 0)
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, LIMIT);

await writeFile(
  new URL("../data/trades.json", import.meta.url),
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      source: "국토교통부 실거래가 공개시스템 (공공데이터포털 API)",
      regions: CODES.map((c) => c.name),
      trades,
    },
    null,
    2
  ) + "\n"
);
await writeFile(
  new URL("../data/trades.js", import.meta.url),
  "window.__TRADES__ = " + JSON.stringify({ updatedAt: new Date().toISOString(), regions: CODES.map((c) => c.name), trades }, null, 2) + ";\n"
);
console.log(`저장 완료: ${trades.length}건 → data/trades.json`);
