/**
 * API client utilities.
 *
 * Provides an `authFetch` wrapper that injects the MailPilot JWT from
 * sessionStorage and normalizes errors into a consistent Error object.
 */
export const API_PREFIX = import.meta.env.VITE_API_PREFIX || "/api";

/** Returns the stored JWT or null. */
export function getToken() {
  return sessionStorage.getItem("jwt");
}

/** Returns the stored user object or null (wrapped for safety). */
export function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem("mailpilot_user") || "null");
  } catch {
    return null;
  }
}

/** Persists the session (token + user). */
export function setSession({ token, user }) {
  if (token) sessionStorage.setItem("jwt", token);
  if (user) sessionStorage.setItem("mailpilot_user", JSON.stringify(user));
}

/** Clears the current session and optionally reloads. */
export function clearSession() {
  sessionStorage.removeItem("jwt");
  sessionStorage.removeItem("mailpilot_user");
  sessionStorage.removeItem("oauth_state");
}

/**
 * Auth-aware fetch wrapper.
 *
 * @param {string} path - API path beginning with `/api` or route path.
 * @param {object} [options] - fetch options.
 * @returns {Promise<any>} Resolves with `response.data`.
 */
export async function authFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  // Only set Content-Type for JSON bodies; FormData is set automatically.
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    typeof options.body === "string"
  ) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_PREFIX}${path}`, { ...options, headers });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON response
  }

  if (!res.ok) {
    const message =
      payload?.message || `Request failed with status ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.details = payload?.details || null;
    throw error;
  }

  return payload?.data ?? payload;
}

/** Sends a FormData (multipart) request with auth + CSRF-free. */
export async function sendForm(path, formData) {
  return authFetch(path, { method: "POST", body: formData });
}
