// 업로드 CSV를 엔진의 표준 스키마로 맞춘다. 헤더로 테이블을 알아보고, 컬럼 이름이 달라도 별칭으로 잇는다.
// 브라우저 안에서만 돈다.

import type { RawTables, Row } from "./engine.ts";

export type TableKey = keyof RawTables;
export type ColumnSpec = { name: string; required: boolean; aliases: string[]; hint: string };
export type TableSpec = {
  key: TableKey; label: string; file: string; required: boolean; missingNote: string; columns: ColumnSpec[];
  /** 이 테이블에만 있을 법한 컬럼. 필수 컬럼이 겹치는 테이블(세션 vs 레벨 시도)을 가르는 데 쓴다 */
  signature: string[];
};

const c = (name: string, required: boolean, hint: string, ...aliases: string[]): ColumnSpec => ({ name, required, hint, aliases });

export const TABLES: TableSpec[] = [
  {
    key: "users", label: "유저", file: "users.csv", required: true, missingNote: "필수 · 설치일과 세그먼트의 기준",
    signature: ["install_date", "install_ts", "installed_at", "first_open", "first_seen", "signup_date", "register_date", "acquisition_channel", "device_tier"],
    columns: [
      c("user_id", true, "유저 식별자", "uid", "userid", "player_id", "account_id", "member_id"),
      c("install_date", true, "설치일 (YYYY-MM-DD)", "install_ts", "installed_at", "first_open", "first_seen", "signup_date", "created_at", "register_date"),
      c("platform", false, "android / ios / pc", "os", "os_name", "device_os"),
      c("device_tier", false, "low / mid / high", "tier", "device_grade", "device_class", "spec_tier"),
      c("country", false, "국가 코드", "country_code", "region", "geo"),
      c("acquisition_channel", false, "유입 채널", "channel", "media_source", "source", "utm_source", "install_source"),
    ],
  },
  {
    key: "sessions", label: "세션", file: "sessions.csv", required: true, missingNote: "필수 · 리텐션과 세션 길이의 기준",
    signature: ["session_start", "started_at", "start_time", "login_at", "session_length", "day_n", "days_since_install"],
    columns: [
      c("user_id", true, "유저 식별자", "uid", "userid", "player_id", "account_id"),
      c("session_start", true, "세션 시작 시각", "start_ts", "start_time", "started_at", "ts", "timestamp", "event_ts", "login_at"),
      c("duration_sec", true, "세션 길이 (초)", "duration", "session_length", "length_sec", "playtime_sec", "play_sec"),
      c("day_n", false, "설치 후 경과일", "days_since_install", "day", "dn"),
      c("session_id", false, "세션 식별자", "sid"),
    ],
  },
  {
    key: "attempts", label: "레벨 시도", file: "level_attempts.csv", required: false, missingNote: "선택 · 레벨 난이도 분석 시 필요",
    signature: ["result", "is_success", "success", "cleared", "is_clear", "outcome", "win", "level_id", "stage_no", "stage_id", "level_no", "boosters_used"],
    columns: [
      c("user_id", true, "유저 식별자", "uid", "userid", "player_id", "account_id"),
      c("level_id", true, "레벨 번호", "level", "stage", "stage_no", "stage_id", "level_no", "chapter"),
      c("result", true, "성공/실패 (clear·fail, true·false, 1·0)", "is_success", "success", "cleared", "is_clear", "outcome", "status", "win"),
      c("ts", true, "시도 시각", "timestamp", "event_ts", "time", "created_at", "start_ts"),
      c("session_id", false, "세션 식별자 (연속 실패 계산에 씀)", "sid"),
      c("attempt_id", false, "시도 식별자", "id"),
    ],
  },
  {
    key: "purchases", label: "결제", file: "purchases.csv", required: false, missingNote: "선택 · 수익화 분석 시 필요",
    signature: ["price_krw", "price", "amount", "revenue", "revenue_krw", "amount_krw", "product_id", "sku", "purchase_id", "transaction_id"],
    columns: [
      c("user_id", true, "유저 식별자", "uid", "userid", "player_id", "account_id"),
      c("price_krw", true, "결제 금액 (원)", "price", "amount", "revenue", "revenue_krw", "amount_krw"),
      c("ts", true, "결제 시각", "timestamp", "event_ts", "purchased_at", "time", "created_at"),
      c("product_id", false, "상품 ID", "product", "sku", "item_id"),
      c("product_type", false, "상품 종류", "type", "category"),
      c("level_at_purchase", false, "결제 시점 레벨", "level", "level_id", "stage"),
    ],
  },
  {
    key: "ads", label: "광고 시청", file: "ad_views.csv", required: false, missingNote: "선택 · 광고 빈도 분석 시 필요",
    signature: ["placement", "ad_placement", "ad_unit", "reward_claimed", "rewarded", "ad_view_id", "ad_network"],
    columns: [
      c("user_id", true, "유저 식별자", "uid", "userid", "player_id", "account_id"),
      c("ts", true, "시청 시각", "timestamp", "event_ts", "time", "created_at", "viewed_at"),
      c("placement", false, "광고 위치", "ad_placement", "ad_unit"),
      c("reward_claimed", false, "보상 수령 여부", "rewarded", "reward"),
    ],
  },
];

const key = (s: string) => s.toLowerCase().replace(/[\s_\-.]/g, "");

/** 헤더와 가장 잘 맞는 테이블. 필수 컬럼이 절반 이상 잡혀야 인정한다. */
export function identifyTable(headers: string[], fileName = ""): TableKey | null {
  const hs = new Set(headers.map(key));
  let best: { key: TableKey; score: number } | null = null;
  for (const t of TABLES) {
    const req = t.columns.filter((col) => col.required);
    const hit = req.filter((col) => [col.name, ...col.aliases].some((a) => hs.has(key(a)))).length;
    let score = hit / req.length + t.columns.filter((col) => hs.has(key(col.name))).length * 0.05;
    if (t.signature.some((sig) => hs.has(key(sig)))) score += 0.5;
    if (key(fileName).startsWith(key(t.file.replace(".csv", "")))) score += 0.3;
    if (hit / req.length >= 0.5 && (!best || score > best.score)) best = { key: t.key, score };
  }
  return best?.key ?? null;
}

/** 표준 컬럼 이름 → 파일의 헤더. 못 찾으면 빈 문자열. */
export function autoMap(table: TableKey, headers: string[]): Record<string, string> {
  const spec = TABLES.find((t) => t.key === table)!;
  const byKey = new Map(headers.map((h) => [key(h), h]));
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const col of spec.columns) {
    const h = [col.name, ...col.aliases].map((a) => byKey.get(key(a))).find((x) => x && !used.has(x)) ?? "";
    if (h) used.add(h);
    out[col.name] = h;
  }
  return out;
}

export function missingRequired(table: TableKey, mapping: Record<string, string>): string[] {
  return TABLES.find((t) => t.key === table)!.columns.filter((col) => col.required && !mapping[col.name]).map((col) => col.name);
}

const DATE_RE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/;
const TRUE = new Set(["clear", "cleared", "success", "succeeded", "win", "won", "pass", "passed", "true", "t", "y", "yes", "1", "성공", "클리어"]);

/** "2026/8/5 10:00" → "2026-08-05 10:00". 날짜로 시작하지 않으면 null. */
function normDate(v: string): string | null {
  const s = v.trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}${m[4].replace(/^T/, " ")}`;
}

export type NormalizeResult = { rows: Row[]; badDates: number; sampleBad?: string };

/** 매핑대로 컬럼 이름을 바꾸고 값을 엔진이 읽는 형태로 맞춘다. 날짜를 읽을 수 없는 행은 버린다. */
export function normalizeTable(table: TableKey, rows: Row[], mapping: Record<string, string>): NormalizeResult {
  const spec = TABLES.find((t) => t.key === table)!;
  const dateCols = new Set(["install_date", "session_start", "ts"]);
  const out: Row[] = [];
  let badDates = 0;
  let sampleBad: string | undefined;
  for (const r of rows) {
    const o: Row = {};
    let ok = true;
    for (const col of spec.columns) {
      const src = mapping[col.name];
      let v = src ? (r[src] ?? "").trim() : "";
      if (dateCols.has(col.name) && src) {
        const d = normDate(v);
        if (!d) { ok = false; sampleBad ??= v; break; }
        v = d;
      } else if (col.name === "result") {
        v = TRUE.has(v.toLowerCase()) ? "clear" : "fail";
      } else if (col.name === "device_tier" || col.name === "platform") {
        v = v.toLowerCase();
      } else if (col.name === "price_krw" || col.name === "duration_sec") {
        v = v.replace(/[,원₩\s]/g, "");
      }
      if (src || !(col.name in o)) o[col.name] = v;
    }
    if (!ok) { badDates++; continue; }
    if (table === "purchases" && !o.product_id) o.product_id = "(상품 미상)";
    out.push(o);
  }
  return { rows: out, badDates, sampleBad };
}

export const isDateLike = (v: string) => DATE_RE.test(v.trim());
