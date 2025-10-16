// Универсальное хранилище токена: Telegram CloudStorage (если доступен) + fallback в localStorage
const isTMA = () => !!window.Telegram?.WebApp;
const cs = () => window.Telegram?.WebApp?.CloudStorage;

// безопасный atob для JWT payload (безопасно для URL-safe base64)
function b64urlDecode(str) {
  try {
    const pad = '='.repeat((4 - (str.length % 4)) % 4);
    const base64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
    return atob(base64);
  } catch {
    return '';
  }
}

export async function getToken() {
  if (isTMA() && cs()) {
    return new Promise((resolve) => {
      cs().getItem("jwt", (err, val) => resolve(err ? "" : (val || "")));
    });
  }
  return localStorage.getItem("jwt") || "";
}

export async function setToken(token) {
  const t = token || "";
  if (isTMA() && cs()) {
    await new Promise((resolve) => cs().setItem("jwt", t, () => resolve()));
  }
  try { localStorage.setItem("jwt", t); } catch {}
}

export async function clearToken() {
  try { if (isTMA() && cs()) await new Promise((r) => cs().removeItem("jwt", () => r())); } catch {}
  try { localStorage.removeItem("jwt"); } catch {}
  // для мини-аппа можно мягко перезагрузить WebView, чтобы точно сбросить состояние
  try { if (isTMA()) window.Telegram.WebApp.reload(); } catch {}
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
