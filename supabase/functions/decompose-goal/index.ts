// supabase/functions/decompose-goal/index.ts
// SyncDay 백엔드 (설계도의 Edge Function 'decompose-goal')
//
//  mode 없음(기본) : 목표 + 마감일 → Gemini로 날짜별 계획 → 목표·투두 저장
//  mode = "split" : 자꾸 미룬 투두 하나 → Gemini로 2~4개 작은 단계로 나눔 → 오늘부터 다시 배치 (미루기 코칭)
//
// - Gemini API 키는 Supabase Secrets(GEMINI_API_KEY)에만 보관합니다.
// - 로그인 토큰을 확인하고, 저장은 그 사용자 권한(RLS)으로 이뤄집니다.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildPrompt, buildSplitPrompt, isCapped, listAvailableDates, nextAvailableDates, parseRequest, parseSplitRequest,
  RESPONSE_SCHEMA, sanitizePlan, sanitizeSteps, SPLIT_SCHEMA, stepMaxMinutes, toTodoRows,
  type DatedTask,
} from "./plan.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------- Gemini 호출 (혼잡 대비)
// 기본 모델이 붐비면(429/500/503/504, 시간 초과) 잠깐 쉬었다 다시 시도하고, 그래도 안 되면 대체 모델로 시도합니다.
// 모델 바꾸기: GEMINI_MODEL 시크릿 / 대체 모델: GEMINI_FALLBACK_MODELS (쉼표로 구분)
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash";
const FALLBACK_MODELS = (Deno.env.get("GEMINI_FALLBACK_MODELS") ?? "gemini-flash-latest,gemini-2.5-flash")
  .split(",").map((m) => m.trim()).filter((m) => m && m !== GEMINI_MODEL);
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const TOTAL_BUDGET_MS = 75_000; // 사용자가 기다리는 최대 시간

class GeminiError extends Error {
  constructor(message: string, public status: number, public busy: boolean) { super(message); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(model: string, prompt: string, schema: unknown, timeoutMs: number): Promise<unknown> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY가 설정되지 않았습니다.", 0, false);
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.6 },
      }),
    });
  } catch (e) {
    // 시간 초과·네트워크 오류도 '붐빔'으로 보고 다시 시도
    throw new GeminiError(`Gemini 연결 실패: ${(e as Error).message}`, 0, true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GeminiError(`Gemini 오류(${res.status}): ${data?.error?.message ?? "알 수 없음"}`, res.status, RETRYABLE.has(res.status));
  }
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini 응답이 JSON 형식이 아님", 200, false);
  }
}

async function askGemini(prompt: string, schema: unknown, startedAt = Date.now()): Promise<unknown> {
  // [모델, 시도 전 대기 ms]: 기본 모델 3번(바로 → 1.5초 → 4초) → 대체 모델들
  const attempts: [string, number][] = [
    [GEMINI_MODEL, 0], [GEMINI_MODEL, 1500], [GEMINI_MODEL, 4000],
    ...FALLBACK_MODELS.map((m): [string, number] => [m, 500]),
  ];
  const unavailable = new Set<string>(); // 없는 모델(404)은 다시 부르지 않음
  let last: GeminiError | null = null;
  for (const [model, wait] of attempts) {
    if (unavailable.has(model)) continue;
    const left = TOTAL_BUDGET_MS - (Date.now() - startedAt) - wait;
    if (left < 8_000) break; // 남은 시간이 부족하면 그만
    if (wait) await sleep(wait);
    const t0 = Date.now();
    try {
      const result = await callGemini(model, prompt, schema, Math.min(40_000, left));
      console.log(`gemini ok model=${model} ${Date.now() - t0}ms`);
      return result;
    } catch (e) {
      const err = e instanceof GeminiError ? e : new GeminiError(String(e), 0, true);
      last = err;
      console.warn(`gemini fail model=${model} status=${err.status} ${Date.now() - t0}ms: ${err.message}`);
      if (err.status === 404) { unavailable.add(model); continue; }
      if (!err.busy && err.status !== 200) throw err; // 키 오류(400/401/403) 등은 다시 해도 소용없음
    }
  }
  throw last ?? new GeminiError("Gemini 호출 실패", 0, true);
}

// 실패 이유에 맞는 안내 문구
function aiErrorResponse(e: unknown, fallbackMessage: string) {
  if (e instanceof GeminiError && e.busy) {
    return json({ error: "AI 서버가 잠시 붐벼요. 1~2분 뒤 다시 시도해 주세요.", code: "busy" }, 503);
  }
  return json({ error: fallbackMessage, code: "ai_failed" }, 502);
}

// AI가 나눈 할 일은 투두(ai_subtasks)에 날짜별로 저장
async function saveTasks(supabase: SupabaseClient, tasks: DatedTask[], userId: string, goalId: number | null) {
  const { data: saved, error } = await supabase
    .from("ai_subtasks").insert(toTodoRows(tasks, userId, goalId)).select("task_id, target_date, task_content");
  if (error) throw new Error("투두를 저장하지 못했습니다: " + error.message);
  return saved ?? [];
}

// ---------------------------------------------------------------- 목표 → 날짜별 계획
async function handlePlan(supabase: SupabaseClient, userId: string, body: unknown) {
  const parsed = parseRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;

  const dates = listAvailableDates(input.today, input.deadline, input.restDays);
  if (dates.length === 0) return json({ error: "마감일까지 휴무일을 빼면 남는 날이 없어요." }, 400);

  console.log(`plan start goal="${input.goal}" deadline=${input.deadline} days=${dates.length}`);
  const startedAt = Date.now();
  let plan = null;
  try {
    plan = sanitizePlan(await askGemini(buildPrompt(input, dates), RESPONSE_SCHEMA, startedAt), dates, input.minutesPerDay);
    if (plan.tasks.length === 0) { // 쓸 수 있는 할 일이 없으면 한 번 더
      plan = sanitizePlan(await askGemini(buildPrompt(input, dates), RESPONSE_SCHEMA, startedAt), dates, input.minutesPerDay);
    }
  } catch (e) {
    console.error("decompose-goal plan gemini", e);
    return aiErrorResponse(e, "AI가 계획을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!plan || plan.tasks.length === 0) {
    return json({ error: "AI가 계획을 만들지 못했어요. 목표를 조금 더 구체적으로 적어 주세요.", code: "empty" }, 502);
  }
  console.log(`plan ai done tasks=${plan.tasks.length} ${Date.now() - startedAt}ms`);

  // 목표 저장 → 투두 저장 (중간에 실패하면 목표를 지워 반쯤 저장된 데이터가 남지 않게)
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .insert({ user_id: userId, title: input.goal, deadline: input.deadline, minutes_per_day: input.minutesPerDay })
    .select("goal_id").single();
  if (goalError || !goal) {
    console.error("insert goal", goalError);
    return json({ error: "목표를 저장하지 못했어요." }, 500);
  }
  try {
    await saveTasks(supabase, plan.tasks, userId, goal.goal_id);
  } catch (e) {
    console.error("save plan", e);
    await supabase.from("goals").delete().eq("goal_id", goal.goal_id);
    return json({ error: "계획을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, 500);
  }
  console.log(`plan saved goal_id=${goal.goal_id} total ${Date.now() - startedAt}ms`);

  return json({
    goalId: goal.goal_id,
    goal: input.goal,
    deadline: input.deadline,
    phases: plan.phases,
    tasks: plan.tasks,
    capped: isCapped(input.today, input.deadline), // 90일을 넘어 앞부분만 계획한 경우
  });
}

// ---------------------------------------------------------------- 미루기 코칭: 더 작게 나누기
async function handleSplit(supabase: SupabaseClient, userId: string, body: unknown) {
  const parsed = parseSplitRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.value;

  // RLS 때문에 본인 투두만 조회됨
  const { data: task } = await supabase
    .from("ai_subtasks").select("task_id, task_content, is_completed, goal_id, postpone_count")
    .eq("task_id", input.taskId).maybeSingle();
  if (!task) return json({ error: "나눌 할 일을 찾을 수 없어요." }, 404);
  if (task.is_completed) return json({ error: "이미 완료한 할 일이에요." }, 400);

  let goalTitle: string | null = null;
  let minutes: number | null = null;
  if (task.goal_id) {
    const { data: goal } = await supabase.from("goals").select("title, minutes_per_day").eq("goal_id", task.goal_id).maybeSingle();
    goalTitle = goal?.title ?? null;
    minutes = goal?.minutes_per_day ?? null;
  }
  const maxMinutes = stepMaxMinutes(minutes);

  let steps: { title: string; minutes: number }[] = [];
  const startedAt = Date.now();
  const prompt = buildSplitPrompt(task.task_content, task.postpone_count ?? 0, maxMinutes, goalTitle);
  try {
    steps = sanitizeSteps(await askGemini(prompt, SPLIT_SCHEMA, startedAt), maxMinutes);
    if (steps.length === 0) steps = sanitizeSteps(await askGemini(prompt, SPLIT_SCHEMA, startedAt), maxMinutes);
  } catch (e) {
    console.error("decompose-goal split gemini", e);
    return aiErrorResponse(e, "AI가 할 일을 나누지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  if (steps.length === 0) return json({ error: "AI가 할 일을 나누지 못했어요. 잠시 후 다시 시도해 주세요.", code: "empty" }, 502);
  console.log(`split ai done steps=${steps.length} ${Date.now() - startedAt}ms`);

  const dates = nextAvailableDates(input.today, input.restDays, steps.length);
  const tasks: DatedTask[] = steps.map((s, i) => ({ date: dates[i], title: s.title, minutes: s.minutes }));

  try {
    await saveTasks(supabase, tasks, userId, task.goal_id ?? null);
  } catch (e) {
    console.error("save split", e);
    return json({ error: "나눈 할 일을 저장하지 못했어요." }, 500);
  }
  // 나눈 할 일을 저장했으니 원래 할 일은 삭제
  const { error: delError } = await supabase.from("ai_subtasks").delete().eq("task_id", task.task_id);
  if (delError) console.error("delete original", delError);

  return json({ original: task.task_content, steps: tasks });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST 요청만 받아요." }, 405);

  // 로그인 확인
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "로그인이 필요해요." }, 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.slice(7));
  if (userError || !user) return json({ error: "로그인이 만료됐어요. 다시 로그인해 주세요." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "요청 형식이 올바르지 않아요." }, 400); }

  return body?.mode === "split" ? handleSplit(supabase, user.id, body) : handlePlan(supabase, user.id, body);
});
