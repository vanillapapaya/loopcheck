"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import ResultView from "./ResultView";
import { PRESETS, type DesignResult, type Preset } from "@/lib/types";

const MONETIZATION = ["인앱 결제", "광고 보상", "광고 + 인앱 결제", "구독", "유료 구매", "미정"];
const PLATFORM = ["iOS", "Android", "PC", "복수"];

type Form = { genre: string; core_loop: string; monetization: string; platform: string };
const EMPTY: Form = { genre: "", core_loop: "", monetization: "광고 + 인앱 결제", platform: "복수" };

const field: React.CSSProperties = {
  width: "100%", fontFamily: "var(--sans)", fontSize: 14, color: "var(--ink)",
  background: "var(--surface)", border: "1px solid var(--line-3)", borderRadius: 2, padding: "10px 12px",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 };

export default function DesignPage() {
  const [result, setResult] = useState<DesignResult | null>(null);
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<string | undefined>();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadPreset = useCallback(async function loadPreset(p: Preset) {
    setLoading(p.id);
    setError(null);
    try {
      const res = await fetch(`/presets/${p.id}.json`);
      if (!res.ok) throw new Error("불러오지 못했습니다");
      const data: DesignResult = await res.json();
      setResult(data);
      setLabel(`${p.genre} · ${p.platform}`);
      setSource(undefined);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("스키마를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(null);
    }
  }, []);

  // /design?preset=puzzle 로 들어오면 그 설계 결과를 바로 연다
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("preset");
    const p = PRESETS.find((x) => x.id === id);
    if (p) loadPreset(p);
  }, [loadPreset]);

  async function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    setLoading("custom");
    setAiError(null);
    try {
      const res = await fetch("/api/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.result) {
        setAiError(
          data.error === "no_key"
            ? "AI 설계는 지금 쉬고 있습니다. 위의 장르 프리셋 중 가장 가까운 것을 먼저 받아 보세요."
            : data.message ?? "AI 설계에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      setResult(data.result);
      setLabel(`${form.genre} · ${form.platform}`);
      setSource(`AI 생성 · ${data.model}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setAiError("네트워크 문제로 AI 설계를 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(null);
    }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <Header
        right={
          result ? (
            <button className="btn-ghost" style={{ height: 38, fontSize: 14 }} onClick={() => setResult(null)}>
              다른 장르 보기
            </button>
          ) : undefined
        }
      />

      <main className="wrap" style={{ paddingTop: 36, paddingBottom: 80 }}>
        {result ? (
          <ResultView data={result} label={label} source={source} />
        ) : (
          <>
            <div style={{ maxWidth: 640, marginBottom: 32 }}>
              <h1 style={{ fontSize: "clamp(24px, 3.2vw, 28px)", fontWeight: 600, marginBottom: 14 }}>장르 선택</h1>
              <p style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.75, margin: 0 }}>
                장르를 고르면 그 장르의 핵심 루프에 맞춘 이벤트 스키마, KPI 정의서, 첫 검증 설계가
                바로 나옵니다. 목록에 없으면 아래에 핵심 루프를 적어 AI 설계를 받을 수 있습니다.
              </p>
            </div>

            {error && (
              <div role="alert" style={{ marginBottom: 20, padding: "14px 18px", background: "var(--danger-bg)", border: "1px solid var(--danger-line)", borderRadius: 2, fontSize: 14, color: "var(--danger-ink)" }}>
                {error}
              </div>
            )}

            <h2 style={{ fontSize: 17, fontFamily: "var(--serif)", fontWeight: 600, marginBottom: 14 }}>지표 설계 예시</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16, marginBottom: 40 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p)}
                  disabled={loading !== null}
                  className="tile"
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
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{p.label}</span>
                    {loading === p.id ? (
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>여는 중…</span>
                    ) : (
                      <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>열기</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>{p.coreLoop}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.65, color: "var(--muted)", marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--line-2)" }}>
                    <div>수익화 : {p.monetization}</div>
                    <div>플랫폼 : {p.platform}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="card" style={{ padding: "28px 30px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <h2 style={{ fontSize: 17, fontFamily: "var(--serif)", fontWeight: 600 }}>목록에 없는 새로운 게임을 만드신다면</h2>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink-2)", margin: "0 0 22px", maxWidth: 720 }}>
                핵심 루프를 두세 문장으로 적어 주세요. 유저가 무엇을 반복하는지, 어디서 성공하고 실패하는지, 무엇으로 돈을 쓰는지가 들어가면 설계가 정확해집니다.
              </p>

              <form onSubmit={submitCustom}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 16, marginBottom: 16 }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="genre" style={labelStyle}>장르</label>
                    <input id="genre" required minLength={2} maxLength={60} value={form.genre} onChange={set("genre")} placeholder="예: 모바일 방치형 RPG" style={field} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="core_loop" style={labelStyle}>핵심 루프</label>
                    <textarea id="core_loop" required minLength={30} maxLength={1000} rows={4} value={form.core_loop} onChange={set("core_loop")}
                      placeholder="예: 유저가 던전에 입장해 몬스터를 처치하고 장비를 얻는다. 막히면 장비를 강화하거나 동료를 뽑아 다시 도전한다. 매일 입장권이 충전되고, 입장권이 떨어지면 광고를 보거나 결제로 충전한다."
                      style={{ ...field, resize: "vertical", lineHeight: 1.65 }} />
                    <div className="mono" style={{ fontSize: 12, color: "var(--muted)", textAlign: "right", marginTop: 4 }}>{form.core_loop.length} / 1000</div>
                  </div>
                  <div>
                    <label htmlFor="monetization" style={labelStyle}>수익화</label>
                    <select id="monetization" value={form.monetization} onChange={set("monetization")} style={field}>{MONETIZATION.map((v) => <option key={v}>{v}</option>)}</select>
                  </div>
                  <div>
                    <label htmlFor="platform" style={labelStyle}>플랫폼</label>
                    <select id="platform" value={form.platform} onChange={set("platform")} style={field}>{PLATFORM.map((v) => <option key={v}>{v}</option>)}</select>
                  </div>
                </div>

                {aiError && (
                  <div role="alert" style={{ marginBottom: 16, padding: "12px 16px", background: "var(--danger-bg)", border: "1px solid var(--danger-line)", borderRadius: 2, fontSize: 14, color: "var(--danger-ink)" }}>
                    {aiError}
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
                  <button type="submit" className="btn" disabled={loading !== null} style={{ minWidth: 180 }}>
                    {loading === "custom" ? "설계하는 중…" : "AI로 설계 받기"}
                  </button>
                  {loading === "custom" ? (
                    <span role="status" style={{ fontSize: 13, color: "var(--ink-2)" }}>이벤트 스키마와 DDL까지 쓰느라 1분 가까이 걸릴 수 있습니다. 창을 닫지 않으시면 됩니다.</span>
                  ) : (
                    <Link href="/" style={{ fontSize: 13 }}>소개로 돌아가기</Link>
                  )}
                </div>
              </form>
            </div>
          </>
        )}
      </main>
    </>
  );
}
