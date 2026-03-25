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