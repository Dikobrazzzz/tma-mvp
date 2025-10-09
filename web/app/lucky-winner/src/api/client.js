// /opt/tma-mvp/web/app/lucky-winner/src/api/client.js
export async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };

  // Берём токен из аргумента или из localStorage
  const t = token || localStorage.getItem("jwt");
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Аккуратно парсим JSON (на случай пустого тела)
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* ignore */ }

  if (!res.ok) {
    const err = new Error(data.error || res.statusText || "Request error");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
