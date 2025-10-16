import { createContext, useEffect, useMemo, useState } from "react";
import { getToken, setToken as saveToken, clearToken, isExpired } from "./tokenStore";

export const AuthCtx = createContext({ token: null, loading: true, setToken: () => {} });

export default function TelegramProvider({ children }) {
  const [token, setTokenState] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    (async () => {
      const t = await getToken();
      if (isExpired(t)) {
        await clearToken();
        setTokenState("");
      } else {
        setTokenState(t || "");
      }
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
