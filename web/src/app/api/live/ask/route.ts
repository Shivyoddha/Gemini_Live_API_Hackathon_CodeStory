import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  question: z.string().min(1),
  context: z.string().min(1).optional(),
});

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiApiErrorPayload = {
  error?: {
    status?: string;
    message?: string;
    details?: Array<{
      "@type"?: string;
      retryDelay?: string;
    }>;
  };
};

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid question payload." }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      answer:
        "Gemini key is not configured. This is a mock live response. Set GEMINI_API_KEY to enable real answers.",
      source: "mock",
    });
  }

  const prompt = parsed.data.context
    ? `Repository walkthrough context:\n${parsed.data.context}\n\nQuestion:\n${parsed.data.question}`
    : parsed.data.question;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  };

  async function doRequest(): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  }

  try {
    let response = await doRequest();
    let lastErrorText: string | null = null;
    let lastParsedError: ReturnType<typeof parseGeminiErrorPayload> = null;

    if (!response.ok) {
      lastErrorText = await response.text();
      lastParsedError = parseGeminiErrorPayload(lastErrorText);

      if (lastParsedError?.status === "RESOURCE_EXHAUSTED") {
        const retryAfterSeconds = getRetryAfterSeconds(lastParsedError);
        const waitMs = retryAfterSeconds != null ? Math.min(retryAfterSeconds * 1000, 65000) : 25000;

        await new Promise((resolve) => setTimeout(resolve, waitMs));
        response = await doRequest();
        lastErrorText = null;
        lastParsedError = null;
      }
    }

    if (!response.ok) {
      const errorText = lastErrorText ?? (await response.text());
      const parsedError = lastParsedError ?? parseGeminiErrorPayload(errorText);

      if (parsedError?.status === "RESOURCE_EXHAUSTED") {
        const retryAfterSeconds = getRetryAfterSeconds(parsedError);
        const retryText = retryAfterSeconds
          ? `Please retry in about ${retryAfterSeconds} seconds.`
          : "Please retry in a short while.";

        return NextResponse.json(
          {
            ok: true,
            source: "quota-fallback",
            retryAfterSeconds,
            answer: `Gemini quota is temporarily exhausted for model ${model}. ${retryText}`,
          },
          { status: 200 },
        );
      }

      const safeErrorMessage =
        parsedError?.message ||
        "Gemini request failed. Please try again in a moment.";
      return NextResponse.json({ ok: false, error: safeErrorMessage }, { status: 502 });
    }

    const payload = (await response.json()) as GeminiResponse;
    const answer =
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ??
      "No answer generated.";

    return NextResponse.json({ ok: true, answer, source: "gemini" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function parseGeminiErrorPayload(rawText: string): { status?: string; message?: string; retryDelay?: string } | null {
  try {
    const payload = JSON.parse(rawText) as GeminiApiErrorPayload;
    const status = payload.error?.status;
    const message = payload.error?.message;
    const retryDelay = payload.error?.details?.find((detail) => detail.retryDelay)?.retryDelay;
    return { status, message, retryDelay };
  } catch {
    return null;
  }
}

function getRetryAfterSeconds(parsedError: { retryDelay?: string } | null): number | null {
  if (!parsedError?.retryDelay) {
    return null;
  }

  const match = parsedError.retryDelay.match(/(\d+)/);
  if (!match?.[1]) {
    return null;
  }

  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds : null;
}
