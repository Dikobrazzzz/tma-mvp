// src/api/client.js
import { getToken, setToken, clearTokenNoReload } from "../auth/tokenStore";

let onUnauthorized = null;
export function setOnUnauthorized(handler) { onUnauthorized = handler; }

const JSON_HEADERS = { "Content-Type": "application/json" };

async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

// Явный рефреш по HttpOnly cookie
export async function refreshAccess() {
  try {
    const r = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!r.ok) return "";
    const j = await r.json().catch(() => ({}));
    const tok = j?.token || "";
    if (tok) await setToken(tok);
    return tok;
  } catch {
    return "";
  }
}

// Базовая функция запроса с авто-рефрешем по 401
export async function api(path, { method = "GET", body, token, autoLogoutOn401 = false } = {}) {
  const t = token || await getToken();
  const headers = {
    ...(body ? JSON_HEADERS : {}),
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };

  let res = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    const newTok = await refreshAccess();
    if (newTok) {
      const retryHeaders = {
        ...(body ? JSON_HEADERS : {}),
        Authorization: `Bearer ${newTok}`,
      };
      res = await fetch(path, {
        method,
        headers: retryHeaders,
        credentials: "include",
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  const data = await safeJson(res);

  if (!res.ok) {
    if (res.status === 401 && autoLogoutOn401) {
      await clearTokenNoReload();
      if (typeof onUnauthorized === "function") onUnauthorized();
    }
    const err = new Error(data.error || res.statusText || "Request error");
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
