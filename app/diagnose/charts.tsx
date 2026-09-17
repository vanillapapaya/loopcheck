// 리포트용 SVG 차트. 의존성 없이 viewBox로 폭에 맞춘다.
// 주의: viewBox 안의 글자는 차트와 같은 비율로 커진다. 그래서 각 차트의 maxWidth를
// viewBox 폭에 맞춰 확대를 막고, 글자 크기는 본문(14)·각주(12) 아래에 오도록 잡았다.
// 막대는 24px 이하, 데이터 끝만 둥글게. 값 라벨은 강조할 곳에만. 상태색은 늘 글자 라벨과 함께.
// 모든 마크에 <title>을 달아 호버로 정확한 값과 분모를 보여준다.

import type { AdBucket, DiagnosisMetrics, LevelStat, SegmentStat } from "@/lib/diagnose/engine";
import { pct } from "@/lib/diagnose/findings";

const GRID = "var(--line)";
const AXIS = "var(--line-3)";
const TICK = { fontFamily: "var(--mono)", fontSize: 11, fill: "var(--muted)" } as const;
const LABEL = { fontFamily: "var(--mono)", fontSize: 12, fill: "var(--ink-2)" } as const;
const SANS = { fontFamily: "var(--sans)", fontSize: 12, fill: "var(--ink-2)" } as const;

/** 위쪽만 둥근 세로 막대 (바닥은 각지게) */
function colPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
/** 오른쪽만 둥근 가로 막대 */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (w <= 0) return "";
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}
const rateTitle = (label: string, r: { num: number; den: number; rate: number; lo: number; hi: number }) =>
  `${label}: ${pct(r.rate)} (${r.num.toLocaleString("ko-KR")}/${r.den.toLocaleString("ko-KR")}, 95% 구간 ${pct(r.lo)}–${pct(r.hi)})`;

function YGrid({ x1, x2, top, bottom, ticks }: { x1: number; x2: number; top: number; bottom: number; ticks: number[] }) {
  return (
    <>
      {ticks.map((t) => {
        const y = bottom - (bottom - top) * (t / 100);
        return (
          <g key={t}>
            <line x1={x1} x2={x2} y1={y} y2={y} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={x1 - 6} y={y + 3.5} textAnchor="end" {...TICK}>{t}</text>
          </g>
        );
      })}
    </>
  );
}

export function RetentionChart({ m }: { m: DiagnosisMetrics }) {
  const pts = m.retentionCurve.filter((p) => p.day === 0 || p.r.den >= m.meta.users * 0.25);
  const maxDay = pts[pts.length - 1]?.day ?? 1;
  const L = 40, R = 628, T = 12, B = 190;
  const x = (d: number) => L + ((R - L) * d) / maxDay;
  const y = (r: number) => B - (B - T) * r;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(p.r.rate).toFixed(1)}`).join(" ");
  const d1 = pts.find((p) => p.day === 1);
  const d7 = pts.find((p) => p.day === 7);
  const ticks = [0, 1, 3, 7, 14, 21, 28].filter((t) => t <= maxDay);
  return (
    <svg width="100%" viewBox="0 0 640 222" role="img" aria-label="일별 classic 리텐션 곡선" style={{ display: "block", minWidth: 480, maxWidth: 640 }}>
      <YGrid x1={L} x2={R} top={T} bottom={B} ticks={[0, 25, 50, 75, 100]} />
      <path d={`${d} L${x(maxDay)} ${B} L${L} ${B}Z`} fill="var(--series)" opacity={0.08} />
      <path d={d} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => (
        <circle key={p.day} cx={x(p.day)} cy={y(p.r.rate)} r={9} fill="transparent">
          <title>{rateTitle(`D${p.day}`, p.r)}</title>
        </circle>
      ))}
      {[d1, d7].map((p) => p && (
        <g key={p.day} pointerEvents="none">
          <circle cx={x(p.day)} cy={y(p.r.rate)} r={4.5} fill="var(--series)" stroke="var(--surface)" strokeWidth={2} />
          <text x={x(p.day) + 9} y={y(p.r.rate) - 8} {...LABEL} fill="var(--ink)" fontWeight={600}>D{p.day} {pct(p.r.rate)}</text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={x(t)} y={B + 18} textAnchor="middle" {...TICK}>D{t}</text>
      ))}
    </svg>
  );
}

export function LevelChart({ levels, wallLevel }: { levels: LevelStat[]; wallLevel: number | null }) {
  const shown = levels.slice(0, 20);
  const L = 34, R = 636, T = 16, B = 188;
  const slot = (R - L) / shown.length;
  const bw = Math.min(22, slot - 6);
  const y = (r: number) => B - (B - T) * r;
  const line = shown.map((l, i) => `${i ? "L" : "M"}${(L + slot * i + slot / 2).toFixed(1)} ${y(l.reachClear.rate).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox="0 0 640 214" role="img" aria-label="레벨별 클리어율, 시도 대비와 도달자 대비" style={{ display: "block", minWidth: 480, maxWidth: 640 }}>
      <YGrid x1={L} x2={R} top={T} bottom={B} ticks={[0, 25, 50, 75, 100]} />
      {shown.map((l, i) => {
        const cx = L + slot * i + slot / 2;
        const wall = l.level === wallLevel;
        const h = B - y(l.attemptClear.rate);
        return (
          <g key={l.level}>
            <path d={colPath(cx - bw / 2, y(l.attemptClear.rate), bw, h)} fill={wall ? "var(--danger)" : "var(--series)"} />
            <rect x={cx - slot / 2} y={T} width={slot} height={B - T} fill="transparent">
              <title>{`레벨 ${l.level} · 도달 ${l.reached.toLocaleString("ko-KR")}명\n${rateTitle("시도 대비 클리어", l.attemptClear)}\n${rateTitle("도달자 대비 클리어", l.reachClear)}\n${rateTitle("다음 레벨 미도달", l.stuck)}`}</title>
            </rect>
            {(l.level === 1 || l.level % 5 === 0 || wall) && (
              <text x={cx} y={B + 16} textAnchor="middle" {...TICK} fill={wall ? "var(--ink)" : TICK.fill} fontWeight={wall ? 600 : 400}>{l.level}</text>
            )}
          </g>
        );
      })}
      <path d={line} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeLinejoin="round" pointerEvents="none" />
      {wallLevel != null && (() => {
        const i = shown.findIndex((l) => l.level === wallLevel);
        if (i < 0) return null;
        const l = shown[i];
        const cx = L + slot * i + slot / 2;
        return (
          <text x={cx} y={y(l.attemptClear.rate) - 7} textAnchor="middle" {...LABEL} fill="var(--danger-ink)" fontWeight={600} pointerEvents="none">
            {pct(l.attemptClear.rate)}
          </text>
        );
      })()}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; swatch: "bar" | "line"; color: string }[] }) {
  return (
    <div className="legend" style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={it.swatch === "bar"
            ? { width: 10, height: 10, borderRadius: 2, background: it.color }
            : { width: 14, height: 2, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ChannelChart({ channels, worstKey }: { channels: SegmentStat[]; worstKey: string | null }) {
  const rows = [...channels].sort((a, b) => b.d7.rate - a.d7.rate);
  const max = Math.max(...rows.map((r) => r.d7.rate), 0.01);
  const L = 110, W = 260, rowH = 44;
  const H = rows.length * rowH + 8;
  return (
    <svg width="100%" viewBox={`0 0 560 ${H}`} role="img" aria-label="획득 채널별 D7 리텐션" style={{ display: "block", minWidth: 480, maxWidth: 560 }}>
      {rows.map((r, i) => {
        const yy = 6 + i * rowH;
        const w = (W * r.d7.rate) / max;
        const worst = r.key === worstKey;
        return (
          <g key={r.key}>
            <text x={0} y={yy + 14} {...SANS} fill={worst ? "var(--ink)" : SANS.fill} fontWeight={worst ? 600 : 400}>{r.key}</text>
            {worst && <text x={0} y={yy + 28} {...SANS} fontSize={12} fill="var(--danger-ink)">확인 필요</text>}
            <path d={barPath(L, yy + 5, w, 18)} fill={worst ? "var(--danger)" : "var(--series)"} />
            <text x={L + w + 8} y={yy + 18} {...LABEL} fill="var(--ink)" fontWeight={worst ? 600 : 400}>D7 잔존 {pct(r.d7.rate)}</text>
            <text x={560} y={yy + 13} textAnchor="end" {...LABEL} fill="var(--muted)">D1 잔존 {pct(r.d1.rate)}</text>
            <text x={560} y={yy + 27} textAnchor="end" {...LABEL} fill="var(--muted)">설치 비중 {pct(r.share)}</text>
            <rect x={0} y={yy} width={560} height={rowH - 4} fill="transparent">
              <title>{`${r.key} · 설치 ${r.users.toLocaleString("ko-KR")}명 (${pct(r.share)})\n${rateTitle("D1", r.d1)}\n${rateTitle("D7", r.d7)}`}</title>
            </rect>
          </g>
        );
      })}
      <line x1={L} x2={L} y1={2} y2={H - 4} stroke={AXIS} />
    </svg>
  );
}

const TIER_LABEL: Record<string, string> = { high: "고사양", mid: "중사양", low: "저사양" };

export function DeviceChart({ tiers }: { tiers: SegmentStat[] }) {
  const order = ["high", "mid", "low"];
  const rows = [...tiers].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const max = Math.max(...rows.map((r) => r.avgSessionMin ?? 0), 1);
  const L = 70, W = 300, rowH = 44;
  const H = rows.length * rowH + 8;
  return (
    <svg width="100%" viewBox={`0 0 560 ${H}`} role="img" aria-label="기기 등급별 평균 세션 길이" style={{ display: "block", minWidth: 480, maxWidth: 560 }}>
      {rows.map((r, i) => {
        const yy = 6 + i * rowH;
        const v = r.avgSessionMin ?? 0;
        const w = (W * v) / max;
        const low = r.key === "low";
        return (
          <g key={r.key}>
            <text x={0} y={yy + 18} {...SANS} fill={low ? "var(--ink)" : SANS.fill} fontWeight={low ? 600 : 400}>{TIER_LABEL[r.key] ?? r.key}</text>
            <path d={barPath(L, yy + 5, w, 20)} fill={low ? "var(--warn)" : "var(--series)"} />
            <text x={L + w + 8} y={yy + 19} {...LABEL} fill="var(--ink)" fontWeight={low ? 600 : 400}>{v.toFixed(1)}분</text>
            <text x={560} y={yy + 14} textAnchor="end" {...LABEL} fill={low ? "var(--ink)" : "var(--muted)"} fontWeight={low ? 600 : 400}>D1 잔존 {pct(r.d1.rate)}</text>
            <text x={560} y={yy + 28} textAnchor="end" {...LABEL} fill="var(--muted)">설치 비중 {pct(r.share)}</text>
            <rect x={0} y={yy} width={560} height={rowH - 4} fill="transparent">
              <title>{`${TIER_LABEL[r.key] ?? r.key} · 설치 ${r.users.toLocaleString("ko-KR")}명 (${pct(r.share)})\n평균 세션 ${v.toFixed(2)}분\n${rateTitle("D1", r.d1)}`}</title>
            </rect>
          </g>
        );
      })}
      <line x1={L} x2={L} y1={2} y2={H - 4} stroke={AXIS} />
    </svg>
  );
}

/** 막대 몇 개짜리 작은 세로 막대 차트 (0-100%) */
export function MiniColumns({
  items, color, emphasize, caption, max = 1, digits = 1,
}: {
  items: { label: string; r: { num: number; den: number; rate: number; lo: number; hi: number }; faded?: boolean; note?: string }[];
  color: string;
  emphasize?: string;
  caption?: string;
  max?: number;
  digits?: number;
}) {
  const L = 30, R = 452, T = 24, B = 146;
  const H = items.some((it) => it.note) ? 190 : 178;
  const slot = (R - L) / items.length;
  const bw = Math.min(24, slot - 12);
  const y = (r: number) => B - (B - T) * Math.min(1, r / max);
  const ticks = max === 1 ? [0, 50, 100] : [0];
  return (
    <figure style={{ margin: "0 auto", maxWidth: 460 }}>
    <svg width="100%" viewBox={`0 0 460 ${H}`} role="img" aria-label={caption} style={{ display: "block", maxWidth: 460, minWidth: 300 }}>
      {ticks.map((t) => {
        const yy = B - (B - T) * (t / 100);
        return (
          <g key={t}>
            <line x1={L} x2={R} y1={yy} y2={yy} stroke={t === 0 ? AXIS : GRID} />
            {max === 1 && <text x={L - 6} y={yy + 3.5} textAnchor="end" {...TICK}>{t}</text>}
          </g>
        );
      })}
      {items.map((it, i) => {
        const cx = L + slot * i + slot / 2;
        const em = it.label === emphasize;
        return (
          <g key={it.label}>
            <path d={colPath(cx - bw / 2, y(it.r.rate), bw, B - y(it.r.rate))} fill={color} opacity={it.faded ? 0.4 : 1} />
            <text x={cx} y={y(it.r.rate) - 6} textAnchor="middle" {...TICK} fontSize={12} fill={em ? "var(--ink)" : "var(--ink-2)"} fontWeight={em ? 600 : 400}>
              {(it.r.rate * 100).toFixed(digits)}
            </text>
            <text x={cx} y={B + 15} textAnchor="middle" {...TICK}>{it.label}</text>
            {it.note && <text x={cx} y={B + 28} textAnchor="middle" {...TICK} fill="var(--danger-ink)">{it.note}</text>}
            <rect x={cx - slot / 2} y={T - 14} width={slot} height={B - T + 30} fill="transparent">
              <title>{rateTitle(it.label, it.r)}</title>
            </rect>
          </g>
        );
      })}
    </svg>
    {caption && <figcaption style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, color: "var(--muted)", maxWidth: 460 }}>{caption}</figcaption>}
    </figure>
  );
}

export const adItems = (buckets: AdBucket[]) =>
  buckets.map((b) => ({ label: b.label.replace("회 이상", "회+"), r: b.nextDay, faded: b.lowSample, note: b.lowSample ? `n=${b.nextDay.den}` : undefined }));
