"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import { diagnose, parseCsv, type DiagnosisMetrics, type RawTables, type Row } from "@/lib/diagnose/engine";
import { autoMap, identifyTable, missingRequired, normalizeTable, TABLES, type TableKey } from "@/lib/diagnose/schema";
import Report from "./Report";

const SAMPLE: [keyof RawTables, string][] = [
  ["users", "users.csv"],
  ["sessions", "sessions.csv"],
  ["attempts", "level_attempts.csv"],
  ["purchases", "purchases.csv"],
  ["ads", "ad_views.csv"],
];
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

type Uploaded = { id: number; name: string; size: number; headers: string[]; rows: Row[]; table: TableKey | null; mapping: Record<string, string> };

type State =
  | { kind: "idle" }
  | { kind: "loading"; step: string }
  | { kind: "done"; metrics: DiagnosisMetrics; ms: number; source: "sample" | "upload"; notes: string[] }
  | { kind: "error"; message: string };

// 브라우저가 진행 문구를 그릴 틈을 준다
const paint = () => new Promise((r) => setTimeout(r, 30));
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/** 업로드 상태. 색이 아니라 글자로 읽히게 둔다 */
function Mark({ kind }: { kind: "ok" | "warn" | "empty" }) {
  const [text, color] = kind === "ok" ? ["확인", "var(--ok)"] : kind === "warn" ? ["지정 필요", "var(--warn-ink)"] : ["없음", "var(--muted)"];
  return <span style={{ flexShrink: 0, width: 54, fontSize: 12, fontWeight: kind === "empty" ? 400 : 600, color }}>{text}</span>;
}

export default function DiagnosePage() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [reading, setReading] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

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
      setState({ kind: "done", metrics, ms: performance.now() - t0, source: "sample", notes: [] });
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

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = [...list].filter((f) => /\.csv$/i.test(f.name) || f.type === "text/csv");
    if (!incoming.length) { setState({ kind: "error", message: "CSV 파일만 올릴 수 있습니다" }); return; }
    const total = [...files.map((f) => f.size), ...incoming.map((f) => f.size)].reduce((a, b) => a + b, 0);
    if (total > MAX_TOTAL_BYTES) { setState({ kind: "error", message: `합계 ${kb(MAX_TOTAL_BYTES)}까지 올릴 수 있습니다. 기간을 줄여 다시 뽑아 주세요` }); return; }
    setState({ kind: "idle" });
    const added: Uploaded[] = [];
    for (const f of incoming) {
      setReading(`${f.name} 읽는 중…`);
      await paint();
      const rows = parseCsv(await f.text());
      const headers = rows.length ? Object.keys(rows[0]) : [];
      let table = identifyTable(headers, f.name);
      // 한 번에 올린 파일끼리 같은 종류로 겹치면 뒤의 파일은 직접 고르게 한다
      if (table && added.some((a) => a.table === table)) table = null;
      added.push({ id: nextId.current++, name: f.name, size: f.size, headers, rows, table, mapping: table ? autoMap(table, headers) : {} });
    }
    setReading(null);
    setFiles((prev) => {
      // 같은 테이블로 인식된 파일이 이미 있으면 새 파일로 바꾼다
      const replaced = new Set(added.map((a) => a.table).filter(Boolean));
      return [...prev.filter((p) => !p.table || !replaced.has(p.table)), ...added];
    });
  }

  const update = (id: number, patch: Partial<Uploaded>) => setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  // 파일의 데이터 종류를 바꾼다. 그 종류를 쓰던 다른 파일은 "종류 고르기"로 돌린다.
  const retype = (id: number, k: TableKey | "") =>
    setFiles((fs) => fs.map((f) => {
      if (f.id === id) return { ...f, table: k || null, mapping: k ? autoMap(k, f.headers) : {} };
      if (k && f.table === k) return { ...f, table: null, mapping: {} };
      return f;
    }));
  const typeSelect = (f: Uploaded, strong: boolean) => (
    <select aria-label={`${f.name}의 데이터 종류`} value={f.table ?? ""} onChange={(e) => retype(f.id, e.target.value as TableKey | "")}
      style={{ fontSize: 12, padding: "5px 8px", border: `1px solid ${strong ? "var(--ink)" : "var(--line-3)"}`, borderRadius: 2, background: "var(--surface)" }}>
      <option value="">종류 고르기</option>
      {TABLES.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.file})</option>)}
    </select>
  );
  const byTable = (k: TableKey) => files.find((f) => f.table === k);
  const blockers = [
    ...TABLES.filter((t) => t.required && !byTable(t.key)).map((t) => `${t.label}(${t.file}) 파일이 필요합니다`),
    ...files.filter((f) => !f.table).map((f) => `${f.name}이 어떤 데이터인지 골라 주세요`),
    ...files.filter((f) => f.table).flatMap((f) => missingRequired(f.table!, f.mapping).map((col) => `${f.name}의 ${col} 컬럼을 지정해 주세요`)),
  ];
  const dupTables = TABLES.filter((t) => files.filter((f) => f.table === t.key).length > 1);
  if (dupTables.length) blockers.push(...dupTables.map((t) => `${t.label} 데이터로 지정된 파일이 둘 이상입니다`));

  async function runUpload() {
    try {
      setState({ kind: "loading", step: "컬럼을 맞추는 중" });
      await paint();
      const t0 = performance.now();
      const tables: RawTables = { users: [], sessions: [], attempts: [], purchases: [], ads: [] };
      const notes: string[] = [];
      for (const f of files) {
        if (!f.table) continue;
        const r = normalizeTable(f.table, f.rows, f.mapping);
        if (r.badDates) notes.push(`${f.name}: 날짜를 읽을 수 없는 ${r.badDates.toLocaleString("ko-KR")}행을 뺐습니다 (예: "${r.sampleBad}")`);
        tables[f.table] = r.rows;
      }
      if (!tables.users.length || !tables.sessions.length) throw new Error("유저·세션 데이터에서 읽을 수 있는 행이 없습니다. 날짜 형식(YYYY-MM-DD)을 확인해 주세요");
      setState({ kind: "loading", step: `${(tables.sessions.length + tables.attempts.length).toLocaleString("ko-KR")}건 계산 중` });
      await paint();
      const metrics = diagnose(tables);
      setState({ kind: "done", metrics, ms: performance.now() - t0, source: "upload", notes });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "계산 중 문제가 생겼습니다" });
    }
  }

  const busy = state.kind === "loading" || !!reading;

  return (
    <>
      <Header
        right={
          state.kind === "done" ? (
            <button className="btn-ghost" style={{ height: 38, fontSize: 14 }} onClick={() => setState({ kind: "idle" })}>처음으로</button>
          ) : (
            <span style={{ fontSize: 13, color: "var(--muted)" }}>계산은 브라우저에서 · 원본은 서버로 가지 않음</span>
          )
        }
      />
      <main className="wrap" style={{ paddingTop: 36, paddingBottom: 80 }}>
        {state.kind === "done" ? (
          <>
            {state.notes.length > 0 && (
              <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--warn-bg)", borderRadius: 2, fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>
                {state.notes.map((n) => <div key={n}>{n}</div>)}
              </div>
            )}
            <Report
              m={state.metrics}
              title={state.source === "sample" ? "샘플 퍼즐 게임 · 30일 진단" : `내 게임 · ${state.metrics.meta.obsStart} - ${state.metrics.meta.obsEnd} 진단`}
              sourceNote={state.source === "sample"
                ? "샘플 CSV를 내려받아 이 브라우저에서 계산. 서버로 보낸 것은 집계 수치뿐"
                : "올린 CSV를 이 브라우저에서만 읽어 계산. 원본 행은 서버로 전송하지 않음, 보낸 것은 집계 수치뿐"}
            />
          </>
        ) : (
          <div className="two-col">
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: "clamp(24px, 3.2vw, 28px)", fontWeight: 600, marginBottom: 14 }}>진단 리포트</h1>
              <p style={{ fontSize: 15, lineHeight: 1.75, color: "var(--ink-2)", margin: "0 0 26px" }}>
                쌓인 로그 CSV를 올리면 리텐션, 레벨 이탈, 결제, 광고 빈도, 세그먼트를 계산하고 무엇을 먼저 고칠지 정리해 드립니다.
                컬럼 이름이 달라도 됩니다. 무엇인지만 알려 주시면 맞춰 읽습니다.
              </p>

              {/* 드롭존 */}
              <div
                role="button" tabIndex={0}
                onClick={() => !busy && inputRef.current?.click()}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); inputRef.current?.click(); } }}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) addFiles(e.dataTransfer.files); }}
                style={{ border: `1.5px dashed ${drag ? "var(--ink)" : "var(--line-3)"}`, borderRadius: 2, background: "var(--surface-2)", padding: "36px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: busy ? "wait" : "pointer", marginBottom: 14, textAlign: "center" }}
              >
                <div style={{ fontSize: 15, fontWeight: 500 }}>
                  {reading ?? <span style={{ color: "var(--link)" }}>CSV 파일 선택</span>}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>또는 여기에 파일을 끌어다 놓기 (합계 {kb(MAX_TOTAL_BYTES)} 제한)</div>
                <input ref={inputRef} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </div>

              {state.kind === "error" && (
                <div role="alert" style={{ marginBottom: 14, padding: "12px 16px", background: "var(--danger-bg)", border: "1px solid var(--danger-line)", borderRadius: 2, fontSize: 14, color: "var(--danger-ink)" }}>
                  {state.message}
                </div>
              )}

              {/* 업로드 현황 */}
              <div className="tile" style={{ overflow: "hidden", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>업로드 현황</span>
                  <span className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>{TABLES.filter((t) => byTable(t.key)).length} / {TABLES.length}</span>
                </div>
                {TABLES.map((t) => {
                  const f = byTable(t.key);
                  const missing = f ? missingRequired(t.key, f.mapping) : [];
                  return (
                    <div key={t.key} style={{ borderBottom: "1px solid var(--line-2)", background: missing.length ? "var(--warn-bg)" : undefined }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", padding: "13px 20px" }}>
                        <Mark kind={!f ? "empty" : missing.length ? "warn" : "ok"} />
                        <span style={{ width: 170, fontSize: 13 }}><span style={{ fontWeight: 600 }}>{t.label}</span> <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{t.file}</span></span>
                        <span style={{ flex: "1 1 220px", fontSize: 12, color: f ? "var(--ink-2)" : "var(--muted)" }}>
                          {!f ? t.missingNote
                            : missing.length ? `${f.name} · ${f.rows.length.toLocaleString("ko-KR")}행 · 컬럼 ${missing.length}개를 지정해 주세요`
                            : `${f.name} · ${f.rows.length.toLocaleString("ko-KR")}행 · 필요한 컬럼 모두 인식`}
                        </span>
                        {f && <span style={{ fontSize: 12, color: "var(--muted)" }}>{kb(f.size)}</span>}
                        {f && typeSelect(f, false)}
                        {f && <button onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))} style={{ background: "none", border: "none", fontSize: 12, color: "var(--link)", cursor: "pointer", fontFamily: "var(--sans)" }}>빼기</button>}
                      </div>
                      {f && (
                        <details open={missing.length > 0} style={{ padding: "0 20px 14px 51px" }}>
                          <summary style={{ fontSize: 12, color: "var(--ink-2)", cursor: "pointer", marginBottom: 8 }}>컬럼 매핑 {missing.length ? "" : "확인"}</summary>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {t.columns.map((col) => (
                              <div key={col.name} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                                <span className="mono" style={{ width: 150, fontSize: 12 }}>{col.name}{col.required ? " *" : ""}</span>
                                <select
                                  aria-label={`${t.label}의 ${col.name} 컬럼`}
                                  value={f.mapping[col.name] ?? ""}
                                  onChange={(e) => update(f.id, { mapping: { ...f.mapping, [col.name]: e.target.value } })}
                                  className="mono"
                                  style={{ minWidth: 180, fontSize: 12, padding: "6px 8px", background: "var(--surface)", border: `1px solid ${col.required && !f.mapping[col.name] ? "var(--ink)" : "var(--line-3)"}`, borderRadius: 2 }}
                                >
                                  <option value="">{col.required ? "선택해 주세요" : "(없음)"}</option>
                                  {f.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                  {col.hint}{f.mapping[col.name] && f.rows[0] ? ` · 값 예시: ${f.rows[0][f.mapping[col.name]]?.slice(0, 24)}` : ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
                {files.filter((f) => !f.table).map((f) => (
                  <div key={f.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "13px 20px", background: "var(--warn-bg)", borderBottom: "1px solid var(--line-2)" }}>
                    <Mark kind="warn" />
                    <span className="mono" style={{ fontSize: 13 }}>{f.name}</span>
                    <span style={{ fontSize: 12, color: "var(--ink-2)" }}>어떤 데이터인지 알아보지 못했습니다</span>
                    {typeSelect(f, true)}
                    <button onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))} style={{ background: "none", border: "none", fontSize: 12, color: "var(--link)", cursor: "pointer", fontFamily: "var(--sans)" }}>빼기</button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginBottom: 34 }}>
                <button className="btn" onClick={runUpload} disabled={busy || blockers.length > 0} style={{ minWidth: 150 }}>
                  {state.kind === "loading" ? "계산하는 중…" : "리포트 생성"}
                </button>
                <span role="status" style={{ fontSize: 13, color: "var(--muted)" }}>
                  {state.kind === "loading" ? state.step : blockers[0] ?? "준비됐습니다"}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                <div style={{ height: 1, flexGrow: 1, background: "var(--line)" }} />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>데이터가 아직 없다면</span>
                <div style={{ height: 1, flexGrow: 1, background: "var(--line)" }} />
              </div>

              <div className="tile" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between", padding: "20px 24px" }}>
                <div style={{ maxWidth: 520 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 5 }}>샘플 게임으로 리포트 보기</div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--ink-2)" }}>
                    가상 퍼즐 게임의 30일치 로그 · 설치 6,000명 · 레벨 시도 16만 건. 내려받기(약 3MB)와 계산까지 몇 초면 끝납니다.
                  </div>
                </div>
                <button className="btn-ghost" onClick={runSample} disabled={busy} style={{ minWidth: 160 }}>샘플 리포트 열기</button>
              </div>
            </div>

            <aside className="aside" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 12 }}>데이터를 어떻게 다루나요</div>
                {[
                  "파일은 이 브라우저 안에서만 읽고 계산. 원본 행은 서버로 전송하지 않음",
                  "AI 해석에 넘기는 것은 집계 지표 문장뿐이며, 유저 ID 등 개별 값은 미포함",
                  "탭 종료 시 읽은 데이터도 함께 소멸. 별도 저장 없음",
                ].map((t) => (
                  <div key={t} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <span aria-hidden style={{ color: "var(--muted)", flexShrink: 0 }}>-</span>
                    <div style={{ lineHeight: 1.65 }}>{t}</div>
                  </div>
                ))}
              </div>
              <div style={{ paddingTop: 18, borderTop: "1px solid var(--line)" }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>파일 형식</div>
                <div style={{ lineHeight: 1.7, marginBottom: 10 }}>
                  유저와 세션은 필수, 나머지는 있는 만큼만 올리면 됩니다. 날짜는 YYYY-MM-DD로 시작해야 합니다. 샘플 파일을 열어 보면 형식을 바로 확인할 수 있습니다.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
                  {SAMPLE.map(([, f]) => <a key={f} href={`/sample/${f}`} className="mono" style={{ fontSize: 12 }}>{f}</a>)}
                </div>
              </div>
              <div style={{ paddingTop: 18, borderTop: "1px solid var(--line)" }}>
                <div className="eyebrow" style={{ marginBottom: 12 }}>아직 로그가 없다면</div>
                <div style={{ lineHeight: 1.7, marginBottom: 10 }}>지표 설계기로 먼저 스키마를 받아 두세요. 그대로 쌓으면 이 화면에서 매핑 없이 바로 진단할 수 있습니다.</div>
                <Link href="/design" style={{ fontSize: 13, fontWeight: 500 }}>지표 설계기로 가기 →</Link>
              </div>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
