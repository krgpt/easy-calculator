/**
 * easy-calculator Gemini 프록시 (Cloudflare Worker)
 *
 * 역할
 *  - 브라우저(016-음식 칼로리 계산기.html)에서 온 사진을 받아
 *    서버 쪽에 숨겨 둔 GEMINI_API_KEY 로 Google Gemini API를 호출합니다.
 *  - API 키는 Worker의 Secret(환경변수)에만 있고, 방문자에게는 절대 노출되지 않습니다.
 *
 * 배포 방법은 같은 폴더의 README.md 를 참고하세요.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://krgpt.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
  "null" // file:// 로 직접 열었을 때 (로컬 테스트용)
];

const PROMPT = `당신은 한국의 영양사입니다. 사진 속 음식을 보고 칼로리와 영양소를 추정하세요.

규칙:
- 여러 음식이 있으면 각각을 items에 나누어 기록하고, 전체 합계를 total에 기록하세요.
- 양은 사진에 보이는 그릇/접시 크기를 참고해 일반적인 1인분 기준으로 추정하세요.
- dishName은 대표 음식 이름을 한국어로 간결하게 쓰세요.
- note는 1~2문장의 한국어 조언으로 쓰세요.
- 모든 숫자는 그램(g)과 kcal 단위의 숫자만 넣으세요. 단위 문자는 넣지 마세요.
- 사진에 음식이 없거나 식별할 수 없으면 dishName을 "식별 불가"로 하고, items는 빈 배열, 모든 숫자는 0, confidence는 "low"로 하세요.
- 확신이 낮으면 confidence를 "low" 또는 "medium"으로 표시하세요.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    dishName: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          portion: { type: "STRING" },
          calories: { type: "NUMBER" },
          protein_g: { type: "NUMBER" },
          carbs_g: { type: "NUMBER" },
          fat_g: { type: "NUMBER" }
        },
        required: ["name", "portion", "calories", "protein_g", "carbs_g", "fat_g"]
      }
    },
    totalCalories: { type: "NUMBER" },
    totalProtein_g: { type: "NUMBER" },
    totalCarbs_g: { type: "NUMBER" },
    totalFat_g: { type: "NUMBER" },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
    note: { type: "STRING" }
  },
  required: [
    "dishName",
    "items",
    "totalCalories",
    "totalProtein_g",
    "totalCarbs_g",
    "totalFat_g",
    "confidence",
    "note"
  ]
};

function getAllowedOrigins(env) {
  if (env && env.ALLOWED_ORIGINS) {
    return String(env.ALLOWED_ORIGINS)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function buildCorsHeaders(origin, allowedOrigins) {
  const isAllowed = !!origin && allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : (allowedOrigins[0] || ""),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      extraHeaders || {}
    )
  });
}

function toNumber(value) {
  const n = Number(value);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 10) / 10;
}

function normalizeResult(raw) {
  if (!raw || typeof raw !== "object") raw = {};

  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => ({
        name: String(item.name || "음식").slice(0, 80),
        portion: String(item.portion || "1인분").slice(0, 60),
        calories: toNumber(item.calories),
        protein_g: toNumber(item.protein_g),
        carbs_g: toNumber(item.carbs_g),
        fat_g: toNumber(item.fat_g)
      }))
    : [];

  const sum = (key) => items.reduce((total, item) => total + item[key], 0);
  const confidence = ["high", "medium", "low"].includes(String(raw.confidence))
    ? String(raw.confidence)
    : "medium";

  return {
    dishName: String(raw.dishName || "음식").slice(0, 80),
    items,
    totalCalories: toNumber(raw.totalCalories) || Math.round(sum("calories")),
    totalProtein_g: toNumber(raw.totalProtein_g) || Math.round(sum("protein_g") * 10) / 10,
    totalCarbs_g: toNumber(raw.totalCarbs_g) || Math.round(sum("carbs_g") * 10) / 10,
    totalFat_g: toNumber(raw.totalFat_g) || Math.round(sum("fat_g") * 10) / 10,
    confidence,
    note: String(raw.note || "").slice(0, 300)
  };
}

async function checkRateLimit(env, request) {
  // KV 바인딩이 없으면 제한을 건너뜁니다. (기본 배포는 KV 없이도 동작)
  if (!env || !env.RATE_LIMIT_KV) {
    return { ok: true, remaining: null };
  }

  const limit = parseInt(env.RATE_LIMIT_PER_DAY || "30", 10);
  if (!isFinite(limit) || limit <= 0) {
    return { ok: true, remaining: null };
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = `rate:${day}:${ip}`;

  try {
    const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || "0", 10);
    if (current >= limit) {
      return { ok: false, limit, remaining: 0 };
    }
    await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 86400 });
    return { ok: true, limit, remaining: Math.max(0, limit - current - 1) };
  } catch (err) {
    // KV 오류가 나도 분석 자체는 막지 않습니다.
    console.error("rate limit error:", err);
    return { ok: true, remaining: null };
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = getAllowedOrigins(env);
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

    // CORS preflight
    if (request.method === "OPTIONS") {
      if (origin && !allowedOrigins.includes(origin)) {
        return new Response(null, { status: 403, headers: corsHeaders });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "POST 요청만 지원합니다." }, 405, corsHeaders);
    }

    if (origin && !allowedOrigins.includes(origin)) {
      return jsonResponse({ error: "허용되지 않은 출처(Origin)입니다." }, 403, corsHeaders);
    }

    if (!env || !env.GEMINI_API_KEY) {
      return jsonResponse(
        { error: "서버에 GEMINI_API_KEY Secret이 설정되지 않았습니다." },
        500,
        corsHeaders
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ error: "요청 본문이 올바른 JSON이 아닙니다." }, 400, corsHeaders);
    }

    const image = body && body.image;
    const mimeType = ((body && body.mimeType) || "image/jpeg").toLowerCase();

    if (!image || typeof image !== "string") {
      return jsonResponse({ error: "이미지 데이터(image)가 필요합니다." }, 400, corsHeaders);
    }

    if (!/^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(mimeType)) {
      return jsonResponse(
        { error: "지원하지 않는 이미지 형식입니다. JPEG, PNG, WebP, HEIC만 지원합니다." },
        415,
        corsHeaders
      );
    }

    const approxBytes = Math.floor(image.length * 0.75);
    if (approxBytes > 6 * 1024 * 1024) {
      return jsonResponse(
        { error: "이미지가 너무 큽니다. 6MB 이하로 줄여 주세요." },
        413,
        corsHeaders
      );
    }

    const rate = await checkRateLimit(env, request);
    if (!rate.ok) {
      return jsonResponse(
        { error: `오늘 분석 횟수(${rate.limit}회)를 모두 사용했습니다. 내일 다시 이용해 주세요.` },
        429,
        corsHeaders
      );
    }

    const model = (env.GEMINI_MODEL || "gemini-2.5-flash").trim();
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent";

    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: image } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    };

    // Gemini 2.5 Flash는 기본적으로 thinking이 켜져 있어 출력 토큰을 낭비할 수 있습니다.
    // (2.5 Flash-Lite는 기본이 off이므로 건드리지 않고, 2.0/3.x는 파라미터가 다릅니다.)
    if (/^gemini-2\.5-flash($|-)/.test(model) && !/lite/.test(model)) {
      geminiBody.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    let geminiResponse;
    try {
      geminiResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify(geminiBody)
      });
    } catch (err) {
      console.error("Gemini fetch error:", err);
      return jsonResponse(
        { error: "Gemini API에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        502,
        corsHeaders
      );
    }

    const geminiText = await geminiResponse.text();

    if (!geminiResponse.ok) {
      console.error("Gemini API error:", geminiResponse.status, geminiText);

      let detail = "";
      try {
        const parsed = JSON.parse(geminiText);
        detail = (parsed && parsed.error && parsed.error.message) || "";
      } catch (_) {}

      if (geminiResponse.status === 429) {
        return jsonResponse(
          { error: "AI 사용량이 잠시 초과되었습니다. 잠시 후 다시 시도해 주세요." },
          429,
          corsHeaders
        );
      }

      return jsonResponse(
        {
          error:
            "AI 분석 중 오류가 발생했습니다." +
            (detail ? " (" + detail.slice(0, 160) + ")" : "")
        },
        502,
        corsHeaders
      );
    }

    let geminiData;
    try {
      geminiData = JSON.parse(geminiText);
    } catch (_) {
      return jsonResponse({ error: "AI 응답을 해석하지 못했습니다." }, 502, corsHeaders);
    }

    const candidate = geminiData && geminiData.candidates && geminiData.candidates[0];
    const text =
      candidate &&
      candidate.content &&
      Array.isArray(candidate.content.parts)
        ? candidate.content.parts
            .map((part) => part.text)
            .filter(Boolean)
            .join("")
        : "";

    if (!text) {
      const reason = (candidate && candidate.finishReason) || "";
      const message =
        reason === "SAFETY"
          ? "이미지를 분석할 수 없습니다. 다른 사진으로 시도해 주세요."
          : "AI가 분석 결과를 만들지 못했습니다. 다시 시도해 주세요.";
      return jsonResponse({ error: message }, 422, corsHeaders);
    }

    let result;
    try {
      // 혹시 모델이 ```json ... ``` 형태로 감싸서 보내는 경우도 처리
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      result = JSON.parse(cleaned);
    } catch (_) {
      return jsonResponse(
        { error: "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요." },
        502,
        corsHeaders
      );
    }

    return jsonResponse(normalizeResult(result), 200, corsHeaders);
  }
};
