"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DiagnosisMetrics } from "@/lib/diagnose/engine";
import { buildReport, num, pct, won } from "@/lib/diagnose/findings";
import { buildFacts, type AiReport } from "@/lib/diagnose/interpret";
import { ChannelChart, DeviceChart, Legend, LevelChart, MiniColumns, RetentionChart, adItems } from "./charts";

const RANK_STYLE = [
  { background: "var(--danger)", color: "#FFFFFF" },
  { background: "var(--warn)", color: "var(--ink)" },
  { background: "var(--line-3)", color: "var(--ink)" },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function WarnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B5822A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden>
      <path d="M12 8v5" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function InterpretStatus({ ai, showRules, onToggle }: { ai: Ai; showRules: boolean; onToggle: () => void }) {
  const chip: React.CSSProperties = { fontSize: 12, color: "var(--ink-2)", display: "inline-flex", alignItems: "center", gap: 8 };
  if (ai.status === "loading") return <span role="status" style={chip}>AI 해석을 받는 중 · 지금은 규칙 기반 해석입니다</span>;
  if (ai.status === "failed") return <span style={chip}>{ai.message}. 규칙 기반 해석을 보여 드립니다</span>;
  return (
    <span style={chip}>
      <span className="mono" style={{ fontSize: 11, padding: "2px 7px", border: "1px solid var(--line-3)", borderRadius: 3 }}>
        {showRules ? "규칙 기반 해석" : `AI 해석 · ${ai.model}`}
      </span>
      <button onClick={onToggle} style={{ background: "none", border: "none", padding: 0, fontFamily: "var(--sans)", fontSize: 12, color: "var(--link)", cursor: "pointer" }}>
        {showRules ? "AI 해석 보기" : "규칙 기반과 비교"}
      </button>
    </span>
  );
}

type CardFinding = { title: string; body: string; tag?: string | null; evidence: { label: string; text: string }[] };

function FindingCard({ f, rank }: { f: CardFinding; rank: number }) {
  return (
    <div className="card" style={{ padding: "24px 26px" }}>
      <div style={{ display: "flex", gap: 20 }}>
        <div className="mono" aria-label={`${rank}순위`}
          style={{ ...RANK_STYLE[Math.min(rank - 1, 2)], width: 32, height: 32, flexShrink: 0, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600 }}>
          {rank}
        </div>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px", marginBottom: 8 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.45 }}>{f.title}</h3>
            {f.tag && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", background: "#FBE9E7", color: "var(--danger-ink)", borderRadius: 3 }}>{f.tag}</span>}
          </div>
          <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.75, color: "var(--ink-2)", maxWidth: 940 }}>{f.body}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, paddingTop: 14, borderTop: "1px solid var(--line-2)" }}>
            {f.evidence.map((e) => (
              <div key={e.label}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{e.label}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>{e.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, note, sub, children }: { title: string; note?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "22px 24px", minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
        {note && <span style={{ fontSize: 12, color: "var(--muted)" }}>{note}</span>}
      </div>
      {sub && <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.6, color: "var(--muted)" }}>{sub}</p>}
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 16, marginBottom: 16 };
const th: React.CSSProperties = { textAlign: "right", padding: "6px 10px", fontWeight: 600, color: "var(--muted)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { textAlign: "right", padding: "5px 10px", borderBottom: "1px solid var(--line-2)", whiteSpace: "nowrap" };

type Ai =
  | { status: "loading" }
  | { status: "done"; report: AiReport; model: string }
  | { status: "failed"; message: string };

export default function Report({ m, title, sourceNote }: { m: DiagnosisMetrics; title: string; sourceNote: string }) {
  const rep = useMemo(() => buildReport(m), [m]);
  const [ai, setAi] = useState<Ai>({ status: "loading" });
  const [showRules, setShowRules] = useState(false);

  // 규칙 해석을 먼저 보여주고, AI 해석이 오면 바꿔 끼운다. 서버로 가는 것은 집계 수치 문장(사실표)뿐이다.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/interpret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ facts: buildFacts(m, rep) }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.report) setAi({ status: "done", report: data.report, model: data.model });
        else setAi({ status: "failed", message: data.error === "no_key" ? "AI 해석이 연결되지 않은 환경입니다" : data.message ?? "AI 해석을 받지 못했습니다" });
      })
      .catch((e) => { if (e?.name !== "AbortError") setAi({ status: "failed", message: "네트워크 문제로 AI 해석을 받지 못했습니다" }); });
    return () => ctrl.abort();
  }, [m, rep]);

  const useAi = ai.status === "done" && !showRules;
  const summary = useAi ? ai.report.summary : rep.summary;
  const findings: CardFinding[] = useAi ? ai.report.findings : rep.findings;
  const d1 = m.retention.find((r) => r.day === 1)?.r;
  const d7 = m.retention.find((r) => r.day === 7)?.r;
  const fixed = m.ads.fixedDay;
  const worstChannel = rep.findings.find((f) => f.id === "channel_quality") ? [...m.segments.channel].sort((a, b) => a.d7.rate - b.d7.rate)[0].key : null;
  const fp = m.monetization.firstPurchaseLevel[0];

  return (
    <div>
      {/* 리포트 머리 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 26, borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>진단 리포트</div>
          <h1 style={{ fontSize: "clamp(26px, 4vw, 32px)", fontWeight: 600, marginBottom: 10 }}>{title}</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 13, color: "var(--ink-2)" }}>
            <span className="mono">{m.meta.obsStart} – {m.meta.obsEnd}</span>
            <span>설치 <span className="mono">{num(m.meta.users)}</span>명</span>
            <span>레벨 시도 <span className="mono">{num(m.meta.attempts)}</span>건</span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
          {d1 && <Stat label="D1" value={pct(d1.rate)} />}
          {d7 && <Stat label="D7" value={pct(d7.rate)} />}
          {m.meta.purchases > 0 && <Stat label="결제 전환" value={pct(m.monetization.payers.rate)} />}
          {m.meta.purchases > 0 && <Stat label="설치당 매출" value={won(m.monetization.revenueKrw / Math.max(1, m.meta.users))} />}
        </div>
      </div>

      {/* 요약 */}
      <div className="card" style={{ marginTop: 28, padding: "26px 30px", borderLeft: "3px solid var(--ink)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div className="eyebrow">한 문단 요약</div>
          <InterpretStatus ai={ai} showRules={showRules} onToggle={() => setShowRules((v) => !v)} />
        </div>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.85, maxWidth: 1080 }}>{summary}</p>
      </div>

      {/* 개선안 */}
      <h2 style={{ fontSize: 22, fontWeight: 600, margin: "40px 0 16px" }}>먼저 고칠 것</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {findings.map((f, i) => <FindingCard key={`${useAi ? "ai" : "rule"}-${i}`} f={f} rank={i + 1} />)}
        {!findings.length && <div className="card" style={{ padding: 24, fontSize: 14, color: "var(--ink-2)" }}>규칙으로 잡히는 뚜렷한 이상 신호가 없습니다.</div>}
      </div>

      {/* 근거 차트 */}
      <h2 style={{ fontSize: 22, fontWeight: 600, margin: "44px 0 16px" }}>근거가 된 숫자</h2>

      <div style={grid2}>
        <ChartCard title="코호트 리텐션" note="classic N-day" sub="설치 후 N일째에 접속한 비율입니다. 분모는 N일째가 관측 기간 안에 들어온 유저만 셉니다.">
          <RetentionChart m={m} />
        </ChartCard>
        {m.levels.length > 0 && <ChartCard title="레벨별 클리어율" note="레벨 1–20" sub="두 선이 크게 벌어지는 레벨은 재도전이 몰리는 구간입니다.">
          <Legend items={[
            { label: "시도 대비 (분모: 시도 수)", swatch: "bar", color: "var(--series)" },
            { label: "도달자 대비 (분모: 도달 유저)", swatch: "line", color: "var(--ink-2)" },
          ]} />
          <LevelChart levels={m.levels} wallLevel={rep.wall?.level.level ?? null} />
        </ChartCard>}
      </div>

      <div style={grid2}>
        {m.segments.channel.length > 1 && <ChartCard title="획득 채널별 D7 리텐션" sub="오른쪽 회색 글자는 D1과 설치 비중입니다.">
          <ChannelChart channels={m.segments.channel} worstKey={worstChannel} />
        </ChartCard>}
        {m.segments.deviceTier.length > 1 && <ChartCard title="기기 등급별 평균 세션 길이" sub={`저사양 기기가 전체 설치의 ${pct(m.segments.deviceTier.find((t) => t.key === "low")?.share ?? 0)}입니다.`}>
          <DeviceChart tiers={m.segments.deviceTier} />
        </ChartCard>}
      </div>

      {/* 광고 트랩 */}
      {rep.ads && (
        <div className="card" style={{ padding: "24px 26px", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
            <WarnIcon />
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>광고 빈도 — 집계 방식이 결론을 뒤집는 구간</h3>
          </div>
          <p style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", maxWidth: 1000 }}>
            누적 시청량으로 보면 광고를 많이 볼수록 잔존이 높아 보입니다. 오래 남은 유저가 광고를 많이 본 것이지 그 반대가 아닙니다.
            경과일을 고정하고 당일 시청량 대비 익일 접속으로 다시 보면 방향이 달라집니다.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 20 }}>
            <div style={{ padding: 18, border: "1px solid var(--line-2)", borderRadius: 4, background: "var(--surface-2)" }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", background: "var(--line)", color: "var(--ink-2)", borderRadius: 3 }}>이렇게 보면 틀립니다</span>
              <div style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 10px" }}>누적 광고 시청 수 대비 D7 리텐션</div>
              <div style={{ overflowX: "auto" }}><MiniColumns color="var(--line-3)"
                items={m.ads.naiveCumulativeD7.map((b) => ({ label: b.label.replace("회 이상", "+").replace("회", ""), r: b.d7 }))}
                caption="생존 편향이 그대로 들어간 집계입니다." /></div>
            </div>
            <div style={{ padding: 18, border: "1px solid var(--line)", borderRadius: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", background: "var(--ink)", color: "var(--surface)", borderRadius: 3 }}>이렇게 봅니다</span>
              <div style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 10px" }}>경과 {fixed.dayFrom}–{fixed.dayTo}일 고정 · 당일 시청 수 대비 익일 접속</div>
              <div style={{ overflowX: "auto" }}><MiniColumns color="var(--series)" items={adItems(fixed.buckets)} emphasize={rep.ads.peakLabel}
                caption={`${rep.ads.peakLabel}가 정점${rep.ads.declinesAfterPeak ? `이고 ${rep.ads.last.label}에서 다시 내려갑니다` : "입니다"}.`} /></div>
            </div>
          </div>
          {rep.ads.last.lowSample && (
            <div style={{ display: "flex", gap: 12, marginTop: 18, padding: "14px 16px", background: "#FDF8EE", borderRadius: 4 }}>
              <WarnIcon />
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>
                <strong style={{ fontWeight: 600, color: "var(--ink)" }}>다만 {rep.ads.last.label} 구간은 표본이 {num(rep.ads.last.n)}개뿐입니다.</strong>{" "}
                역전이 시작됐다고 단정하기엔 부족합니다. 광고 상한을 당장 내리기보다 이 구간의 표본이 쌓일 때까지 지켜보거나 A/B로 직접 확인하세요.
                흐린 막대가 표본 {num(100)}개 미만인 구간입니다.
              </div>
            </div>
          )}
        </div>
      )}

      {/* 수익화 */}
      <div className="card" style={{ padding: "24px 26px", marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>수익화</h3>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: "var(--muted)" }}>
          {m.meta.purchases ? "결제 전환율의 분모는 설치 유저 수입니다." : "결제 데이터를 올리지 않아 수익화 수치는 비어 있습니다."}
        </p>
        {m.meta.purchases > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>결제자</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{num(m.monetization.payers.num)}명</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>설치 대비 <span className="mono">{pct(m.monetization.payers.rate, 2)}</span></div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>총 매출</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{won(m.monetization.revenueKrw)}</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>관측 기간 누적</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>ARPPU</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{m.monetization.arppuKrw != null ? won(m.monetization.arppuKrw) : "–"}</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>결제자 1인당</div>
          </div>
          {fp && (
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>첫 결제가 가장 많은 레벨</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>레벨 {fp.level}</div>
              <div style={{ fontSize: 12, color: "var(--ink-2)" }}><span className="mono">{num(fp.count)}</span>건 · 레벨 중 1위{rep.wall?.conflict ? " · 최대 정체 레벨과 같음" : ""}</div>
            </div>
          )}
        </div>}
        {m.meta.attempts > 0 && m.meta.purchases > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 24, marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line-2)", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>연속 실패 수별, 실패 직후 결제 비율</div>
            <div style={{ overflowX: "auto" }}><MiniColumns color="var(--series)" max={Math.max(...m.monetization.buyAfterFailStreak.map((s) => s.r.rate)) * 1.25 || 1} digits={2}
              items={m.monetization.buyAfterFailStreak.map((s) => ({ label: s.streak === 5 ? "5회+" : `${s.streak}회`, r: s.r }))}
              caption="분모: 해당 연속 실패 수에 이른 실패 시도 (세션 안 기준, %)" /></div>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75, color: "var(--ink-2)" }}>
            {rep.streakRises
              ? "연속 실패가 쌓일수록 실패 직후 결제 비율이 올라갑니다. 좌절이 결제 트리거로 작동하고 있다는 뜻이고, 그래서 난이도 조정은 매출 가드레일을 달고 진행해야 합니다."
              : "연속 실패 수와 결제 비율 사이에 뚜렷한 증가 경향은 보이지 않습니다."}
          </p>
        </div>}
        <div style={{ display: "flex", gap: 12, marginTop: 20, padding: "14px 16px", background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 4 }}>
          <WarnIcon />
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>
            <strong style={{ fontWeight: 600, color: "var(--ink)" }}>결제 퍼널(노출 → 클릭 → 구매)은 계산하지 않았습니다.</strong>{" "}
            이 데이터에는 오퍼 노출과 클릭 로그가 없어서, 없는 단계를 추정해 채우지 않았습니다.
            {" "}<Link href="/design">지표 설계기</Link>의 오퍼 노출·구매 단계 이벤트를 쌓으면 다음 진단부터 어느 단계에서 끊기는지 보입니다.
          </div>
        </div>
      </div>

      {/* 표 보기 */}
      <details className="card" style={{ padding: "18px 24px" }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>계산 근거 표로 보기</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 24, marginTop: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <caption style={{ textAlign: "left", fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>리텐션</caption>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>일</th><th style={th}>잔존</th><th style={th}>분모</th><th style={th}>비율</th><th style={th}>95% 구간</th></tr></thead>
              <tbody>
                {m.retention.map(({ day, r }) => (
                  <tr key={day}><td style={{ ...td, textAlign: "left" }}>D{day}</td><td style={td}>{num(r.num)}</td><td style={td}>{num(r.den)}</td><td style={td}>{pct(r.rate)}</td><td style={td}>{pct(r.lo)}–{pct(r.hi)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.levels.length > 0 && <div style={{ overflowX: "auto" }}>
            <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <caption style={{ textAlign: "left", fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>레벨 (1–20)</caption>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>레벨</th><th style={th}>도달</th><th style={th}>시도 대비</th><th style={th}>도달자 대비</th><th style={th}>미도달</th></tr></thead>
              <tbody>
                {m.levels.slice(0, 20).map((l) => (
                  <tr key={l.level} style={l.level === rep.wall?.level.level ? { background: "#FBE9E7" } : undefined}>
                    <td style={{ ...td, textAlign: "left" }}>{l.level}</td><td style={td}>{num(l.reached)}</td><td style={td}>{pct(l.attemptClear.rate)}</td><td style={td}>{pct(l.reachClear.rate)}</td><td style={td}>{pct(l.stuck.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      </details>

      <p style={{ margin: "28px 0 0", fontSize: 13, lineHeight: 1.7, color: "var(--muted)" }}>
        모든 숫자는 이 브라우저에서 코드로 계산했습니다. {sourceNote}
        {" "}
        {useAi
          ? "요약과 개선안 문장은 AI가 계산 결과만 보고 썼고, 계산 결과에 없는 숫자가 들어간 답은 코드가 걸러 냈습니다."
          : "요약과 개선안 문장은 계산 결과에 규칙을 적용해 만든 해석입니다."}
      </p>
    </div>
  );
}
