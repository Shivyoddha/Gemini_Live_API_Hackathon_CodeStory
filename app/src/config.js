/**
 * API base URL for content, pipeline, and search.
 * For local dev: http://localhost:8081
 * For deployed backend: set VITE_API_BASE=https://your-service.run.app (no trailing slash)
 */
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "http://localhost:8081";
