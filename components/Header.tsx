import Link from "next/link";

export default function Header({ right }: { right?: React.ReactNode }) {
  return (
    <div className="wrap">
      <header className="site-header">
        <Link href="/" className="logo">
          <span style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 600 }}>게임 지표 설계와 리포트</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {right ?? (
            <>
              {/* 설계가 입구, 진단이 출구다. 이 순서를 모든 화면에서 같게 쓴다 */}
              <Link href="/design" style={{ fontSize: 14, color: "var(--ink)" }}>지표 설계</Link>
              <Link href="/diagnose" style={{ fontSize: 14, color: "var(--ink)" }}>진단 리포트</Link>
            </>
          )}
        </div>
      </header>
    </div>
  );
}
