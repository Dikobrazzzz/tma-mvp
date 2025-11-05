// src/auth/TelegramProvider.jsx
import { createContext, useEffect, useMemo, useState } from "react";
import {
  getToken,
  setToken as saveToken,
  clearToken,
  isExpired,
  isAutoLoginDisabled,   // ⬅️ NEW
} from "./tokenStore";
import { refreshAccess } from "../api/client";

export const AuthCtx = createContext({ token: null, loading: true, setToken: () => {} });

export default function TelegramProvider({ children }) {
  const [token, setTokenState] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    (async () => {
      // 1) Берём локальный токен (CloudStorage/LS)
      let t = await getToken();

      // 2) Если пустой или просрочен — пробуем /api/auth/refresh (по HttpOnly cookie)
      if (!t || isExpired(t)) {
        const rTok = await refreshAccess();
        if (rTok) {
          t = rTok;
          await saveToken(t);
        } else if (window?.Telegram?.WebApp?.initData) {
          // 3) Тихий логин по Telegram initData (кросс-девайс SSO внутри Telegram) — только если не запрещён
          const disabled = await isAutoLoginDisabled();
          if (!disabled) {
            try {
              const resp = await fetch("/api/auth/tg-init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ init_data: window.Telegram.WebApp.initData }),
              });
              if (resp.ok) {
                const j = await resp.json().catch(() => ({}));
                const newTok = j?.token || "";
                if (newTok) {
                  t = newTok;
                  await saveToken(t);
                } else {
                  await clearToken();
                  t = "";
                }
              } else {
                await clearToken();
                t = "";
              }
            } catch {
              await clearToken();
              t = "";
            }
          } else {
            // автологин отключён — остаёмся без токена
            await clearToken();
            t = "";
          }
        } else {
          // 4) Не в Telegram или initData недоступен — очищаем локальное
          await clearToken();
          t = "";
        }
      }

      setTokenState(t || "");
      setLoading(false);
    })();
  }, []);

  const setToken = async (t) => {
    setTokenState(t || "");
    await saveToken(t || "");
  };

  const value = useMemo(() => ({ token, setToken, loading }), [token, loading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
