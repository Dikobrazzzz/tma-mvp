// src/auth/tokenStore.js
// Универсальное хранилище токена: Telegram CloudStorage (если доступен) + fallback в localStorage
const isTMA = () => !!window.Telegram?.WebApp;
const cs = () => window.Telegram?.WebApp?.CloudStorage;

const KEY_JWT = "jwt";
const KEY_AUTOLOGIN_DISABLED = "autologin_disabled";

// безопасный atob для JWT payload (безопасно для URL-safe base64)
function b64urlDecode(str) {
  try {
    const pad = "=".repeat((4 - (str.length % 4)) % 4);
    const base64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
    return atob(base64);
  } catch {
    return "";
  }
}

function csGet(key) {
  return new Promise((resolve) =>
    cs()?.getItem(key, (_err, val) => resolve(val || "")) ?? resolve("")
  );
}
function csSet(key, val) {
  return new Promise((resolve) =>
    cs()?.setItem(key, val, () => resolve()) ?? resolve()
  );
}
function csDel(key) {
  return new Promise((resolve) =>
    cs()?.removeItem(key, () => resolve()) ?? resolve()
  );
}

export async function getToken() {
  if (isTMA() && cs()) return await csGet(KEY_JWT);
  return localStorage.getItem(KEY_JWT) || "";
}

export async function setToken(token) {
  const t = token || "";
  if (isTMA() && cs()) await csSet(KEY_JWT, t);
  try { localStorage.setItem(KEY_JWT, t); } catch {}
}

export async function clearToken() {
  try { if (isTMA() && cs()) await new Promise((r) => cs().removeItem("jwt", () => r())); } catch {}
  try { localStorage.removeItem("jwt"); } catch {}
  // ⚠️ Эта перезагрузка мешает поставить флаг при logout:
  try { if (isTMA()) window.Telegram.WebApp.reload(); } catch {}
}

// 👉 Новый вариант без reload — используем в Logout
export async function clearTokenNoReload() {
  try { if (isTMA() && cs()) await new Promise((r) => cs().removeItem("jwt", () => r())); } catch {}
  try { localStorage.removeItem("jwt"); } catch {}
}

// быстрая клиентская проверка exp (для UX, не для безопасности)
export function isExpired(jwt) {
  if (!jwt) return true;
  const parts = jwt.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(b64urlDecode(parts[1]) || "{}");
    if (!payload.exp) return false;
    const now = Math.floor(Date.now() / 1000);
    return now >= payload.exp;
  } catch {
    return false;
  }
}

// ===== Флаг: запретить автологин по initData (используем для Logout) =====
export async function setAutoLoginDisabled(disabled) {
  const v = disabled ? "1" : "";
  if (isTMA() && cs()) await csSet(KEY_AUTOLOGIN_DISABLED, v);
  try {
    if (v) localStorage.setItem(KEY_AUTOLOGIN_DISABLED, v);
    else localStorage.removeItem(KEY_AUTOLOGIN_DISABLED);
  } catch {}
}

export async function isAutoLoginDisabled() {
  let v = "";
  if (isTMA() && cs()) v = await csGet(KEY_AUTOLOGIN_DISABLED);
  if (!v) v = localStorage.getItem(KEY_AUTOLOGIN_DISABLED) || "";
  return v === "1";
}

