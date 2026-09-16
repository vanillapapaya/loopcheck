import Link from "next/link";
import Header from "@/components/Header";

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 4, flexShrink: 0 }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <Header />
      <main className="wrap">
        <section style={{ padding: "72px 0 64px", maxWidth: 720 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 28, padding: "0 11px", border: "1px solid var(--line-3)", borderRadius: 999, fontSize: 12, color: "var(--ink-2)", marginBottom: 26 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--ok)" }} />
            소규모 게임 팀을 위한 지표 설계와 진단 도구
          </div>
          <h1 style={{ fontSize: "clamp(34px, 5.4vw, 52px)", lineHeight: 1.2, fontWeight: 600, marginBottom: 22, textWrap: "balance" }}>
            쌓을 것을 정하고,
            <br />
            쌓인 것을 읽습니다.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.8, color: "var(--ink-2)", marginBottom: 32 }}>
            게임 장르와 핵심 루프를 적으면 로그 이벤트 스키마와 KPI 정의서가 나옵니다.
            그 스키마로 쌓은 데이터를 올리면, 어디서 유저가 빠지는지와 무엇을 먼저 고쳐야 하는지를 읽어 드립니다.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link href="/design" className="btn">무료로 지표 설계하기</Link>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 18 }}>
            지표 설계 단계는 회원가입이 필요 없습니다. 업로드한 데이터는 처리 후 즉시 폐기합니다.
          </p>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, paddingBottom: 72 }}>
          <div className="card" style={{ padding: 30 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>01</span>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>지표 설계기</h3>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--ink-2)", marginBottom: 20 }}>
              어떤 로그를 쌓아야 할지 모르신다면 이 게임의 루프에서 무엇을 이벤트로 남겨야 하는지부터 정해 드립니다.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
              <div style={{ display: "flex", gap: 9 }}><Check />로그 이벤트 스키마와 SQL DDL</div>
              <div style={{ display: "flex", gap: 9 }}><Check />KPI 정의서</div>
              <div style={{ display: "flex", gap: 9 }}><Check />첫 검증 설계</div>
            </div>
          </div>

          <div className="card" style={{ padding: 30 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>02</span>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>진단 리포트</h3>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--ink-2)", marginBottom: 20 }}>
              데이터를 업로드하면 리텐션, 레벨 이탈, 결제, 세그먼트를 계산하고 무엇을 먼저 고쳐야 하는지 순서대로 정리해 드립니다.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
              <div style={{ display: "flex", gap: 9 }}><Check />코호트 리텐션과 이탈 구간 특정</div>
              <div style={{ display: "flex", gap: 9 }}><Check />결제 퍼널과 전환 붕괴 지점</div>
              <div style={{ display: "flex", gap: 9 }}><Check />우선순위가 매겨진 개선 가설</div>
              <div style={{ display: "flex", gap: 9 }}><Check />효과를 확인하는 검증 설계</div>
            </div>
            <Link href="/diagnose?sample" style={{ display: "inline-block", marginTop: 20, fontSize: 14, fontWeight: 500 }}>샘플 게임 리포트 보기 →</Link>
          </div>
        </section>

        <section id="how" style={{ background: "var(--ink)", color: "var(--bg)", borderRadius: 6, padding: "48px 40px", marginBottom: 72 }}>
          <h2 style={{ fontSize: "clamp(24px, 3.4vw, 32px)", lineHeight: 1.35, fontWeight: 600, marginBottom: 18, maxWidth: 720 }}>
            기존 분석 도구는 이미 데이터가 있는 팀을 전제합니다.
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.85, color: "#BDB4A6", maxWidth: 720, marginBottom: 34 }}>
            SDK를 붙이려면 무엇을 찍을지 먼저 알아야 하는데, 대부분의 소규모 팀이 거기서 막힙니다.
            루프체크는 그 앞단계에서 시작해, 쌓인 다음에는 한국어로 무엇을 먼저 고쳐야 하는지까지 이어 줍니다.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {[
              ["무엇을 쌓을지 정하는 앞단계부터 합니다", "분석 도구는 이벤트가 이미 찍히고 있다고 전제합니다. 이 게임의 루프에서 무엇을 이벤트로 남길지 정하는 단계는 비어 있습니다. 거기서부터 시작합니다."],
              ["상관관계를 인과로 읽지 않습니다", "누적 광고 시청량으로 집계하면 “많이 볼수록 잔존이 높다”가 나옵니다. 오래 남은 유저일수록 시청 누적량이 커지는 구조라, 누적량은 잔존의 원인이 아니라 결과입니다. 경과일을 고정해 다시 집계합니다."],
              ["표본이 모자라면 모자라다고 씁니다", "구간 표본이 수십 개뿐이면 결론 대신 단서를 답니다. 확신을 파는 대신 확신의 근거를 같이 보여 드립니다."],
              ["상충하는 지표를 같이 놓습니다", "난이도 벽은 최대 이탈 지점이면서 최대 결제 지점이기도 합니다. 한쪽만 보고 내린 개선안은 다른 쪽을 무너뜨립니다."],
            ].map(([t, d]) => (
              <div key={t} style={{ border: "1px solid #38322B", borderRadius: 4, padding: "18px 20px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t}</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: "#A79E90" }}>{d}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ borderTop: "1px solid var(--line)", padding: "48px 0 72px", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 600, marginBottom: 8 }}>설계부터 해 보세요</h2>
            <p style={{ fontSize: 15, color: "var(--ink-2)", margin: 0 }}>
              게임 장르를 고르면 바로 데이터 스키마가 나옵니다.
            </p>
          </div>
          <Link href="/design" className="btn">무료로 지표 설계하기</Link>
        </section>

        <footer style={{ borderTop: "1px solid var(--line)", padding: "24px 0 56px", fontSize: 13, color: "var(--muted)", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
          <span>루프체크 · 게임 지표 설계와 진단</span>
          <span>진단 리포트 문의: seunghoc94@gmail.com</span>
        </footer>
      </main>
    </>
  );
}
