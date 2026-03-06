const API_BASE = "https://cotel-backend.onrender.com";

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;

  const headers = {
    "Accept": "application/json",
    ...(options.headers || {})
  };

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

    throw {
      status: response.status,
      detail
    };
  }

  return response.json();
}