import { NextResponse } from "next/server";

export async function POST() {
  const apiKeyConfigured = Boolean(process.env.GEMINI_API_KEY);
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const liveModel =
    process.env.GEMINI_LIVE_MODEL ?? "gemini-2.5-flash-native-audio-preview-12-2025";
  const exposeClientKey =
    process.env.GEMINI_LIVE_EXPOSE_CLIENT_KEY === "true" || process.env.NODE_ENV !== "production";

  return NextResponse.json({
    ok: true,
    mode: apiKeyConfigured ? "live-ready" : "mock",
    model,
    bidi: {
      enabled: apiKeyConfigured && exposeClientKey,
      model: liveModel,
      apiKey: apiKeyConfigured && exposeClientKey ? process.env.GEMINI_API_KEY : null,
    },
    message: apiKeyConfigured
      ? "Gemini API key detected. Live bridge is ready."
      : "GEMINI_API_KEY is missing; running in mock mode.",
  });
}
