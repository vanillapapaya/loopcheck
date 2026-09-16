export type EventProperty = { name: string; type: string; note?: string };

export type SchemaEvent = {
  name: string;
  /** 핵심 루프에서 맡는 역할 */
  role: string;
  /** 이 이벤트로 계산하는 지표 이름 */
  used_for: string[];
  properties: EventProperty[];
  priority: "must" | "should" | string;
};

export type Kpi = {
  name: string;
  formula: string;
  why_this_game: string;
  watch_out: string;
};

export type AbTest = {
  hypothesis: string;
  primary_metric: string;
  guardrail_metrics: string[];
  unit: string;
  min_duration_days: number;
  sample_size_note: string;
};

export type DesignResult = {
  game_summary: string;
  events: SchemaEvent[];
  user_properties: EventProperty[];
  kpis: Kpi[];
  ab_test: AbTest;
  do_not_track: string[];
  sql_ddl: string;
};

export type Preset = {
  id: string;
  label: string;
  genre: string;
  coreLoop: string;
  monetization: string;
  platform: string;
  stage: string;
  teamSize: string;
};

export const PRESETS: Preset[] = [
  {
    id: "puzzle",
    label: "캐주얼 매치3 퍼즐",
    genre: "캐주얼 매치3 퍼즐",
    coreLoop:
      "유저가 레벨에 입장해 제한된 수의 이동으로 목표를 달성한다. 실패하면 목숨을 잃고, 목숨은 시간이 지나면 회복되거나 광고 시청으로 즉시 회복할 수 있다. 레벨은 순차적으로 열리고 중간중간 부스터를 얻는다.",
    monetization: "혼합",
    platform: "Android, iOS",
    stage: "소프트론칭",
    teamSize: "4",
  },
  {
    id: "idle",
    label: "방치형 (Idle)",
    genre: "방치형 idle 게임",
    coreLoop:
      "자원이 자동으로 쌓이고, 모은 자원으로 생산 시설을 업그레이드해 속도를 올린다. 성장이 막히면 환생(프레스티지)으로 영구 보너스를 얻고 다시 빠르게 올라간다. 오프라인 동안에도 자원이 쌓이며 광고를 보면 두 배로 받는다.",
    monetization: "혼합",
    platform: "Android, iOS",
    stage: "출시 후",
    teamSize: "3",
  },
  {
    id: "gacha-rpg",
    label: "수집형 RPG (가챠)",
    genre: "수집형 RPG (가챠)",
    coreLoop:
      "스테이지를 클리어해 재화를 모으고 그 재화로 캐릭터를 뽑는다. 뽑은 캐릭터를 육성해 더 어려운 스테이지에 도전한다. 일일 임무와 주간 레이드가 반복 동기를 만들고 한정 픽업 배너가 주기적으로 열린다.",
    monetization: "인앱 결제 중심",
    platform: "Android, iOS",
    stage: "출시 후",
    teamSize: "8",
  },
  {
    id: "roguelike",
    label: "로그라이크 덱빌더 (Steam)",
    genre: "로그라이크 덱빌더 (PC/Steam)",
    coreLoop:
      "한 판(run)을 시작해 전투마다 카드를 보상으로 골라 덱을 만든다. 체력이 0이 되면 런이 끝나고 처음부터 다시 시작한다. 런을 반복하며 영구 해금이 열리고 난이도 단계를 올릴 수 있다.",
    monetization: "유료 구매 (본편 1회 구매, 이후 DLC)",
    platform: "PC (Steam)",
    stage: "출시 후",
    teamSize: "2",
  },
];
