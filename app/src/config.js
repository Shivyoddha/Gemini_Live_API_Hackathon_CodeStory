/**
 * API base URL for content, pipeline, and search.
 * For local dev: http://localhost:8081
 * For deployed backend: set VITE_API_BASE=https://your-service.run.app (no trailing slash)
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:8081";

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
