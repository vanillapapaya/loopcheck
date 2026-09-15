"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { diagnose, parseCsv, type DiagnosisMetrics, type RawTables } from "@/lib/diagnose/engine";
import Report from "./Report";

const SAMPLE: [keyof RawTables, string][] = [
  ["users", "users.csv"],
  ["sessions", "sessions.csv"],
  ["attempts", "level_attempts.csv"],
  ["purchases", "purchases.csv"],
  ["ads", "ad_views.csv"],
];

type State =
  | { kind: "idle" }
  | { kind: "loading"; step: string }
  | { kind: "done"; metrics: DiagnosisMetrics; ms: number }
  | { kind: "error"; message: string };

// 브라우저가 진행 문구를 그릴 틈을 준다
const paint = () => new Promise((r) => setTimeout(r, 30));

export default function DiagnosePage() {
  const [state, setState] = useState<State>({ kind: "idle" });

  const runSample = useCallback(async () => {
    try {
      const tables = {} as RawTables;
      let done = 0;
      setState({ kind: "loading", step: `샘플 CSV 내려받는 중 (0/${SAMPLE.length})` });
      const texts = await Promise.all(
        SAMPLE.map(async ([, file]) => {
          const res = await fetch(`/sample/${file}`);
          if (!res.ok) throw new Error(`${file}을 불러오지 못했습니다`);
          const text = await res.text();
          setState({ kind: "loading", step: `샘플 CSV 내려받는 중 (${++done}/${SAMPLE.length})` });
          return text;
        }),
      );
      setState({ kind: "loading", step: "CSV 읽는 중" });
      await paint();
      const t0 = performance.now();
      SAMPLE.forEach(([key], i) => { tables[key] = parseCsv(texts[i]); });
      setState({ kind: "loading", step: `${tables.attempts.length.toLocaleString("ko-KR")}건 계산 중` });
      await paint();
      const metrics = diagnose(tables);
      setState({ kind: "done", metrics, ms: performance.now() - t0 });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "계산 중 문제가 생겼습니다" });
    }
  }, []);

  // /diagnose?sample 로 들어오면 바로 샘플 리포트를 연다
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("sample")) return;
    const id = setTimeout(runSample, 0);
    return () => clearTimeout(id);
  }, [runSample]);

  return (
    <>
      <Header
        right={
          state.kind === "done" ? (
            <button className="btn-ghost" style={{ height: 38, fontSize: 14 }} onClick={() => setState({ kind: "idle" })}>처음으로</button>
          ) : (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>계산은 브라우저에서 · 서버에 저장하지 않음</span>
          )
        }
      />
      <main className="wrap" style={{ paddingTop: 36, paddingBottom: 80 }}>
        {state.kind === "done" ? (
          <>
            <Report m={state.metrics} title="샘플 퍼즐 게임 · 30일 진단"
              sourceNote={`샘플 CSV를 내려받아 ${(state.ms / 1000).toFixed(1)}초 만에 계산했고, 서버로 보낸 데이터는 없습니다.`} />
          </>
        ) : (
          <div style={{ maxWidth: 820 }}>
            <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 12 }}>진단 리포트</h1>
            <p style={{ fontSize: 15, lineHeight: 1.75, color: "var(--ink-2)", margin: "0 0 28px" }}>
              쌓인 로그에서 리텐션, 레벨 이탈, 결제, 광고 빈도, 세그먼트를 계산하고 무엇을 먼저 고칠지 순서대로 정리합니다.
              계산은 전부 이 브라우저 안에서 일어나고, 개별 유저 행은 서버로 가지 않습니다.
            </p>

            <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between", padding: "22px 24px", marginBottom: 14 }}>
              <div style={{ maxWidth: 520 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 5 }}>샘플 게임으로 리포트 보기</div>
                <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--ink-2)" }}>
                  가상 퍼즐 게임의 30일치 로그 · 설치 6,000명 · 레벨 시도 16만 건. 내려받기(약 3MB)와 계산까지 몇 초면 끝납니다.
                </div>
              </div>
              <button className="btn" onClick={runSample} disabled={state.kind === "loading"} style={{ minWidth: 170 }}>
                {state.kind === "loading" ? "계산하는 중…" : "샘플 리포트 열기"}
              </button>
            </div>

            {state.kind === "loading" && (
              <div role="status" className="mono" style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 0 14px 4px" }}>{state.step}</div>
            )}
            {state.kind === "error" && (
              <div role="alert" style={{ marginBottom: 14, padding: "14px 18px", background: "#FBE9E7", border: "1px solid #F2CFC9", borderRadius: 4, fontSize: 14, color: "var(--danger-ink)" }}>
                {state.message}. 잠시 후 다시 시도해 주세요.
              </div>
            )}

            <div style={{ border: "1.5px dashed var(--line-3)", borderRadius: 6, background: "var(--surface-2)", padding: "30px 24px", textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>내 CSV 올리기</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>준비 중입니다. 먼저 샘플 리포트로 결과물을 확인해 보세요.</div>
            </div>

            <div style={{ background: "#F1EDE5", border: "1px solid var(--line)", borderRadius: 6, padding: "20px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>아직 로그가 없다면</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", marginBottom: 10 }}>
                지표 설계기로 먼저 스키마를 받아 두세요. 그대로 쌓으면 이 화면에서 바로 진단할 수 있습니다.
              </div>
              <Link href="/design" style={{ fontSize: 13, fontWeight: 500 }}>지표 설계기로 가기 →</Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
