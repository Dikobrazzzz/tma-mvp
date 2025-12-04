// src/pages/Profile.jsx
import {
  useEffect,
  useState,
  useContext,
  useCallback,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";

import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import setting from "../assets/setting.svg";
import wincub from "../assets/wincub.svg";
import Header from "../components/Header";

// Analytics
import { trackClick } from "../analytics/analytics";

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token, loading: authLoading } = useContext(AuthCtx);

  const [userId, setUserId] = useState("");
  const [wins, setWins] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !token) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, token, navigate]);

  const fetchAll = useCallback(async () => {
    if (authLoading || !token) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const me = await api("/api/me", { token });
      const extId =
        me?.external_id ?? me?.ledger_user_id ?? me?.auth_user_id ?? me?.user_id;
      setUserId(extId != null ? String(extId) : "—");

      const my = await api("/api/winners/my", { token });
      const rows =
        (my?.winnings || []).map((w, idx) => ({
          n: idx + 1,
          computed_at: w.computed_at,
          date: new Date(w.computed_at).toLocaleDateString(),
          amount: `€${Number(w.amount_eur ?? 0).toFixed(2)}`,
          status: "Win",
          claimed: Boolean(w.claimed ?? (w.claimed_at ? true : false)),
        })) ?? [];
      setWins(rows);
    } catch (e) {
      if (!authLoading && e?.status === 401) {
        navigate("/login", { replace: true });
      } else {
        setWins([]);
      }
    } finally {
      setInitialLoading(false);
      fetchingRef.current = false;
    }
  }, [authLoading, token, navigate]);

  useEffect(() => {
    if (!authLoading && token) {
      fetchAll();
    }
  }, [authLoading, token, fetchAll]);

  const totalWins = wins.length;

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col">
      {/* HERO — Wall.svg как фон */}
      <div className="relative flex-shrink-0 overflow-hidden">
        <img
          src={wall}
          alt="Lucky Winner profile background"
          loading="eager"
          fetchpriority="high"
          decoding="async"
          className="w-full h-[66vh] min-h-[500px] md:h-[70vh] object-cover rounded-b-[48px] select-none pointer-events-none"
          style={{
            objectPosition: "50% -70%",
            transform: "translateY(-160px)",
          }}
        />

        <div className="absolute inset-x-0 top-0 z-10">
          <Header />
        </div>
      </div>

      {/* КОНТЕНТ — общий -mt-[420px] */}
      <div className="-mt-[420px] relative z-10">
        {/* Заголовок */}
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <img src={icProfile} alt="" className="h-9 w-9" />
            {t("profile")}
          </h1>
        </div>

        {/* Основной контент — чуть ниже */}
        <div className="mt-16 md:mt-20">
          {/* User ID + Settings */}
          <div className="pt-2 pb-4">
            <div className="w-[90%] mx-auto px-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs opacity-70">{t("userId")}</div>
                  <div className="text-sm font-semibold">
                    {authLoading ? "…" : userId || "—"}
                  </div>
                </div>
                <button
                  className="p-2 text-[#FFFE45] bg-transparent"
                  onClick={() => {
                    trackClick("settings_btn", "/profile");
                    navigate("/settings");
                  }}
                  aria-label="Settings"
                >
                  <img src={setting} alt="Settings" className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Таблица выигрышей */}
          <div className="pb-4">
            <div
              className="w-[90%] mx-auto rounded-3xl overflow-hidden"
              style={{
                backgroundColor: "#1A1A1A",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 0 20px rgba(0,0,0,0.3)",
              }}
            >
              <div className="px-4 pt-4 pb-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm opacity-70">{t("myWinnings")}</div>
                  <div className="flex items-center gap-1 bg-[#FFFE45] text-black px-2 py-1 rounded-full text-xs font-semibold">
                    <img src={wincub} alt="Win" className="h-3 w-3 mr-1" />{" "}
                    {totalWins || 0}
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto px-4 -mt-2">
                <table className="w-full table-fixed text-[6px] leading-none text-[#8C8C8C]">
                  <thead>
                    <tr className="text-[#FFFE45]">
                      <th className="py-[6px] text-left text-[10px]">
                        {t("number")}
                      </th>
                      <th className="py-[6px] text-center text-[10px]">
                        {t("date")}
                      </th>
                      <th className="py-[6px] text-center text-[10px]">
                        {t("winnings")}
                      </th>
                      <th className="py-[6px] text-center text-[10px]">
                        {t("status")}
                      </th>
                      <th className="py-[6px] text-center text-[10px]">
                        {t("claimed", "Claimed")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {initialLoading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-3 text-center text-[10px] text-[#8C8C8C]"
                        >
                          {t("loading")}…
                        </td>
                      </tr>
                    ) : (wins || []).length > 0 ? (
                      wins.map((w, i) => (
                        <tr key={i} className="border-b border-white/10">
                          <td className="py-[6px] text-[10px] text-left">
                            {w.n}
                          </td>
                          <td className="py-[6px] text-[10px] text-center">
                            {w.date}
                          </td>
                          <td className="py-[6px] text-[10px] text-center">
                            {w.amount}
                          </td>
                          <td className="py-[6px] text-[10px] text-center">
                            {w.status}
                          </td>
                          <td className="py-[6px] text-[10px] text-center">
                            {w.claimed ? t("yes", "Yes") : t("no", "No")}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-3 text-center text-[10px] text-[#8C8C8C]"
                        >
                          {t("noData")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="pb-2 mt-2 flex flex-col justify-center items-center">
            <button
              className="w-[90%] rounded-3xl py-3 px-4 font-semibold relative"
              style={{
                background:
                  "linear-gradient(#151515, #151515) padding-box, " +
                  "linear-gradient(to bottom, rgba(255,255,255,0.22), #151515) border-box",
                border: "1px solid transparent",
                boxShadow:
                  "0 4px 8px rgba(0,0,0,0.18), " +
                  "0 14px 28px rgba(0,0,0,0.16), " +
                  "0 32px 60px rgba(0,0,0,0.14)",
              }}
              onClick={() => {
                trackClick("support_btn", "/profile");
                const tg = window.Telegram?.WebApp;
                const url = "https://win888strazci.com/en/office/support";
                if (tg?.openLink) tg.openLink(url);
                else window.open(url, "_blank", "noopener");
              }}
            >
              <span className="text-[#FFFE45]">{t("support")}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
