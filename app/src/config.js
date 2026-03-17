/**
 * API base URL for content, pipeline, and search.
 * For local dev: http://localhost:8081
 * For deployed backend: set VITE_API_BASE=https://your-service.run.app (no trailing slash)
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:8081";

/**
 * WebSocket URL for Gemini Live API proxy.
 * Derived from VITE_API_BASE (https://x.run.app → wss://x.run.app/ws) when not explicitly set.
 */
function _baseToWs(base) {
  if (!base) return "ws://localhost:8080";
  const u = base.replace(/^http/, "ws");
  return u.endsWith("/") ? `${u.slice(0, -1)}/ws` : `${u}/ws`;
}
export const PROXY_WS_URL =
  import.meta.env.VITE_PROXY_WS_URL || _baseToWs(import.meta.env.VITE_API_BASE) || "ws://localhost:8080";

/**
 * Google Cloud project ID for Vertex AI / Gemini Live API.
 */
export const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || "";

/**
 * Gemini model ID for Live API.
 * Use gemini-live-2.5-flash-native-audio (GA) or gemini-live-2.5-flash-preview-native-audio-09-2025 (preview).
 */
export const MODEL_ID =
  import.meta.env.VITE_MODEL_ID || "gemini-live-2.5-flash-native-audio";

/**
 * Session ID for data isolation. One per browser tab/localStorage.
 * Passed to all API calls so each user sees only their own content.
 */
export function getSessionId() {
  let sid = localStorage.getItem("codestory_session_id");
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem("codestory_session_id", sid);
  }
  return sid;
}
