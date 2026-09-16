"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DiagnosisMetrics } from "@/lib/diagnose/engine";
import { buildReport, num, pct, won } from "@/lib/diagnose/findings";
import { buildFacts, type AiReport } from "@/lib/diagnose/interpret";
import type { Design } from "@/lib/diagnose/experiment";
import { ChannelChart, DeviceChart, Legend, LevelChart, MiniColumns, RetentionChart, adItems } from "./charts";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/**
 * 산문만 사람이 고칠 수 있게 여는 장치. 숫자·표·차트는 잠근다.
 * 고친 값은 blur 때 평문으로 받아 두고, 다시 그릴 때 방향 색을 입혀 보여준다.
 */
type EditApi = {
  on: boolean;
  get: (id: string, original: string) => string;
  props: (id: string, original: string) => React.HTMLAttributes<HTMLElement>;
};

/** 해석 방식 전환. 리포트 본문이 아니라 그 위에 두는 조작부다 */
function InterpretBar({ ai, useAi, onPick, edit, onEdit, edited }: { ai: Ai; useAi: boolean; onPick: (rules: boolean) => void; edit: boolean; onEdit: (v: boolean) => void; edited: boolean }) {
  const seg = (on: boolean): React.CSSProperties => ({
    padding: "6px 14px", fontFamily: "var(--sans)", fontSize: 13, lineHeight: 1.4, cursor: "pointer",
    border: "none", background: on ? "var(--ink)" : "transparent", color: on ? "var(--bg)" : "var(--ink-2)", fontWeight: on ? 600 : 400,
  });
  const note =
    ai.status === "loading" ? "AI 해석을 받는 중입니다. 지금 보이는 것은 규칙 기반 해석입니다"
    : ai.status === "failed" ? `${ai.message}. 규칙 기반 해석을 보여 드립니다`
    : useAi ? "AI가 계산 결과를 보고 쓴 해석입니다"
    : "계산 결과에 규칙을 적용해 만든 해석입니다";
  return (
    <div className="no-print" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 16px", marginBottom: 20, padding: "10px 14px", border: "1px solid var(--line-3)", background: "var(--surface-2)" }}>
      <span className="eyebrow">해석 방식</span>
      <div role="group" aria-label="해석 방식" style={{ display: "flex", border: "1px solid var(--line-3)", background: "var(--bg)" }}>
        <button type="button" aria-pressed={useAi} disabled={ai.status !== "done"} onClick={() => onPick(false)}
          style={{ ...seg(useAi), opacity: ai.status === "done" ? 1 : 0.45, cursor: ai.status === "done" ? "pointer" : "default" }}>
          AI 해석
        </button>
        <button type="button" aria-pressed={!useAi} onClick={() => onPick(true)} style={seg(!useAi)}>규칙 기반</button>
      </div>
      <span role="status" style={{ fontSize: 12, color: "var(--muted)", flexGrow: 1, minWidth: 180 }}>
        {edit ? "요약과 제안 문장을 눌러 고칠 수 있습니다. 숫자와 표는 잠겨 있습니다" : note}
      </span>
      <button className="btn-ghost" aria-pressed={edit} onClick={() => onEdit(!edit)}
        style={{ height: 34, fontSize: 13, ...(edit ? { borderColor: "var(--ink)", background: "var(--ink)", color: "var(--bg)" } : null) }}>
        {edit ? "고치기 끝내기" : "문장 고치기"}
      </button>
      <button className="btn-ghost" onClick={() => window.print()} style={{ height: 34, fontSize: 13 }}>PDF로 저장{edited ? " (수정본)" : ""}</button>
    </div>
  );
}

/**
 * 수치의 방향을 색으로 한 번 더 보여준다. 감소·하락은 빨강, 증가·상승은 초록.
 * 색만으로 의미를 전하지 않도록 방향을 가리키는 단어까지 함께 감싼다.
 */
const TONE = /(\d[\d,.]*\s*(?:%p|%|명|건|원|분|일|회|배)?[^\d.,·\n]{0,6}?(?:감소|하락|낮아|낮고|낮음|낮습니다|증가|상승|개선|올리|올라|늘리|늘어|회복))/g;
const down = (t: string) => /감소|하락|낮/.test(t);
const mark: React.CSSProperties = { fontWeight: 600, padding: "1px 3px", borderRadius: 2, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" };
const DOWN: React.CSSProperties = { ...mark, color: "var(--danger)", background: "var(--danger-bg)" };
const UP: React.CSSProperties = { ...mark, color: "var(--good)", background: "var(--good-bg)" };
function Tone({ text }: { text: string }) {
  const parts = text.split(TONE);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 0 ? p : (
          <span key={i} style={down(p) ? DOWN : UP}>{p}</span>
        ),
      )}
    </>
  );
}

/** 요약을 문장 단위로 끊어 세 줄 안에 담는다 */
function summaryLines(text: string): string[] {
  const parts = text.split(/(?<=[다요]\.)\s+/).map((t) => t.trim()).filter(Boolean);
  return parts.length <= 3 ? parts : [parts[0], parts[1], parts.slice(2).join(" ")];
}

/** 절 제목. 요약·제안 사항·분석 내용이 같은 양식을 쓴다 */
function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingTop: 18, borderTop: "2px solid var(--ink)", marginBottom: 14 }}>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 17, fontWeight: 600 }}>{title}</h2>
      {note && <span style={{ fontSize: 12, color: "var(--muted)" }}>{note}</span>}
    </div>
  );
}

type CardFinding = {
  title: string; body: string; tag?: string | null;
  evidence: { label: string; text: string }[];
  options?: { label: string; detail: string }[];
  preference?: string | null;
  design?: Design;
};

/** 유저를 나누지 않고 효과를 확인하는 설계. 숫자는 전부 코드가 계산한 값이다. */
function DesignBlock({ d }: { d: Design }) {
  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
      <span style={{ width: 66, flexShrink: 0, fontSize: 12, color: "var(--muted)" }}>{label}</span>
      <span style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>{value}</span>
    </div>
  );
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-2)" }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>검증 설계 (유저를 나누지 않는 비교)</div>
      {row("판정", <>
        이 규모에서 {d.feasible ? "확인 가능" : "확인 어려움"}. 검출 가능한 최소 효과 <span className="mono">{d.mdePp.toFixed(1)}%p</span>
      </>)}
      {row("개입", d.intervention)}
      {row("비교", <>
        {d.treated.label} <span className="mono">{num(d.treated.users)}</span>
        <span style={{ color: "var(--muted)" }}> ↔ </span>
        {d.control.label} <span className="mono">{num(d.control.users)}</span>
      </>)}
      {row("지표", d.outcome)}
      {row("기간", <>변경 전후 각 <span className="mono">{d.daysPerPeriod}</span>일</>)}
      {row("사전 점검", d.precheck)}
      {row("교란 요인", d.confounders)}
      {!d.feasible && d.fallback && row("대안", d.fallback)}
    </div>
  );
}

function FindingCard({ f, rank, ed }: { f: CardFinding; rank: number; ed: EditApi }) {
  const id = (part: string) => `f${rank}.${part}`;
  return (
    <div className="card" style={{ padding: "26px 0 4px" }}>
      <div style={{ display: "flex", gap: 16 }}>
        <div aria-label={`${rank}순위`} className="mono" style={{ width: 28, flexShrink: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.7, color: rank === 1 ? "var(--danger)" : "var(--ink-2)" }}>
          {String(rank).padStart(2, "0")}
        </div>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px", marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.6 }} {...ed.props(id("title"), f.title)}>{ed.get(id("title"), f.title)}</h3>
            {f.tag && <span style={{ fontSize: 12, color: "var(--danger-ink)" }}>({f.tag})</span>}
          </div>
          <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.75, color: "var(--ink-2)", maxWidth: 940 }} {...ed.props(id("body"), f.body)}><Tone text={ed.get(id("body"), f.body)} /></p>
          {!!f.options?.length && (
            <div style={{ marginBottom: 16, paddingLeft: 2 }}>
              {f.options.map((o, i) => (
                <div key={`${i}-${o.label}`} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.7 }}>{o.label}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", paddingLeft: 12 }}>- <Tone text={o.detail} /></div>
                </div>
              ))}
              {f.preference && <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink)", marginTop: 10 }} {...ed.props(id("pref"), f.preference)}>{ed.get(id("pref"), f.preference)}</div>}
            </div>
          )}
          {f.design && <DesignBlock d={f.design} />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, paddingTop: 14, marginTop: 14, borderTop: "1px solid var(--line-2)" }}>
            {f.evidence.map((e, i) => (
              <div key={`${i}-${e.label}`}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{e.label}</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}><Tone text={e.text} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 그림 하나. 번호와 제목을 위에 두고 정의 각주를 아래에 단다 */
function Figure({ n, title, note, sub, children }: { n: number; title: string; note?: string; sub?: string; children: React.ReactNode }) {
  return (
    <figure style={{ margin: 0, minWidth: 0, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div>
          <span className="figure-num">[ 그림 {n} ]</span>
          <span className="figure-title">{title}</span>
        </div>
        {note && <span style={{ fontSize: 12, color: "var(--muted)" }}>{note}</span>}
      </div>
      <div style={{ overflowX: "auto" }}>{children}</div>
      {sub && <figcaption style={{ marginTop: 10, fontSize: 12, lineHeight: 1.6, color: "var(--muted)" }}>{sub}</figcaption>}
    </figure>
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
  const [edit, setEdit] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const edited = Object.keys(edits).length > 0;
  const ed: EditApi = {
    on: edit,
    get: (id, original) => edits[id] ?? original,
    props: (id, original) => {
      if (!edit) return {};
      return {
        contentEditable: true,
        suppressContentEditableWarning: true,
        spellCheck: false,
        className: "editable",
        onBlur: (e: React.FocusEvent<HTMLElement>) => {
          const v = e.currentTarget.innerText.replace(/\s+/g, " ").trim();
          setEdits((prev) => {
            const next = { ...prev };
            if (!v || v === original.replace(/\s+/g, " ").trim()) delete next[id];
            else next[id] = v;
            return next;
          });
        },
      };
    },
  };

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
  // 설계의 숫자는 AI 해석일 때도 코드가 계산한 값을 그대로 쓴다
  const designs = new Map(rep.findings.map((f) => [f.id as string, f.design]));
  const findings: CardFinding[] = useAi
    ? ai.report.findings.map((f) => ({ ...f, design: designs.get(f.basis) }))
    : rep.findings;
  const d1 = m.retention.find((r) => r.day === 1)?.r;
  const d7 = m.retention.find((r) => r.day === 7)?.r;
  const fixed = m.ads.fixedDay;
  const worstChannel = rep.findings.find((f) => f.id === "channel_quality") ? [...m.segments.channel].sort((a, b) => a.d7.rate - b.d7.rate)[0].key : null;
  const fp = m.monetization.firstPurchaseLevel[0];

  return (
    <div>
      <InterpretBar ai={ai} useAi={useAi} onPick={(rules) => setShowRules(rules)} edit={edit} onEdit={setEdit} edited={edited} />

      {/* 리포트 머리 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 26, borderBottom: "1px solid var(--line)" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>진단 리포트</div>
          <h1 style={{ fontSize: "clamp(24px, 3.2vw, 28px)", fontWeight: 600, marginBottom: 10 }}>{title}</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 13, color: "var(--ink-2)" }}>
            <span className="mono">{m.meta.obsStart} - {m.meta.obsEnd}</span>
            <span>설치 <span className="mono">{num(m.meta.users)}</span>명</span>
            <span>레벨 시도 <span className="mono">{num(m.meta.attempts)}</span>건</span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-end" }}>
          {d1 && <Stat label="D1" value={pct(d1.rate)} />}
          {d7 && <Stat label="D7" value={pct(d7.rate)} />}
          {m.meta.purchases > 0 && <Stat label="결제 전환" value={pct(m.monetization.payers.rate)} />}
          {m.meta.purchases > 0 && <Stat label="설치당 매출" value={won(m.monetization.revenueKrw / Math.max(1, m.meta.users))} />}
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 30 }}>
      <div>
      {/* 요약 */}
      <SectionHead title="요약" />
      <ul className="prose" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {summaryLines(summary).map((line, i) => (
          <li key={i} style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.8 }}>
            <span aria-hidden style={{ color: "var(--muted)", flexShrink: 0 }}>-</span>
            <span {...ed.props(`summary.${i}`, line)}><Tone text={ed.get(`summary.${i}`, line)} /></span>
          </li>
        ))}
      </ul>

      {/* 제안 사항 */}
      <div style={{ marginTop: 40 }}><SectionHead title="제안 사항" note="영향 유저 수가 많은 순" /></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {findings.map((f, i) => <FindingCard key={`${useAi ? "ai" : "rule"}-${i}`} f={f} rank={i + 1} ed={ed} />)}
        {!findings.length && <div className="card" style={{ padding: 24, fontSize: 14, color: "var(--ink-2)" }}>규칙으로 잡히는 뚜렷한 이상 신호가 없습니다.</div>}
      </div>

      {/* 분석 내용 */}
      <div style={{ marginTop: 44 }}><SectionHead title="분석 내용" note="계산 기준은 각 그림의 각주" /></div>
      <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.8, color: "var(--ink-2)", maxWidth: 940 }}>
        위 제안의 근거가 된 계산 결과입니다. 그림마다 분모와 집계 기준을 각주로 달았고, 규칙 해석과 AI 해석 모두 여기 있는 숫자만 참조합니다.
        표본이 {num(100)} 미만인 구간은 결론 대신 단서로만 다뤘습니다.
      </p>

      <div style={grid2}>
        <Figure n={1} title="코호트 리텐션" note="classic N-day" sub="※ 리텐션 : classic N-day 기준. 설치 후 N일째 접속 여부로 집계하며, 분모는 N일째가 관측 기간 안에 들어온 유저만 포함">
          <RetentionChart m={m} />
        </Figure>
        {m.levels.length > 0 && <Figure n={2} title="레벨별 클리어율" note="레벨 1-20" sub="※ 시도 대비 : 분모는 해당 레벨의 시도 수, 도달자 대비 : 분모는 해당 레벨 도달 유저 수. 두 값이 벌어지는 레벨이 재도전 구간">
          <Legend items={[
            { label: "시도 대비 (분모: 시도 수)", swatch: "bar", color: "var(--series)" },
            { label: "도달자 대비 (분모: 도달 유저)", swatch: "line", color: "var(--ink-2)" },
          ]} />
          <LevelChart levels={m.levels} wallLevel={rep.wall?.level.level ?? null} />
        </Figure>}
      </div>

      <div style={grid2}>
        {m.segments.channel.length > 1 && <Figure n={3} title="획득 채널별 D7 리텐션" sub="※ D7 잔존·D1 잔존 : 분모는 해당 채널의 설치 유저. 설치 비중 : 분모는 전체 설치 유저. 막대 길이는 D7 잔존 기준">
          <ChannelChart channels={m.segments.channel} worstKey={worstChannel} />
        </Figure>}
        {m.segments.deviceTier.length > 1 && <Figure n={4} title="기기 등급별 평균 세션 길이" sub="※ 세션 길이 : 세션당 평균 분. D1 잔존 : 분모는 해당 등급의 설치 유저. 설치 비중 : 분모는 전체 설치 유저. 세 수치의 분모가 서로 다름">
          <DeviceChart tiers={m.segments.deviceTier} />
        </Figure>}
      </div>

      {/* 광고 트랩 */}
      {rep.ads && (
        <div className="card" style={{ padding: "24px 26px", marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>[ 광고 빈도 ]</h3>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-2)" }}>집계 방식이 결론을 뒤집는 구간입니다.</p>
          <p style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", maxWidth: 1000 }}>
            누적 시청량으로 보면 광고를 많이 볼수록 잔존이 높아 보입니다. 오래 남은 유저일수록 시청 누적량이 커지는 구조라, 누적량은 잔존의 원인이 아니라 결과입니다.
            경과일을 고정하고 당일 시청 수 대비 익일 접속으로 다시 집계하면 방향이 달라집니다.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 20 }}>
            <div style={{ padding: 18, border: "1px solid var(--line-2)", borderRadius: 2, background: "var(--surface-2)" }}>
              <span className="eyebrow" style={{ color: "var(--ink-2)" }}>보정 전 · 생존 편향 포함</span>
              <div style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 10px" }}>누적 광고 시청 수 대비 D7 리텐션</div>
              <div style={{ overflowX: "auto" }}><MiniColumns color="var(--line-3)"
                items={m.ads.naiveCumulativeD7.map((b) => ({ label: b.label.replace("회 이상", "+").replace("회", ""), r: b.d7 }))}
                caption="관측 기간이 긴 유저일수록 누적 시청 수가 커져, 잔존의 결과가 원인처럼 읽히는 집계" /></div>
            </div>
            <div style={{ padding: 18, border: "1px solid var(--line)", borderRadius: 2 }}>
              <span className="eyebrow" style={{ color: "var(--ink)" }}>보정 후 · 경과일 고정</span>
              <div style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 10px" }}>경과 {fixed.dayFrom}-{fixed.dayTo}일 고정 · 당일 시청 수 대비 익일 접속</div>
              <div style={{ overflowX: "auto" }}><MiniColumns color="var(--series)" items={adItems(fixed.buckets)} emphasize={rep.ads.peakLabel}
                caption={`${rep.ads.peakLabel} 정점${rep.ads.declinesAfterPeak ? `, ${rep.ads.last.label}에서 반전` : ""}. 관측 시점을 맞춰 노출량과 잔존의 관계만 남긴 집계`} /></div>
            </div>
          </div>
          {rep.ads.last.lowSample && (
            <p style={{ margin: "16px 0 0", paddingTop: 12, borderTop: "1px solid var(--line-2)", fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>
              ※ 단 {rep.ads.last.label} 구간은 n이 {num(rep.ads.last.n)}로 결론을 내리기에 부족합니다. 상한을 조정하기 전에 표본을 더 쌓아 보시면 좋겠습니다.
              흐린 막대가 n {num(100)} 미만 구간입니다.
            </p>
          )}
        </div>
      )}

      {/* 수익화 */}
      <div className="card" style={{ padding: "24px 26px", marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>[ 수익화 ]</h3>
        <p style={{ margin: "0 0 20px", fontSize: 12, color: "var(--muted)" }}>
          {m.meta.purchases ? "※ 결제 전환율 : 분모는 설치 유저 수. ARPPU : 분모는 결제자 수" : "※ 결제 데이터 미포함으로 수익화 수치 계산 제외"}
        </p>
        {m.meta.purchases > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>결제자</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{num(m.monetization.payers.num)}명</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>설치 대비 <span className="mono">{pct(m.monetization.payers.rate, 2)}</span></div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>총 매출</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{won(m.monetization.revenueKrw)}</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>관측 기간 누적</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>ARPPU</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{m.monetization.arppuKrw != null ? won(m.monetization.arppuKrw) : "-"}</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>결제자 1인당</div>
          </div>
          {fp && (
            <div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>첫 결제가 가장 많은 레벨</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>레벨 {fp.level}</div>
              <div style={{ fontSize: 12, color: "var(--ink-2)" }}><span className="mono">{num(fp.count)}</span>건 · 레벨 중 1위{rep.wall?.conflict ? " · 최대 정체 레벨과 같음" : ""}</div>
            </div>
          )}
        </div>}
        {m.meta.attempts > 0 && m.meta.purchases > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 24, marginTop: 22, paddingTop: 20, borderTop: "1px solid var(--line-2)", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>연속 실패 수별, 실패 직후 결제 비율</div>
            <div style={{ overflowX: "auto" }}><MiniColumns color="var(--series)" max={Math.max(...m.monetization.buyAfterFailStreak.map((s) => s.r.rate)) * 1.25 || 1} digits={2}
              items={m.monetization.buyAfterFailStreak.map((s) => ({ label: s.streak === 5 ? "5회+" : `${s.streak}회`, r: s.r }))}
              caption="분모는 해당 연속 실패 수에 이른 실패 시도. 세션 안 기준, 단위 %" /></div>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75, color: "var(--ink-2)" }}>
            {rep.streakRises
              ? "연속 실패가 쌓일수록 실패 직후 결제 비율이 올라갑니다. 좌절이 결제 트리거로 작동하고 있다는 뜻이고, 그래서 난이도 조정은 매출 가드레일을 달고 진행해야 합니다."
              : "연속 실패 수와 결제 비율 사이에 뚜렷한 증가 경향은 보이지 않습니다."}
          </p>
        </div>}
      </div>

      {/* 표 보기 */}
      <details className="card" style={{ padding: "18px 24px" }}>
        <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>계산 근거 표로 보기 (부록)</summary>
        <div className="no-print" style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>PDF로 저장하면 이 표도 함께 들어갑니다.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 24, marginTop: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <caption style={{ textAlign: "left", fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>[ 리텐션 ]</caption>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>일</th><th style={th}>잔존</th><th style={th}>분모</th><th style={th}>비율</th><th style={th}>95% 구간</th></tr></thead>
              <tbody>
                {m.retention.map(({ day, r }) => (
                  <tr key={day}><td style={{ ...td, textAlign: "left" }}>D{day}</td><td style={td}>{num(r.num)}</td><td style={td}>{num(r.den)}</td><td style={td}>{pct(r.rate)}</td><td style={td}>{pct(r.lo)}-{pct(r.hi)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.levels.length > 0 && <div style={{ overflowX: "auto" }}>
            <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <caption style={{ textAlign: "left", fontFamily: "var(--sans)", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>[ 레벨 1-20 ]</caption>
              <thead><tr><th style={{ ...th, textAlign: "left" }}>레벨</th><th style={th}>도달</th><th style={th}>시도 대비</th><th style={th}>도달자 대비</th><th style={th}>미도달</th></tr></thead>
              <tbody>
                {m.levels.slice(0, 20).map((l) => (
                  <tr key={l.level} style={l.level === rep.wall?.level.level ? { background: "var(--danger-bg)" } : undefined}>
                    <td style={{ ...td, textAlign: "left" }}>{l.level}</td><td style={td}>{num(l.reached)}</td><td style={td}>{pct(l.attemptClear.rate)}</td><td style={td}>{pct(l.reachClear.rate)}</td><td style={td}>{pct(l.stuck.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      </details>

      </div>

      <aside className="aside">
        <div className="eyebrow" style={{ marginBottom: 12 }}>계산 기준</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>리텐션 : classic N-day. 분모는 N일째가 관측 기간 안에 들어온 유저만 포함</div>
          {m.levels.length > 0 && <div>레벨 이탈 : 레벨 N 도달자 중 N+1 미진입</div>}
          {m.meta.purchases > 0 && <div>결제 전환율 : 분모는 설치 유저 수. ARPPU : 분모는 결제자 수</div>}
          {m.meta.adViews > 0 && <div>광고 : 경과 {fixed.dayFrom}-{fixed.dayTo}일 고정, 당일 시청 수 대비 익일 접속</div>}
          <div>비율에는 95% 신뢰구간을 붙였고, 표본 {num(100)} 미만 구간은 표본 부족으로 표시</div>
        </div>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>계산하지 않은 것</div>
          <div>
            결제 퍼널(노출 → 클릭 → 구매) : 오퍼 노출·클릭 로그 미포함으로 계산 제외.{" "}
            <Link href="/design">지표 설계기</Link>의 오퍼 노출·구매 단계 이벤트를 쌓으면 다음 진단부터 확인 가능
          </div>
        </div>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>검증 방식</div>
          <div>유저를 나누는 A/B 대신, 전원에게 같은 변경을 적용하고 영향군과 비교군의 변화량 차이로 확인. 난이도·가격·보상을 유저마다 다르게 주지 않는다</div>
        </div>
      </aside>
      </div>

      {/* 판권. 무엇을 어떻게 만들었는지 명사형으로 짧게 */}
      <div style={{ marginTop: 36, paddingTop: 14, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 6, fontSize: 12, lineHeight: 1.7, color: "var(--muted)" }}>
        <div style={{ display: "flex", gap: 12 }}><span style={{ width: 34, flexShrink: 0 }}>계산</span><span>{sourceNote}</span></div>
        <div style={{ display: "flex", gap: 12 }}><span style={{ width: 34, flexShrink: 0 }}>해석</span><span>
          {useAi
            ? <>AI가 집계 수치를 보고 작성(<span className="mono">{ai.status === "done" ? ai.model : ""}</span>). 계산 결과에 없는 숫자가 섞인 답은 코드가 반려</>
            : "계산 결과에 규칙을 적용한 해석. AI가 쓴 문장 없음"}
        </span></div>
        {edited && <div style={{ display: "flex", gap: 12 }}><span style={{ width: 34, flexShrink: 0 }}>수정</span><span>
          요약과 제안 문장 <span className="mono">{Object.keys(edits).length}</span>곳을 사람이 직접 고침. 숫자·표·차트는 계산값 그대로
        </span></div>}
      </div>
    </div>
  );
}
