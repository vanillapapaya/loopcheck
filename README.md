# 루프체크

게임 팀을 위한 지표 설계기와 진단 리포트.

## 개발

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

`node_modules/.bin`이 비어 있거나 `next: not found`가 나면 설치가 깨진 것이다.
`rm -rf node_modules package-lock.json && npm install`로 다시 설치한다.

## 구조

```
app/
  globals.css          디자인 토큰 (CSS 변수). 새 색을 만들지 말 것
  layout.tsx           폰트 로드, 메타데이터
  page.tsx             랜딩
  design/
    page.tsx           설계기 (프리셋 선택)
    ResultView.tsx     스키마 / KPI / A-B / DDL 탭 렌더
components/
  Header.tsx
lib/
  types.ts             DesignResult 타입과 PRESETS 목록
public/presets/        장르별 설계 결과 JSON (정적, API 호출 없음)
```

프로젝트 맥락과 남은 작업은 `CLAUDE.md`를 먼저 읽을 것.
