import Link from "next/link";

export default function Header({ right }: { right?: React.ReactNode }) {
  return (
    <div className="wrap">
      <header className="site-header">
        <Link href="/" className="logo">
          <span style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600 }}>루프체크</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {right ?? (
            <>
              <Link href="/diagnose" style={{ fontSize: 14, color: "var(--ink-2)" }}>진단 리포트</Link>
              <Link href="/design" className="btn" style={{ height: 38, padding: "0 18px", fontSize: 14 }}>
                지표 설계
              </Link>
            </>
          )}
        </div>
      </header>
    </div>
  );
}
