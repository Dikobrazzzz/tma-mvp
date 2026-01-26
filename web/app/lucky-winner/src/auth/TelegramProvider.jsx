// src/auth/TelegramProvider.jsx
import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { getToken, setToken as storeSetToken, clearTokenNoReload } from "./tokenStore";

export const AuthCtx = createContext({
  token: null,
  setToken: (_t) => {},
  logout: () => {},
  loading: true,
});

async function refreshAccessToken() {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data?.token === "string" ? data.token : null;
  } catch {
    return null;
  }
}

export default function TelegramProvider({ children }) {
  const [token, _setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getToken();
      _setToken(stored || null);
      setLoading(false);
    })();
  }, []);

  const setToken = useCallback(async (next) => {
    flushSync(() => _setToken(next || null));
    await storeSetToken(next || "");
  }, []);

  // 3) logout
  const logout = useCallback(async () => {
    await setToken(null);
    await clearTokenNoReload();
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  }, [setToken]);

  useEffect(() => {
    const tg = window?.Telegram?.WebApp;
    if (!tg) return;
    try { tg.ready?.(); tg.expand?.(); } catch {}
  }, []);

  useEffect(() => {
    let stop = false;
    async function tick() {
      const sleepMs = token ? 15 * 60 * 1000 : 3 * 60 * 1000;
      try {
        const fresh = await refreshAccessToken();
        if (fresh) await setToken(fresh);
      } catch {}
      if (!stop) setTimeout(tick, sleepMs);
    }
    const id = setTimeout(tick, 2500);
    return () => { stop = true; clearTimeout(id); };
  }, [token, setToken]);

  const value = useMemo(() => ({ token, setToken, logout, loading }), [token, setToken, logout, loading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
