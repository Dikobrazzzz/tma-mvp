// src/api/client.js
import { clearToken } from "../auth/tokenStore";

let onUnauthorized = null;
export function setOnUnauthorized(handler) { onUnauthorized = handler; }

const JSON_HEADERS = { "Content-Type": "application/json" };

// Безопасный парсинг JSON
async function safeJson(res) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

// Явный рефреш по HttpOnly cookie -> выдаёт новый access JWT
export async function refreshAccess() {
  try {
    const r = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include", // отправляем cookie
    });
    if (!r.ok) return "";
    const j = await r.json().catch(() => ({}));
    const tok = j?.token || "";
    if (tok) {
      try { localStorage.setItem("jwt", tok); } catch {}
    }
    return tok;
  } catch {
    return "";
  }
}

// Базовая функция запроса с авто-рефрешем по 401
export async function api(path, { method = "GET", body, token } = {}) {
  const t = token || (typeof localStorage !== "undefined" ? localStorage.getItem("jwt") : "");
  const headers = {
    ...(body ? JSON_HEADERS : {}),
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };

  // 1-й запрос
  let res = await fetch(path, {
    method,
    headers,
    credentials: "include", // важно: и для чтения, и для записи refresh-cookie
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    // Попробуем обновить access по refresh-cookie
    const newTok = await refreshAccess();
    if (newTok) {
      // Повторим запрос с новым токеном
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
    if (res.status === 401) {
      // refresh не помог — чистим и уведомляем
      try { await clearToken(); } catch {}
      if (typeof onUnauthorized === "function") onUnauthorized();
    }
    const err = new Error(data.error || res.statusText || "Request error");
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
