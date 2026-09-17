# 게임 지표 설계와 리포트

소규모 게임 팀을 위한 지표 설계기 + 진단 리포트. 원티드 AI 챔피언십 2026 출품작.

> 기존 분석 도구는 이미 데이터가 있는 팀을 전제한다.
> 이 도구는 무엇을 쌓을지 모르는 단계에서 시작해, 쌓인 다음에는 한국어로 무엇을 먼저 고쳐야 하는지까지 이어 준다.

- **입구** 장르와 핵심 루프 → 로그 이벤트 스키마, KPI 정의서, 첫 검증 설계, SQL DDL
- **출구** CSV 업로드 → 리텐션·레벨 이탈·결제·광고 빈도·세그먼트 진단 + 우선순위 제안 + 유저를 나누지 않는 검증 설계

배포: https://loopcheck-lac.vercel.app

## 이름

**"루프체크"는 가제다.** 저장소명과 배포 URL(`loopcheck`)에만 남아 있고, 화면에서는 쓰지 않는다.
핵심 루프를 점검한다는 뜻으로 잡았으나 제품이 하는 일(로그 설계와 지표 진단)과 정확히 맞지 않아 보류했다.
심사 종료(2026-10-17) 후 정식 출시 시점에 도메인과 함께 정한다. 그때까지 화면에는 기능 이름만 쓴다.

## 개발

```bash
nvm use         # Node 22. Next 16은 >=20.9.0을 요구한다
npm install
npm run dev     # http://localhost:3000
npm run build
npm run check:diagnose   # 진단 엔진 검사 50건 (정답지 대조, 문체 린터, 업로드 동치)
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
    page.tsx           설계기 (프리셋 선택 + 자유 입력)
    ResultView.tsx     스키마 / KPI / 검증 설계 / DDL 탭 렌더
  diagnose/
    page.tsx           CSV 업로드, 컬럼 매핑, 샘플 실행
    Report.tsx         리포트 (요약 · 제안 사항 · 분석 내용)
    charts.tsx         의존성 없는 SVG 차트
  api/
    design/route.ts    자유 입력 설계 (Gemini)
    interpret/route.ts 진단 해석 (Gemini). 받는 것은 집계 사실표뿐
components/
  Header.tsx
lib/
  diagnose/
    engine.ts          모든 통계 계산 (브라우저에서 실행)
    findings.ts        규칙 기반 해석 문장
    experiment.ts      이중차분 검증 설계 (A/B를 쓰지 않는 이유는 CLAUDE.md)
    interpret.ts       AI 해석 프롬프트, 사실표, 숫자 근거 검사
    schema.ts          CSV 테이블 인식과 컬럼 별칭 매핑
  voice/lint.ts        문체 기계 검사 (금지어·명령형·줄표·분모 혼동)
  llm/gemini.ts        REST 호출 한 곳. 실패 시 프리셋·규칙 해석으로 물러남
public/presets/        장르별 설계 결과 JSON (정적, API 호출 없음)
scripts/check-diagnose.mjs
```

## 원칙

1. 통계는 코드가 계산하고 LLM은 해석만 한다. 출력에 계산 결과에 없는 숫자가 있으면 거부한다.
2. 업로드한 데이터는 저장하지 않는다. 계산은 브라우저에서 하고 서버로는 집계 문장만 보낸다.
3. 운영비 0. 무료 티어 안에서 돈다.
4. 문체는 `../prompts/voice.md`를 따르고 `lib/voice/lint.ts`가 기계로 검사한다.

프로젝트 맥락과 남은 작업은 `CLAUDE.md`를 먼저 읽을 것.
