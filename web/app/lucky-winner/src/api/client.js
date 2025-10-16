import { clearToken } from "../auth/tokenStore";

let onUnauthorized = null;
export function setOnUnauthorized(handler) { onUnauthorized = handler; }

// Важно: Authorization берём из localStorage — tokenStore также пишет туда, так что ничего не ломаем
export async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = token || localStorage.getItem("jwt");
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (!res.ok) {
    if (res.status === 401) {
      await clearToken();                // очистим CloudStorage и localStorage
      if (typeof onUnauthorized === "function") onUnauthorized(); // например, navigate("/login")
    }
    const err = new Error(data.error || res.statusText || "Request error");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
