// supabase/functions/decompose-goal/plan.ts
// 외부 라이브러리 없이 동작하는 계산 로직만 모아 둔 파일입니다. (테스트하기 쉽게 분리)

export const MAX_PLAN_DAYS = 90;          // 한 번에 계획을 세우는 최대 기간(일)

export type PlanTask = { date: string; title: string; minutes: number };
export type PlanPhase = { name: string; start: string; end: string };
export type Plan = { phases: PlanPhase[]; tasks: PlanTask[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function isDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

/** 오늘부터 마감일까지 휴무 요일을 뺀 날짜 목록 (최대 MAX_PLAN_DAYS일) */
export function listAvailableDates(today: string, deadline: string, restDays: number[] = []): string[] {
  const out: string[] = [];
  for (let i = 0; i < MAX_PLAN_DAYS; i++) {
    const d = addDays(today, i);
    if (d > deadline) break;
    if (!restDays.includes(weekday(d))) out.push(d);
  }
  return out;
}

/** 마감일이 너무 멀어 앞의 MAX_PLAN_DAYS일만 계획했는지 */
export function isCapped(today: string, deadline: string): boolean {
  return addDays(today, MAX_PLAN_DAYS - 1) < deadline;
}

/** 사용자가 보낸 요청 값 검사. 문제가 있으면 한국어 오류 문장을 돌려줍니다. */
export type PlanRequest = {
  goal: string; deadline: string; today: string;
  minutesPerDay: number; restDays: number[];
};

export function parseRequest(body: any): { ok: true; value: PlanRequest } | { ok: false; error: string } {
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  if (goal.length < 2) return { ok: false, error: "목표를 2글자 이상 입력해주세요." };
  if (goal.length > 200) return { ok: false, error: "목표는 200자 이내로 입력해주세요." };

  const today = body?.today;
  if (!isDate(today)) return { ok: false, error: "오늘 날짜 형식이 올바르지 않습니다." };
  const deadline = body?.deadline;
  if (!isDate(deadline)) return { ok: false, error: "마감일을 선택해주세요." };
  if (deadline < today) return { ok: false, error: "마감일은 오늘 이후 날짜로 선택해주세요." };

  const minutes = Number(body?.minutesPerDay ?? 60);
  if (!Number.isFinite(minutes) || minutes < 10 || minutes > 480) {
    return { ok: false, error: "하루 투자 시간은 10분~8시간 사이로 선택해주세요." };
  }

  const restDays = Array.isArray(body?.restDays)
    ? [...new Set(body.restDays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))] as number[]
    : [];
  if (restDays.length >= 7) return { ok: false, error: "모든 요일이 휴무일이라 계획을 세울 수 없습니다." };

  return { ok: true, value: { goal, deadline, today, minutesPerDay: Math.round(minutes), restDays } };
}

/** Gemini에게 보낼 지시문 */
export function buildPrompt(req: PlanRequest, dates: string[]): string {
  const dateList = dates.map((d) => `${d}(${WEEKDAYS[weekday(d)]})`).join(", ");
  return [
    "너는 자기계발 목표를 매일 실천 가능한 할 일로 나눠 주는 일정 코치야.",
    `사용자의 목표: "${req.goal}"`,
    `오늘: ${req.today}, 마감일: ${req.deadline}`,
    `하루에 쓸 수 있는 시간: ${req.minutesPerDay}분`,
    `할 일을 배치할 수 있는 날짜(휴무일 제외): ${dateList}`,
    "",
    "규칙:",
    "1. 위 날짜 목록에 있는 날짜에만, 날짜마다 할 일을 정확히 1개씩 만들어.",
    `2. minutes는 ${req.minutesPerDay} 이하의 정수로 써.`,
    "3. title은 바로 실행할 수 있게 구체적으로, 40자 이내 한국어로 써. (예: 'RC 파트5 문법 30문제 풀기')",
    "4. 쉬운 것부터 시작해서 점점 어려워지게 하고, 마감일 직전에는 점검·복습을 넣어.",
    "5. 전체 기간을 2~4개의 단계(phases)로 나누고 각 단계의 시작일과 종료일을 써.",
  ].join("\n");
}

/** Gemini가 따라야 할 JSON 형식 (responseSchema) */
export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    phases: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, start: { type: "STRING" }, end: { type: "STRING" } },
        required: ["name", "start", "end"],
      },
    },
    tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { date: { type: "STRING" }, title: { type: "STRING" }, minutes: { type: "INTEGER" } },
        required: ["date", "title", "minutes"],
      },
    },
  },
  required: ["phases", "tasks"],
};

/** AI 응답을 검사해서 허용된 날짜·길이·시간만 남깁니다. */
export function sanitizePlan(raw: any, dates: string[], minutesPerDay: number): Plan {
  const allowed = new Set(dates);
  const seen = new Set<string>();
  const tasks: PlanTask[] = [];
  for (const t of Array.isArray(raw?.tasks) ? raw.tasks : []) {
    const date = typeof t?.date === "string" ? t.date.trim() : "";
    const title = typeof t?.title === "string" ? t.title.trim().replace(/\s+/g, " ").slice(0, 60) : "";
    if (!allowed.has(date) || seen.has(date) || !title) continue;
    const m = Math.round(Number(t?.minutes));
    const minutes = Number.isFinite(m) ? Math.min(Math.max(m, 10), minutesPerDay) : minutesPerDay;
    seen.add(date);
    tasks.push({ date, title, minutes });
  }
  tasks.sort((a, b) => a.date.localeCompare(b.date));

  const phases: PlanPhase[] = (Array.isArray(raw?.phases) ? raw.phases : [])
    .filter((p: any) => typeof p?.name === "string" && p.name.trim() && isDate(p?.start) && isDate(p?.end))
    .slice(0, 6)
    .map((p: any) => ({ name: p.name.trim().slice(0, 30), start: p.start, end: p.end }));

  return { phases, tasks };
}

export type DatedTask = { date: string; title: string; minutes: number };

/** 투두 행 */
export function toTodoRows(tasks: DatedTask[], userId: string, goalId: number | null) {
  return tasks.map((t) => ({
    user_id: userId,
    goal_id: goalId,
    task_content: t.title,
    is_completed: false,
    target_date: t.date,
  }));
}


// ===================== 미루기 코칭: 할 일을 더 작게 나누기 =====================

export type SplitRequest = { taskId: number; today: string; restDays: number[] };

export function parseSplitRequest(body: any): { ok: true; value: SplitRequest } | { ok: false; error: string } {
  const taskId = Number(body?.taskId);
  if (!Number.isInteger(taskId) || taskId <= 0) return { ok: false, error: "나눌 할 일을 찾을 수 없습니다." };
  if (!isDate(body?.today)) return { ok: false, error: "오늘 날짜 형식이 올바르지 않습니다." };
  const restDays = Array.isArray(body?.restDays)
    ? [...new Set(body.restDays.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))] as number[]
    : [];
  if (restDays.length >= 7) return { ok: false, error: "모든 요일이 휴무일이라 일정을 잡을 수 없습니다." };
  return { ok: true, value: { taskId, today: body.today, restDays } };
}

/** 오늘부터 휴무 요일을 빼고 n일 */
export function nextAvailableDates(today: string, restDays: number[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < n && i < 60; i++) {
    const d = addDays(today, i);
    if (!restDays.includes(weekday(d))) out.push(d);
  }
  return out;
}

/** 나눈 한 단계의 최대 시간: 원래 시간의 절반 (최소 10분) */
export function stepMaxMinutes(originalMinutes: number | null | undefined): number {
  const base = Number.isFinite(Number(originalMinutes)) && Number(originalMinutes) > 0 ? Number(originalMinutes) : 60;
  return Math.max(10, Math.round(base / 2));
}

export function buildSplitPrompt(title: string, postponeCount: number, maxMinutes: number, goalTitle?: string | null): string {
  return [
    "너는 사용자가 미루는 일을 부담 없이 시작하게 도와주는 일정 코치야.",
    goalTitle ? `사용자의 목표: "${goalTitle}"` : "",
    `사용자가 ${postponeCount}번 미룬 할 일: "${title}"`,
    "",
    "규칙:",
    "1. 이 할 일을 순서대로 하면 끝나는 2~4개의 작은 단계로 나눠.",
    "2. 첫 단계는 5~15분 안에 끝낼 수 있을 만큼 아주 쉽게 만들어.",
    `3. 각 단계의 minutes는 ${maxMinutes} 이하의 정수로 써.`,
    "4. title은 바로 실행할 수 있게 구체적으로, 40자 이내 한국어로 써.",
  ].filter((l) => l !== "").join("\n");
}

export const SPLIT_SCHEMA = {
  type: "OBJECT",
  properties: {
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { title: { type: "STRING" }, minutes: { type: "INTEGER" } },
        required: ["title", "minutes"],
      },
    },
  },
  required: ["steps"],
};

/** AI가 나눈 단계 검사: 2~4개, 제목·시간 정리. 2개 미만이면 빈 배열 */
export function sanitizeSteps(raw: any, maxMinutes: number): { title: string; minutes: number }[] {
  const steps = (Array.isArray(raw?.steps) ? raw.steps : [])
    .map((s: any) => {
      const title = typeof s?.title === "string" ? s.title.trim().replace(/\s+/g, " ").slice(0, 60) : "";
      const m = Math.round(Number(s?.minutes));
      return { title, minutes: Number.isFinite(m) ? Math.min(Math.max(m, 5), maxMinutes) : maxMinutes };
    })
    .filter((s: { title: string }) => s.title)
    .slice(0, 4);
  return steps.length >= 2 ? steps : [];
}
