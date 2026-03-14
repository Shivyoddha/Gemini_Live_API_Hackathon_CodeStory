/**
 * Live API config from server. No hardcoded keys or model IDs in the client.
 */

export type LiveSessionResponse = {
  ok: boolean;
  mode: "live-ready" | "mock";
  model?: string;
  bidi?: {
    enabled?: boolean;
    model?: string;
    apiKey?: string | null;
  };
  message?: string;
};

const SESSION_API = "/api/live/session";

export async function fetchLiveConfig(): Promise<LiveSessionResponse> {
  const res = await fetch(SESSION_API, { method: "POST" });
  const data = (await res.json()) as LiveSessionResponse;
  if (!res.ok) throw new Error("Failed to load Live config");
  return data;
}

export function isBidiEnabled(data: LiveSessionResponse): boolean {
  return Boolean(data.bidi?.enabled && data.bidi?.apiKey && data.bidi?.model);
}
