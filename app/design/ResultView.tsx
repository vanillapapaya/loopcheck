"use client";

import { useState } from "react";
import type { DesignResult } from "@/lib/types";

type Tab = "events" | "kpis" | "ab" | "ddl";

const TABS: { id: Tab; label: string }[] = [
  { id: "events", label: "이벤트 스키마" },
  { id: "kpis", label: "KPI 정의서" },
  { id: "ab", label: "A/B 설계안" },
  { id: "ddl", label: "SQL DDL" },
];

function Badge({ priority }: { priority: string }) {
  const must = priority === "must";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 3,
        whiteSpace: "nowrap",
        background: must ? "var(--ink)" : "transparent",
        color: must ? "var(--surface)" : "var(--ink-2)",
        border: must ? "1px solid var(--ink)" : "1px solid var(--line-3)",
      }}
    >
      {priority}
    </span>
  );
}

export default function ResultView({ data, label, source }: { data: DesignResult; label: string; source?: string }) {
  const [tab, setTab] = useState<Tab>("events");
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loopcheck-schema-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyDdl() {
    try {
      await navigator.clipboard.writeText(data.sql_ddl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22 }}>
        <div style={{ maxWidth: 760 }}>
          <div className="eyebrow" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            지표 설계 결과
            {source && <span className="mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0, padding: "2px 7px", border: "1px solid var(--line-3)", borderRadius: 3, color: "var(--ink-2)" }}>{source}</span>}
          </div>
          <h2 style={{ fontSize: 27, fontWeight: 600, marginBottom: 10 }}>{label}</h2>
          <p style={{ fontSize: 15, color: "var(--ink-2)", margin: 0, lineHeight: 1.7 }}>{data.game_summary}</p>
        </div>
        <div style={{ display: "flex", gap: 28 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 3 }}>이벤트</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{data.events.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 3 }}>KPI</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{data.kpis.length}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <button className="btn" style={{ height: 42, fontSize: 14 }} onClick={download}>
          JSON 내려받기
        </button>
        <button className="btn-ghost" style={{ height: 42, fontSize: 14 }} onClick={copyDdl}>
          {copied ? "복사했습니다" : "DDL 복사"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "11px 16px",
              fontSize: 14,
              fontFamily: "var(--sans)",
              whiteSpace: "nowrap",
              background: "none",
              cursor: "pointer",
              color: tab === t.id ? "var(--ink)" : "var(--ink-2)",
              fontWeight: tab === t.id ? 600 : 400,
              border: "none",
              borderBottom: tab === t.id ? "2px solid var(--ink)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ paddingTop: 22 }}>
        {tab === "events" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 20, alignItems: "start" }} className="two-col">
            <div className="card" style={{ overflow: "hidden" }}>
              {data.events.map((e, i) => (
                <div key={e.name} style={{ padding: "16px 22px", borderBottom: i === data.events.length - 1 ? "none" : "1px solid var(--line-2)" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</span>
                    <Badge priority={e.priority} />
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--ink-2)", marginBottom: 10 }}>{e.why}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {e.properties.map((p) => (
                      <span key={p.name} className="mono" title={p.note}
                        style={{ fontSize: 11, padding: "3px 7px", background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 3, color: "var(--ink-2)" }}>
                        {p.name}
                        <span style={{ color: "var(--muted)" }}>:{p.type}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ padding: "20px 22px" }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>유저 고정 속성</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {data.user_properties.map((p) => (
                    <span key={p.name} className="mono" title={p.note}
                      style={{ fontSize: 11, padding: "3px 7px", background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 3, color: "var(--ink-2)" }}>
                      {p.name}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
                  이벤트마다 반복하지 말고 유저 테이블에만 두세요. 조인으로 동일하게 얻습니다.
                </div>
              </div>

              <div className="card" style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6" /><path d="M9 9l6 6" />
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>지금은 찍지 마세요</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.do_not_track.map((d, i) => (
                    <div key={i} style={{ fontSize: 12, lineHeight: 1.65, color: "var(--ink-2)" }}>{d}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "kpis" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
            {data.kpis.map((k) => (
              <div key={k.name} className="card" style={{ padding: "22px 24px" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{k.name}</h3>
                <div className="mono" style={{ fontSize: 12, lineHeight: 1.7, color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 4, padding: "10px 12px", marginBottom: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {k.formula}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", marginBottom: 12 }}>{k.why_this_game}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B5822A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 3, flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 17h.01" />
                  </svg>
                  <div style={{ fontSize: 12, lineHeight: 1.7, color: "var(--ink-2)" }}>{k.watch_out}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "ab" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, alignItems: "start" }}>
            <div style={{ background: "var(--ink)", color: "var(--bg)", borderRadius: 6, padding: "26px 28px" }}>
              <div className="eyebrow" style={{ color: "#A79E90", marginBottom: 12 }}>가설</div>
              <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.6, marginBottom: 20 }}>{data.ab_test.hypothesis}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#A79E90" }}>1차 지표</span>
                  <span style={{ textAlign: "right" }}>{data.ab_test.primary_metric}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#A79E90" }}>배정 단위</span>
                  <span style={{ textAlign: "right" }}>{data.ab_test.unit}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#A79E90" }}>최소 기간</span>
                  <span>{data.ab_test.min_duration_days}일</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ padding: "22px 24px" }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>가드레일 지표</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {data.ab_test.guardrail_metrics.map((g, i) => (
                    <div key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>{g}</div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
                  이 중 하나라도 악화되면 1차 지표가 올라도 실험을 중단하세요.
                </div>
              </div>
              <div className="card" style={{ padding: "22px 24px" }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>표본 크기</div>
                <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{data.ab_test.sample_size_note}</div>
              </div>
            </div>
          </div>
        )}

        {tab === "ddl" && (
          <pre className="mono" style={{ margin: 0, padding: 24, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, lineHeight: 1.75, overflowX: "auto", color: "var(--ink)" }}>
            {data.sql_ddl}
          </pre>
        )}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .two-col { grid-template-columns: minmax(0, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
