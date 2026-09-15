"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import ResultView from "./ResultView";
import { PRESETS, type DesignResult, type Preset } from "@/lib/types";

export default function DesignPage() {
  const [result, setResult] = useState<DesignResult | null>(null);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPreset(p: Preset) {
    setLoading(p.id);
    setError(null);
    try {
      const res = await fetch(`/presets/${p.id}.json`);
      if (!res.ok) throw new Error("불러오지 못했습니다");
      const data: DesignResult = await res.json();
      setResult(data);
      setLabel(`${p.genre} · ${p.stage}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("스키마를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <Header
        right={
          result ? (
            <button className="btn-ghost" style={{ height: 38, fontSize: 14 }} onClick={() => setResult(null)}>
              다른 장르 보기
            </button>
          ) : (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>저장되지 않습니다 · 회원가입 불필요</span>
          )
        }
      />

      <main className="wrap" style={{ paddingTop: 36, paddingBottom: 80 }}>
        {result ? (
          <ResultView data={result} label={label} />
        ) : (
          <>
            <div style={{ maxWidth: 640, marginBottom: 32 }}>
              <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 12 }}>어떤 게임인가요</h1>
              <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.75, margin: 0 }}>
                장르를 고르면 그 장르의 핵심 루프에 맞춘 이벤트 스키마, KPI 정의서, 첫 A/B 설계안이
                바로 나옵니다. 내려받아 그대로 쓰시면 됩니다.
              </p>
            </div>

            {error && (
              <div style={{ marginBottom: 20, padding: "14px 18px", background: "#FBE9E7", border: "1px solid #F2CFC9", borderRadius: 4, fontSize: 14, color: "var(--danger-ink)" }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 40 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p)}
                  disabled={loading !== null}
                  className="card"
                  style={{
                    padding: "24px 26px",
                    textAlign: "left",
                    cursor: loading ? "wait" : "pointer",
                    fontFamily: "var(--sans)",
                    color: "var(--ink)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 18, fontWeight: 600 }}>{p.label}</span>
                    {loading === p.id ? (
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>여는 중…</span>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
                      </svg>
                    )}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>{p.coreLoop}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {[p.monetization, p.platform, p.stage].map((t) => (
                      <span key={t} style={{ fontSize: 11, padding: "3px 8px", border: "1px solid var(--line-3)", borderRadius: 999, color: "var(--muted)" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <div className="card" style={{ padding: "26px 28px", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ maxWidth: 620 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>내 게임은 여기 없는데요</div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)", margin: 0 }}>
                  핵심 루프를 직접 적으면 그 게임에 맞춰 설계해 드리는 기능을 준비하고 있습니다.
                  지금은 가장 가까운 장르를 골라 뼈대를 받아 보세요.
                </p>
              </div>
              <Link href="/" className="btn-ghost" style={{ height: 42, fontSize: 14 }}>
                소개로 돌아가기
              </Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
