// auth/TelegramProvider.jsx
import { createContext, useEffect, useMemo, useState } from "react";

export const AuthCtx = createContext({ token: null, loading: true });

export default function TelegramProvider({ children }) {
  // ❗️не подставляем фиктивный токен
  const [token, setToken] = useState(() => localStorage.getItem("jwt") || "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    setLoading(false);
    console.log("TelegramProvider: initialized, loading=false");
  }, []);

  const value = useMemo(() => ({ token, setToken, loading }), [token, loading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

