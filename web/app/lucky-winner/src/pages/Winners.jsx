// src/pages/Winners.jsx
import { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";

import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import wall from "../assets/Wall.svg";
import icWinners from "../assets/ic_Winners.svg";
import Header from "../components/Header";

const Tab = ({ active, children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: "8px 14px",
      fontSize: "12px",
      borderRadius: "9999px",
      minWidth: "auto",
      minHeight: "36px",
      whiteSpace: "nowrap",
      background: active ? "#FFFE45" : "#1A1A1A",
      color: active ? "#000000" : "#FFFFFF",
      boxShadow: active ? "none" : "0 4px 10px rgba(0,0,0,0.25)",
      fontWeight: active ? 700 : 500,
      border: "1px solid transparent",
      transition: "transform 0.15s ease, box-shadow 0.2s ease",
      cursor: "pointer",
    }}
    onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
    onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
  >
    {children}
  </button>
);

function maskEmail(email) {
  const s = String(email || "");
  const [name, dom = ""] = s.split("@");
  const head = name.slice(0, Math.min(3, name.length)).padEnd(3, "*");
  return `${head}****${dom ? "@" + dom : ""}`;
}

export default function Winners() {
  const { t } = useTranslation();
  const { token } = useContext(AuthCtx);

  const [tab, setTab] = useState("today");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const tabs = {
    today: t("today"),
    yesterday: t("yesterday"),
    last7: t("last7Days"),
    top10: t("top10Win"),
  };

  // Маппинг вкладки -> диапазон бэкенда
  const rangeForTab = (key) => {
    switch (key) {
      case "today":
        return "today";
      case "yesterday":
        return "yesterday";
      case "last7":
        return "last7";
      case "top10":
        return "last7";
      default:
        return "today";
    }
  };

  const capForTab = (key) => {
    if (key === "last7") return 50;
    if (key === "top10") return 10;
    return 25;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const range = rangeForTab(tab);
        const res = await api(`/api/winners?range=${encodeURIComponent(range)}`);
        if (cancelled) return;

        let rows = (Array.isArray(res) ? res : []).map((r, i) => {
          const claimedBool =
            (typeof r.claimed === "boolean" ? r.claimed : false) ||
            Boolean(r.claimed_at);
          const amountNum = Number(r.win_amount ?? 0);
          return {
            n: i + 1,
            user: maskEmail(r.email_norm),
            count: r.win_count ?? 1,
            wins: `€${amountNum.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`,
            claimed: claimedBool,
          };
        });

        rows = rows.slice(0, capForTab(tab));

        if (tab === "top10") {
          rows.sort((a, b) => {
            const av = Number(String(a.wins).replace(/[^\d.]/g, "")) || 0;
            const bv = Number(String(b.wins).replace(/[^\d.]/g, "")) || 0;
            return bv - av;
          });
        }

        setData(rows);
      } catch (e) {
        setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, token]); // token на всякий

  if (loading) {
    return (
      <div className="min-h-screen bg-[#151515] text-white flex items-center justify-center">
        {t("loading")}...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col">
      {/* HERO — Wall.svg как фон, аналогично Home */}
      <div className="relative flex-shrink-0 overflow-hidden">
        <img
          src={wall}
          alt="Lucky Winner winners background"
          loading="eager"
          fetchpriority="high"
          decoding="async"
          className="w-full h-[66vh] min-h-[500px] md:h-[70vh] object-cover rounded-b-[48px] select-none pointer-events-none"
          style={{
            objectPosition: "50% -70%",   // подняли фон
            transform: "translateY(-160px)",
          }}
        />

        <div className="absolute inset-x-0 top-0 z-10">
          <Header />
        </div>
      </div>

      {/* КОНТЕНТ — заезжает на фон, как на Home */}
      <div className="-mt-[68vh] sm:-mt-[200px] md:-mt-[240px] lg:-mt-[280px] relative z-10">
        {/* Заголовок */}
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <img src={icWinners} alt="" className="h-9 w-9" />
            {t("winners")}
          </h1>
        </div>

        {/* Остальной контент — чуть опустили вниз */}
        <div className="mt-20 md:mt-24 flex flex-col items-center px-4 pb-6">
          {/* Табы */}
          <div className="flex gap-3 flex-wrap justify-center mb-4">
            {Object.entries(tabs).map(([key, label]) => (
              <Tab key={key} active={tab === key} onClick={() => setTab(key)}>
                {label}
              </Tab>
            ))}
          </div>

          {/* Таблица */}
          <div
            className="w-full max-w-[90%] mx-auto rounded-3xl overflow-hidden shadow-lg"
            style={{
              backgroundColor: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 0 20px rgba(0,0,0,0.3)",
            }}
          >
            <div className="overflow-y-auto px-4">
              <table className="w-full table-fixed text-[6px] text-[#8C8C8C]">
                <thead>
                  <tr className="text-[#FFFE45]">
                    <th className="py-2 text-center text-[10px]">
                      {t("number")}
                    </th>
                    <th className="py-2 text-left text-[10px]">
                      {t("userId")}
                    </th>
                    <th className="py-2 text-center text-[10px] leading-tight">
                      <span className="block">Total wins</span>
                      <span className="block">count</span>
                    </th>
                    <th className="py-2 text-center text-[10px] leading-tight">
                      <span className="block">Wins</span>
                      <span className="block">amount</span>
                    </th>
                    <th className="py-2 text-center text-[10px]">
                      {t("claimed", "Claimed")}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {data.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-4 text-center text-[10px]"
                      >
                        {t("noData")}
                      </td>
                    </tr>
                  ) : (
                    data.map((item, i) => (
                      <tr key={i} className="border-b border-white/10">
                        <td className="py-2 text-[13px] text-center">
                          {item.n}
                        </td>
                        <td className="py-2 text-[13px] text-left truncate">
                          {item.user}
                        </td>
                        <td className="py-2 text-[13px] text-center">
                          {item.count}
                        </td>
                        <td className="py-2 text-[13px] text-center">
                          {item.wins}
                        </td>
                        <td className="py-2 text-[13px] text-center">
                          {item.claimed ? t("yes", "Yes") : t("no", "No")}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
