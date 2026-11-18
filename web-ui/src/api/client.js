/**
 * API client. Authentication uses an HttpOnly session cookie set by the
 * server, so no tokens or credentials are ever stored in browser storage.
 * Every request sends the X-MailPilot-Client header (CSRF protection).
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details || [];
  }
}

export async function api(path, { method = "GET", body, headers = {}, signal } = {}) {
  const h = { "X-MailPilot-Client": "web", ...headers };
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) {
    h["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers: h, body: payload, credentials: "include", signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, `Can't reach the MailPilot API (${API_BASE}). Check that the backend is running.`, "network");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error || {};
    const err = new ApiError(res.status, e.message || `Request failed (${res.status}).`, e.code, e.details);
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("mailpilot:unauthorized"));
    throw err;
  }
  return data;
}

export const googleSignInUrl = `${API_BASE}/auth/google/start`;
