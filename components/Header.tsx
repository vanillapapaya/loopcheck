import Link from "next/link";

export default function Header({ right }: { right?: React.ReactNode }) {
  return (
    <div className="wrap">
      <header className="site-header">
        <Link href="/" className="logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 17c0-6 3-10 6-10s3 4 0 6-6-1-6-6" />
            <path d="M14 7l3 10 3-6" />
          </svg>
          <span style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600 }}>루프체크</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {right ?? (
            <>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>회원가입 없이 무료</span>
              <Link href="/design" className="btn" style={{ height: 38, padding: "0 18px", fontSize: 14 }}>
                설계 시작
              </Link>
            </>
          )}
        </div>
      </header>
    </div>
  );
}
