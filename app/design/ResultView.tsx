"use client";

import { useState } from "react";
import type { DesignResult } from "@/lib/types";

type Tab = "events" | "kpis" | "ab" | "ddl";

const TABS: { id: Tab; label: string }[] = [
  { id: "events", label: "이벤트 스키마" },
  { id: "kpis", label: "KPI 정의서" },
  { id: "ab", label: "첫 검증 설계" },
  { id: "ddl", label: "SQL DDL" },
];

const PRIORITY_LABEL: Record<string, string> = { must: "필수", should: "추천" };

function Badge({ priority }: { priority: string }) {
  const must = priority === "must";
  const label = PRIORITY_LABEL[priority] ?? priority;
  return (
    <span style={{ fontSize: 12, whiteSpace: "nowrap", color: must ? "var(--ink)" : "var(--muted)", fontWeight: must ? 600 : 400 }}>
      {label}
    </span>
  );
}

export default function ResultView({ data, label, source }: { data: DesignResult; label: string; source?: string }) {
  const [tab, setTab] = useState<Tab>("events");
  const [copied, setCopied] = useState(false);

  /** 엑셀에서 바로 열리는 컬럼 명세서. 한글이 깨지지 않게 BOM을 붙인다 */
  function downloadSpec() {
    const cell = (v: string | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["구분", "이벤트", "우선순위", "컬럼", "타입", "설명"]];
    for (const e of data.events) {
      for (const p of e.properties) rows.push(["이벤트", e.name, e.priority === "must" ? "필수" : "추천", p.name, p.type, p.note ?? ""]);
    }
    for (const p of data.user_properties) rows.push(["유저 속성", "users", "필수", p.name, p.type, p.note ?? ""]);
    const csv = "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `loopcheck-스키마-명세서-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
            {source && <span className="mono" style={{ fontSize: 12, fontWeight: 500, letterSpacing: 0, color: "var(--muted)" }}>{source}</span>}
          </div>
          <h2 style={{ fontSize: "clamp(24px, 3.2vw, 28px)", fontWeight: 600, marginBottom: 12 }}>{label}</h2>
          <p style={{ fontSize: 15, color: "var(--ink-2)", margin: 0, lineHeight: 1.7 }}>{data.game_summary}</p>
        </div>
        <div style={{ display: "flex", gap: 28 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 3 }}>이벤트</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{data.events.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 3 }}>KPI</div>
            <div className="mono" style={{ fontSize: 20, fontWeight: 600 }}>{data.kpis.length}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <button className="btn" style={{ height: 42, fontSize: 14 }} onClick={download}>
          JSON 내려받기
        </button>
        <button className="btn-ghost" style={{ height: 42, fontSize: 14 }} onClick={downloadSpec}>
          명세서 CSV
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
          <div className="two-col">
            <div className="tile" style={{ overflow: "hidden" }}>
              {data.events.map((e, i) => (
                <div key={`${i}-${e.name}`} style={{ padding: "16px 22px", borderBottom: i === data.events.length - 1 ? "none" : "1px solid var(--line-2)" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</span>
                    <Badge priority={e.priority} />
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--ink-2)", marginBottom: 8 }}>{e.role}</div>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10, fontSize: 12, lineHeight: 1.6 }}>
                    <span style={{ flexShrink: 0, color: "var(--muted)" }}>쓰이는 지표</span>
                    <span style={{ color: "var(--ink-2)" }}>{e.used_for.join(", ")}</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <tbody>
                        {e.properties.map((p, j) => (
                          <tr key={`${j}-${p.name}`} style={{ borderTop: "1px solid var(--line-2)" }}>
                            <td className="mono" style={{ padding: "6px 10px 6px 0", verticalAlign: "top", whiteSpace: "nowrap" }}>{p.name}</td>
                            <td className="mono" style={{ padding: "6px 12px 6px 0", verticalAlign: "top", whiteSpace: "nowrap", color: "var(--muted)" }}>{p.type}</td>
                            <td style={{ padding: "6px 0", verticalAlign: "top", lineHeight: 1.6, color: "var(--ink-2)" }}>{p.note ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            <div className="aside" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>유저 고정 속성</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.user_properties.map((p, j) => (
                    <div key={`${j}-${p.name}`}>
                      <span className="mono" style={{ fontSize: 12, color: "var(--ink)" }}>{p.name}</span>
                      <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}> {p.type}</span>
                      {p.note && <div style={{ lineHeight: 1.6 }}>{p.note}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
                  이벤트마다 반복하지 말고 유저 테이블에만 두세요. 조인으로 동일하게 얻습니다.
                </div>
              </div>

              <div style={{ paddingTop: 18, borderTop: "1px solid var(--line)" }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>주의사항</div>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16 }}>
            {data.kpis.map((k) => (
              <div key={k.name} className="card" style={{ padding: "22px 24px" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{k.name}</h3>
                <div className="mono" style={{ fontSize: 12, lineHeight: 1.7, color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 2, padding: "10px 12px", marginBottom: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {k.formula}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", marginBottom: 12 }}>{k.why_this_game}</div>
                <div style={{ display: "flex", gap: 10, paddingTop: 12, borderTop: "1px solid var(--line-2)" }}>
                  <span style={{ flexShrink: 0, fontSize: 12, color: "var(--muted)" }}>주의</span>
                  <span style={{ fontSize: 12, lineHeight: 1.7, color: "var(--ink-2)" }}>{k.watch_out}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "ab" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16, alignItems: "start" }}>
            <div style={{ background: "var(--ink)", color: "var(--bg)", borderRadius: 2, padding: "26px 28px" }}>
              <div className="eyebrow" style={{ color: "var(--on-ink)", marginBottom: 12 }}>가설</div>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.7, marginBottom: 20 }}>{data.ab_test.hypothesis}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "var(--on-ink)" }}>1차 지표</span>
                  <span style={{ textAlign: "right" }}>{data.ab_test.primary_metric}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "var(--on-ink)" }}>비교 방식</span>
                  <span style={{ textAlign: "right" }}>{data.ab_test.unit}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "var(--on-ink)" }}>관측 기간</span>
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
                  이 중 하나라도 악화되면 1차 지표가 올라도 변경을 되돌리세요.
                </div>
              </div>
              <div className="card" style={{ padding: "22px 24px" }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>표본과 기간 계획</div>
                <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{data.ab_test.sample_size_note}</div>
              </div>
            </div>
          </div>
        )}

        {tab === "ddl" && (
          <pre className="mono" style={{ margin: 0, padding: 24, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 2, fontSize: 12, lineHeight: 1.75, overflowX: "auto", color: "var(--ink)" }}>
            {data.sql_ddl}
          </pre>
        )}
      </div>

    </div>
  );
}
