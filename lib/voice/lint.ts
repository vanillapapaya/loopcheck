// 문체 린터. prompts/voice.md 4-1장의 기계 검사 항목을 그대로 구현한다.
// AI 출력 검증에 붙어 fail이 하나라도 나오면 거부하고 재시도시킨다.
// 규칙 원문을 고치면 이 파일도 같이 고친다.

export type VoiceIssue = { level: "fail" | "warn"; rule: string; detail: string };

const BANNED = ["놀랍게도", "무려", "매우 심각", "치명적", "압도적", "시급히"];
const FAKE_BENCHMARK = /업계 평균|업계 기준|업계 통상|일반적으로\s*\S+\s*수준/;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
/** 숫자 사이의 물결표. "45~50%"는 금지, "45-50%"를 쓴다 */
const TILDE_RANGE = /\d\s*[~∼～]\s*\d/;
/** 줄표로 부연하는 습관. 문장을 끊거나 괄호와 쉼표를 쓴다 */
const EM_DASH = /—/;
/** 지시하는 말투. 읽는 팀이 그 게임을 더 잘 안다 */
const IMPERATIVE = /(?:하|되|보|넣|빼|올리|낮추|쓰|두|잡|줄이|늘리)(?:세요|십시오|시길 바랍니다)|해야\s*합니다|해라|하라(?![고는])/;
/** 비율 차이를 말하면서 %p를 안 쓴 경우 */
const DIFF_WITHOUT_PP = /\d+(?:\.\d+)?\s*%\s*(?:증가|감소|하락|상승|낮|높)/;

const sentences = (text: string) => text.split(/(?<=[.!?。])\s+|\n+/).filter((s) => s.trim());

/** 서술형 구간(요약, 개선안 본문)에 쓴다 */
export function lintProse(text: string, where: string): VoiceIssue[] {
  const out: VoiceIssue[] = [];
  for (const w of BANNED) if (text.includes(w)) out.push({ level: "fail", rule: "금지어", detail: `${where}: "${w}"는 과장어라 쓰지 않는다` });
  if (EMOJI.test(text)) out.push({ level: "fail", rule: "이모지", detail: `${where}: 이모지를 쓰지 않는다` });
  if (TILDE_RANGE.test(text)) out.push({ level: "fail", rule: "물결표 범위", detail: `${where}: 범위는 물결표 대신 하이픈이나 "에서"로 쓴다 (45-50%)` });
  if (EM_DASH.test(text)) out.push({ level: "fail", rule: "줄표 부연", detail: `${where}: 줄표 대신 문장을 끊거나 괄호와 쉼표를 쓴다` });
  if (IMPERATIVE.test(text)) out.push({ level: "fail", rule: "명령형", detail: `${where}: 지시하지 말고 제안한다 ("~이 필요해 보입니다", "~하는 편이 좋아 보입니다")` });
  if (FAKE_BENCHMARK.test(text)) out.push({ level: "fail", rule: "벤치마크 날조", detail: `${where}: 업계 평균 같은 외부 기준을 만들어 쓰지 않는다. 비교 대상은 이 데이터 안에 있는 것만` });
  for (const s of sentences(text)) {
    if (DIFF_WITHOUT_PP.test(s) && !s.includes("%p") && /대비|보다|차이/.test(s)) {
      out.push({ level: "warn", rule: "%p 누락", detail: `두 비율의 차이는 %p로 쓴다: "${s.trim().slice(0, 60)}"` });
    }
    // 비중과 잔존처럼 분모가 다른 비율이 한 문장에 섞이면 기준을 밝혀야 한다
    if (/차지|비중/.test(s) && /잔존|리텐션|클리어율|전환/.test(s) && !/분모|기준|중/.test(s)) {
      out.push({ level: "warn", rule: "분모 혼동", detail: `분모가 다른 비율을 한 문장에 나란히 썼다. 각각의 기준을 밝힌다: "${s.trim().slice(0, 60)}"` });
    }
  }
  return out;
}

/** 명사형 개조식 구간(근거 항목, 세그먼트 비교, 각주)에 쓴다 */
export function lintBullet(text: string, where: string): VoiceIssue[] {
  const out = lintProse(text, where);
  if (/(습니다|입니다|합니다|됩니다|십시오)[.\s]*$/.test(text.trim())) {
    out.push({ level: "fail", rule: "종결 혼용", detail: `${where}: 근거 항목은 명사형으로 끝낸다 (기록, 보임, 확인, 필요, 차지, 순)` });
  }
  if (/\d/.test(text) && !/대비|보다|순|중|기준|이상|미만|차지/.test(text)) {
    out.push({ level: "warn", rule: "비교 대상 누락", detail: `${where}: 수치에는 비교 대상이나 기준을 붙인다` });
  }
  return out;
}

export const fails = (issues: VoiceIssue[]) => issues.filter((i) => i.level === "fail");
