// 진단 엔진. 브라우저에서 CSV를 읽어 집계 지표만 만든다.
// 개별 유저 행은 이 파일 밖으로 나가지 않는다. 반환값 DiagnosisMetrics는 작은 JSON이다.
// 통계는 여기서 전부 계산하고, 해석(LLM)은 이 결과만 받는다.
// Node에서 타입 스트리핑으로 바로 검증할 수 있게 상대 import를 두지 않는다.

export type Row = Record<string, string>;

export type RawTables = {
  users: Row[];
  sessions: Row[];
  attempts: Row[];
  purchases: Row[];
  ads: Row[];
};

export type Rate = { num: number; den: number; rate: number; lo: number; hi: number };

export type SegmentStat = {
  key: string;
  users: number;
  share: number;
  d1: Rate;
  d7: Rate;
  avgSessionMin: number | null;
};

export type LevelStat = {
  level: number;
  reached: number;
  attempts: number;
  /** 시도 대비 클리어율 */
  attemptClear: Rate;
  /** 도달자 대비 클리어율 */
  reachClear: Rate;
  /** 레벨 N 도달자 중 N+1로 못 간 비율 */
  stuck: Rate;
  /** stuck 중 관측 종료 전 CHURN_IDLE_DAYS일 이상 접속이 없는 유저 */
  churned: Rate;
};

export type AdBucket = { label: string; min: number; max: number; nextDay: Rate; lowSample: boolean };

export type DiagnosisMetrics = {
  meta: {
    users: number;
    sessions: number;
    attempts: number;
    purchases: number;
    adViews: number;
    obsStart: string;
    obsEnd: string;
  };
  retention: { day: number; r: Rate }[];
  /** D0부터 일별 classic 리텐션. 분모가 줄어드는 뒤쪽은 화면에서 잘라 쓴다 */
  retentionCurve: { day: number; r: Rate }[];
  segments: {
    channel: SegmentStat[];
    deviceTier: SegmentStat[];
    platform: SegmentStat[];
    /** platform × device_tier 조합의 설치 비중 (예: android 중 low 비율) */
    tierShareWithinPlatform: { platform: string; tier: string; share: number; users: number }[];
  };
  levels: LevelStat[];
  monetization: {
    payers: Rate;
    revenueKrw: number;
    arppuKrw: number | null;
    byProduct: { productId: string; productType: string; priceKrw: number; count: number; revenueKrw: number }[];
    firstPurchaseLevel: { level: number; count: number }[];
    /** 레벨 실패 직후 결제 비율. 연속 실패 수(세션 내, 5 이상은 5) 별. 분모 = 해당 연속 실패 수의 실패 시도 */
    buyAfterFailStreak: { streak: number; r: Rate }[];
    /** 노출/클릭 이벤트가 없으면 null. 없는 퍼널을 만들어내지 않는다 */
    offerFunnel: null;
  };
  ads: {
    /** 틀린 집계: 유저별 누적 시청 수 대비 D7. 생존 편향 비교용으로만 보여준다 */
    naiveCumulativeD7: { label: string; min: number; max: number; d7: Rate }[];
    /** 올바른 집계: day_n을 고정하고 당일 시청 수 대비 익일 접속 */
    fixedDay: { dayFrom: number; dayTo: number; buckets: AdBucket[] };
  };
};

export const CHURN_IDLE_DAYS = 3;
export const LOW_SAMPLE = 100;
const RETENTION_DAYS = [1, 3, 7, 14, 30];
const AD_DAY_FROM = 1;
const AD_DAY_TO = 3;
const AD_BUCKETS: [string, number, number][] = [
  ["1-2회", 1, 2],
  ["3-4회", 3, 4],
  ["5-6회", 5, 6],
  ["7회 이상", 7, 9999],
];
const NAIVE_BUCKETS: [string, number, number][] = [
  ["0회", 0, 0],
  ["1-10회", 1, 10],
  ["11-30회", 11, 30],
  ["31회 이상", 31, 99999],
];

// ---------- CSV ----------

/** RFC 4180 수준의 CSV 파서. 따옴표 안의 쉼표·줄바꿈·"" 이스케이프를 처리한다. */
export function parseCsv(text: string): Row[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { record.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field); field = "";
      if (record.length > 1 || record[0] !== "") records.push(record);
      record = [];
    } else field += c;
  }
  if (field !== "" || record.length) { record.push(field); records.push(record); }
  if (!records.length) return [];
  const header = records[0].map((h) => h.trim());
  const rows: Row[] = new Array(records.length - 1);
  for (let r = 1; r < records.length; r++) {
    const row: Row = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = records[r][c] ?? "";
    rows[r - 1] = row;
  }
  return rows;
}

// ---------- 통계 도우미 ----------

/** Wilson 95% 신뢰구간. 표본이 작은 구간을 과신하지 않게 모든 비율에 붙인다. */
export function rate(num: number, den: number): Rate {
  if (den === 0) return { num, den, rate: 0, lo: 0, hi: 0 };
  const z = 1.96;
  const p = num / den;
  const z2 = z * z;
  const center = (p + z2 / (2 * den)) / (1 + z2 / den);
  const half = (z * Math.sqrt((p * (1 - p)) / den + z2 / (4 * den * den))) / (1 + z2 / den);
  return { num, den, rate: p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

const DAY_MS = 86_400_000;
/** "YYYY-MM-DD..." → UTC 기준 일 번호. 시간대 영향을 받지 않도록 날짜 부분만 쓴다. */
function dayNum(s: string): number {
  return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY_MS;
}
function dayStr(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

// ---------- 계산 ----------

export function diagnose(t: RawTables): DiagnosisMetrics {
  // 유저
  const install = new Map<string, number>();
  for (const u of t.users) {
    install.set(u.user_id, dayNum(u.install_date));
  }
  const userIds = [...install.keys()];

  // 관측 기간: 로그에 찍힌 가장 늦은 날짜가 끝
  let obsEnd = -Infinity;
  let obsStart = Infinity;
  for (const s of t.sessions) obsEnd = Math.max(obsEnd, dayNum(s.session_start));
  for (const a of t.attempts) obsEnd = Math.max(obsEnd, dayNum(a.ts));
  for (const d of install.values()) obsStart = Math.min(obsStart, d);

  // 활동일 (설치 후 경과일). day_n 컬럼이 있으면 그것을, 없으면 날짜 차이로
  const active = new Map<string, Set<number>>();
  const lastActive = new Map<string, number>();
  const sessionSec = new Map<string, number[]>();
  for (const s of t.sessions) {
    const inst = install.get(s.user_id);
    if (inst === undefined) continue;
    const date = dayNum(s.session_start);
    const dn = s.day_n !== undefined && s.day_n !== "" ? +s.day_n : date - inst;
    let set = active.get(s.user_id);
    if (!set) active.set(s.user_id, (set = new Set()));
    set.add(dn);
    lastActive.set(s.user_id, Math.max(lastActive.get(s.user_id) ?? -Infinity, date));
    const arr = sessionSec.get(s.user_id);
    if (arr) arr.push(+s.duration_sec);
    else sessionSec.set(s.user_id, [+s.duration_sec]);
  }

  // classic N-day: N일째에 접속했는가. 분모는 N일째가 관측 기간 안에 있는 유저만.
  const classic = (ids: string[], n: number): Rate => {
    let num = 0;
    let den = 0;
    for (const id of ids) {
      if (obsEnd - install.get(id)! < n) continue;
      den++;
      if (active.get(id)?.has(n)) num++;
    }
    return rate(num, den);
  };

  const retention = RETENTION_DAYS.map((day) => ({ day, r: classic(userIds, day) })).filter((x) => x.r.den > 0);
  const retentionCurve: DiagnosisMetrics["retentionCurve"] = [];
  for (let day = 0; day <= obsEnd - obsStart; day++) retentionCurve.push({ day, r: classic(userIds, day) });

  // 세그먼트
  const segment = (col: string): SegmentStat[] => {
    const groups = new Map<string, string[]>();
    for (const u of t.users) {
      const k = u[col] || "(없음)";
      const g = groups.get(k);
      if (g) g.push(u.user_id);
      else groups.set(k, [u.user_id]);
    }
    return [...groups.entries()]
      .map(([key, ids]) => {
        let sum = 0;
        let cnt = 0;
        for (const id of ids) for (const sec of sessionSec.get(id) ?? []) { sum += sec; cnt++; }
        return {
          key,
          users: ids.length,
          share: ids.length / userIds.length,
          d1: classic(ids, 1),
          d7: classic(ids, 7),
          avgSessionMin: cnt ? sum / cnt / 60 : null,
        };
      })
      .sort((a, b) => b.users - a.users);
  };

  const tierShareWithinPlatform: DiagnosisMetrics["segments"]["tierShareWithinPlatform"] = [];
  {
    const byPlat = new Map<string, Map<string, number>>();
    for (const u of t.users) {
      const m = byPlat.get(u.platform) ?? new Map<string, number>();
      m.set(u.device_tier, (m.get(u.device_tier) ?? 0) + 1);
      byPlat.set(u.platform, m);
    }
    for (const [platform, m] of byPlat) {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      for (const [tier, n] of m) tierShareWithinPlatform.push({ platform, tier, share: n / total, users: n });
    }
  }

  // 레벨
  type Lv = { reached: Set<string>; cleared: Set<string>; attempts: number; clears: number };
  const lv = new Map<number, Lv>();
  for (const a of t.attempts) {
    const l = +a.level_id;
    let e = lv.get(l);
    if (!e) lv.set(l, (e = { reached: new Set(), cleared: new Set(), attempts: 0, clears: 0 }));
    e.attempts++;
    e.reached.add(a.user_id);
    if (a.result === "clear") { e.clears++; e.cleared.add(a.user_id); }
  }
  const maxLevel = Math.max(0, ...lv.keys());
  const levels: LevelStat[] = [];
  for (let l = 1; l < maxLevel; l++) {
    const e = lv.get(l);
    if (!e) continue;
    const next = lv.get(l + 1)?.reached ?? new Set<string>();
    let stuck = 0;
    let churned = 0;
    for (const id of e.reached) {
      if (next.has(id)) continue;
      stuck++;
      if (obsEnd - (lastActive.get(id) ?? -Infinity) >= CHURN_IDLE_DAYS) churned++;
    }
    const n = e.reached.size;
    levels.push({
      level: l,
      reached: n,
      attempts: e.attempts,
      attemptClear: rate(e.clears, e.attempts),
      reachClear: rate(e.cleared.size, n),
      stuck: rate(stuck, n),
      churned: rate(churned, n),
    });
  }

  // 결제
  const payerSet = new Set<string>();
  let revenue = 0;
  const prod = new Map<string, { productType: string; priceKrw: number; count: number; revenueKrw: number }>();
  for (const p of t.purchases) {
    payerSet.add(p.user_id);
    const price = +p.price_krw || 0;
    revenue += price;
    const e = prod.get(p.product_id) ?? { productType: p.product_type ?? "", priceKrw: price, count: 0, revenueKrw: 0 };
    e.priceKrw = Math.min(e.priceKrw, price);
    e.count++;
    e.revenueKrw += price;
    prod.set(p.product_id, e);
  }
  const firstBuy = new Map<string, Row>();
  for (const p of [...t.purchases].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))) {
    if (!firstBuy.has(p.user_id)) firstBuy.set(p.user_id, p);
  }
  const firstLv = new Map<number, number>();
  for (const p of firstBuy.values()) {
    const l = +p.level_at_purchase;
    if (Number.isFinite(l)) firstLv.set(l, (firstLv.get(l) ?? 0) + 1);
  }

  // 연속 실패 → 결제. 결제는 같은 유저·같은 시각의 실패 시도에 붙인다.
  const buyKey = new Map<string, number>();
  for (const p of t.purchases) {
    const k = p.user_id + "|" + p.ts;
    buyKey.set(k, (buyKey.get(k) ?? 0) + 1);
  }
  const streakN = [0, 0, 0, 0, 0, 0];
  const streakBuy = [0, 0, 0, 0, 0, 0];
  {
    const sorted = [...t.attempts].sort((a, b) =>
      a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 :
      a.ts < b.ts ? -1 : a.ts > b.ts ? 1 :
      a.attempt_id < b.attempt_id ? -1 : a.attempt_id > b.attempt_id ? 1 : 0,
    );
    let curUser = "";
    let curSession = "";
    let streak = 0;
    for (const a of sorted) {
      if (a.user_id !== curUser || a.session_id !== curSession) {
        curUser = a.user_id;
        curSession = a.session_id;
        streak = 0;
      }
      if (a.result === "clear") { streak = 0; continue; }
      streak++;
      const k = Math.min(streak, 5);
      streakN[k]++;
      const key = a.user_id + "|" + a.ts;
      const left = buyKey.get(key) ?? 0;
      if (left > 0) {
        streakBuy[k]++;
        buyKey.set(key, left - 1);
        streak = 0;
      }
    }
  }

  // 광고 - 틀린 집계 (누적)
  const adTotal = new Map<string, number>();
  const adDaily = new Map<string, number>();
  for (const ad of t.ads) {
    const inst = install.get(ad.user_id);
    if (inst === undefined) continue;
    adTotal.set(ad.user_id, (adTotal.get(ad.user_id) ?? 0) + 1);
    const k = ad.user_id + "|" + (dayNum(ad.ts) - inst);
    adDaily.set(k, (adDaily.get(k) ?? 0) + 1);
  }
  const naiveCumulativeD7 = NAIVE_BUCKETS.map(([label, min, max]) => ({
    label, min, max,
    d7: classic(userIds.filter((id) => { const c = adTotal.get(id) ?? 0; return c >= min && c <= max; }), 7),
  }));

  // 광고 - 올바른 집계: day_n 고정, 당일 시청 수 → 익일 접속
  const bucketNum = AD_BUCKETS.map(() => 0);
  const bucketDen = AD_BUCKETS.map(() => 0);
  for (const [k, count] of adDaily) {
    const bar = k.lastIndexOf("|");
    const id = k.slice(0, bar);
    const dn = +k.slice(bar + 1);
    if (dn < AD_DAY_FROM || dn > AD_DAY_TO) continue;
    if (obsEnd - install.get(id)! < dn + 1) continue; // 익일이 관측 밖이면 제외
    const b = AD_BUCKETS.findIndex(([, min, max]) => count >= min && count <= max);
    if (b < 0) continue;
    bucketDen[b]++;
    if (active.get(id)?.has(dn + 1)) bucketNum[b]++;
  }

  return {
    meta: {
      users: t.users.length,
      sessions: t.sessions.length,
      attempts: t.attempts.length,
      purchases: t.purchases.length,
      adViews: t.ads.length,
      obsStart: dayStr(obsStart),
      obsEnd: dayStr(obsEnd),
    },
    retention,
    retentionCurve,
    segments: {
      channel: segment("acquisition_channel"),
      deviceTier: segment("device_tier"),
      platform: segment("platform"),
      tierShareWithinPlatform,
    },
    levels,
    monetization: {
      payers: rate(payerSet.size, userIds.length),
      revenueKrw: revenue,
      arppuKrw: payerSet.size ? revenue / payerSet.size : null,
      byProduct: [...prod.entries()].map(([productId, v]) => ({ productId, ...v })).sort((a, b) => b.revenueKrw - a.revenueKrw),
      firstPurchaseLevel: [...firstLv.entries()].map(([level, count]) => ({ level, count })).sort((a, b) => b.count - a.count || a.level - b.level),
      buyAfterFailStreak: [1, 2, 3, 4, 5].map((s) => ({ streak: s, r: rate(streakBuy[s], streakN[s]) })),
      offerFunnel: null,
    },
    ads: {
      naiveCumulativeD7,
      fixedDay: {
        dayFrom: AD_DAY_FROM,
        dayTo: AD_DAY_TO,
        buckets: AD_BUCKETS.map(([label, min, max], i) => {
          const r = rate(bucketNum[i], bucketDen[i]);
          return { label, min, max, nextDay: r, lowSample: r.den < LOW_SAMPLE };
        }),
      },
    },
  };
}
