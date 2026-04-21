const API_BASE = "https://cotel-backend.onrender.com";

const SESSION_STORAGE_KEY = "cotel_session_fallback";

function getStoredSessionId() {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setStoredSessionId(sessionId) {
  try {
    if (sessionId) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    }
  } catch {}
}

function clearStoredSessionId() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;

  const storedSessionId = getStoredSessionId();

  const headers = {
    "Accept": "application/json",
    ...(options.headers || {})
  };

  if (storedSessionId && !headers["Authorization"] && !headers["authorization"]) {
    headers["Authorization"] = `Bearer ${storedSessionId}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include"
  });

  if (!response.ok) {
    const text = await response.text();
    let detail;

    try {
      detail = JSON.parse(text);
    } catch {
      detail = text;
    }

    if (response.status === 401 && path === "/auth/me") {
      clearStoredSessionId();
    }

    throw {
      status: response.status,
      detail
    };
  }

  const data = await response.json();

  if (data?.session_id) {
    setStoredSessionId(data.session_id);
  }

  if (path === "/auth/logout") {
    clearStoredSessionId();
  }

  return data;
}

/**
 * Extract a localized, human-readable error message from an apiFetch() throw.
 *
 * The backend emits errors in several shapes (historical + structured):
 *   1. HTTPException(status, detail="CODE_NAME")                — plain string code
 *   2. HTTPException(status, detail="CODE_NAME: extra info")    — code with suffix
 *   3. HTTPException(status, detail={code, message, ...params}) — structured (plan_limits, main.py)
 *   4. HTTPException(status, detail={code, user_message, ...})  — service-account style
 *   5. HTTPException(status, detail={detail: "CODE_NAME"})      — FastAPI-wrapped legacy
 *   6. Raw Russian/English string detail (legacy import endpoints)
 *
 * The caller throws `{ status, detail }` from apiFetch(). This helper walks
 * that object, tries to resolve a translation from the `errors:backend.*`
 * namespace, interpolates params (flat fields on the detail dict), and falls
 * back sensibly if nothing matches.
 *
 * @param {object} err       - the thrown object, `{ status, detail }` or similar
 * @param {object} [options] - { fallback?: string }
 * @returns {string} localized message
 */
function extractBackendErrorMessage(err, options) {
  const opts = options || {};
  const customFallback = typeof opts.fallback === "string" ? opts.fallback : null;

  // ---- 0. i18n wrapper (optional) ----
  const tI18n = (key, fallback, params) => {
    try {
      if (window.cotelI18n && typeof window.cotelI18n.t === "function") {
        const value = window.cotelI18n.t(key, params);
        if (value && value !== key) return value;
      }
    } catch (_) { /* ignore */ }
    return fallback;
  };

  if (!err) return customFallback || tI18n("errors:unknown", "Что-то пошло не так. Попробуйте позже.");

  // ---- 1. Pull the innermost detail ----
  // apiFetch throws `{ status, detail }`. FastAPI sometimes wraps things as
  // `{ detail: { detail: "CODE" } }`, so we unwrap both levels.
  let detail = err.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    if (typeof detail.detail !== "undefined") {
      detail = detail.detail;
    }
  }

  // ---- 2. Structured detail (dict with code) ----
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const code = typeof detail.code === "string" ? detail.code.trim() : "";
    if (code) {
      // Flat params = everything on the detail object except code/message/user_message.
      const params = {};
      for (const k in detail) {
        if (!Object.prototype.hasOwnProperty.call(detail, k)) continue;
        if (k === "code" || k === "message" || k === "user_message") continue;
        params[k] = detail[k];
      }
      const translated = tI18n("errors:backend." + code, null, params);
      if (translated) return translated;

      // Dictionary miss → prefer backend-provided message in the user's locale
      // source language (Russian). Still better than a raw code.
      if (typeof detail.user_message === "string" && detail.user_message.trim()) {
        return detail.user_message.trim();
      }
      if (typeof detail.message === "string" && detail.message.trim()) {
        return detail.message.trim();
      }
      // Final fallback: show the code itself (easier to report to support).
      return code;
    }

    // Object without `code` — try `message` / `user_message` / `detail`.
    if (typeof detail.user_message === "string" && detail.user_message.trim()) {
      return detail.user_message.trim();
    }
    if (typeof detail.message === "string" && detail.message.trim()) {
      return detail.message.trim();
    }
  }

  // ---- 3. String detail (possibly "CODE" or "CODE: extra") ----
  if (typeof detail === "string" && detail.trim()) {
    const raw = detail.trim();

    // Strip anything after the first ": " — backends often do "CODE: reason"
    // where the reason is dev-oriented (English stack snippet, telethon text).
    const head = raw.split(":")[0].trim();

    // Only treat the head as a code if it looks like one (UPPER_SNAKE_CASE).
    if (/^[A-Z][A-Z0-9_]+$/.test(head)) {
      const translated = tI18n("errors:backend." + head, null);
      if (translated) return translated;
      // Unknown code → keep the raw payload so support can see it.
      return raw;
    }

    // Not a code pattern — assume it's already a human-readable message
    // (legacy Russian strings from main.py import endpoints).
    return raw;
  }

  // ---- 4. Status-code fallback ----
  const status = typeof err.status === "number" ? err.status : 0;
  if (status === 401) return tI18n("errors:unauthorized", "Пожалуйста, войдите в аккаунт, чтобы продолжить.");
  if (status === 403) return tI18n("errors:forbidden", "У вас нет доступа к этому действию.");
  if (status === 404) return tI18n("errors:not_found", "Не найдено.");
  if (status === 429) return tI18n("errors:rate_limited", "Слишком много запросов. Попробуйте позже.");
  if (status >= 500 && status < 600) return tI18n("errors:server_error", "Ошибка сервера. Попробуйте позже.");

  // ---- 5. Last-resort fallback ----
  if (customFallback) return customFallback;
  if (typeof err.message === "string" && err.message.trim()) return err.message.trim();
  return tI18n("errors:unknown", "Что-то пошло не так. Попробуйте позже.");
}

// Expose for inline page scripts.
window.extractBackendErrorMessage = extractBackendErrorMessage;