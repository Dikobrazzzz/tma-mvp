// src/pages/Profile.jsx
import { useEffect, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import setting from "../assets/setting.svg";
import wincub from "../assets/wincub.svg";
import Header from "../components/Header";

export default function Profile() {
  const { t } = useTranslation();

  const navigate = useNavigate();
  const { token } = useContext(AuthCtx);

  const [data, setData] = useState({
    userId: "askill4831641654",
    totalWins: 34,
    winnings: [
      { n: 1, date: "03.10", amount: "€1200", status: "Win" },
      { n: 2, date: "08.09", amount: "€900", status: "Win" },
      { n: 3, date: "08.09", amount: "€900", status: "Win" },
      { n: 4, date: "08.09", amount: "€900", status: "Win" },
      { n: 5, date: "08.09", amount: "€900", status: "Win" },
      { n: 6, date: "08.09", amount: "€900", status: "Win" },
      { n: 7, date: "08.09", amount: "€900", status: "Win" },
    ],
  });

  const { userId, totalWins, winnings = [] } = data;

  // Открыть ссылку во внешнем браузере (Telegram Mini App friendly)
  const openExternal = (url) => {
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, "_blank", "noopener");
  };

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative">
      {/* Фон */}
      <img
        src={wall}
        alt=""
        className="fixed inset-x-0 top-[-14%] w-full scale-30 object-cover z-0"
      />

      <Header />

      {/* Заголовок */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <img src={icProfile} alt="" className="h-9 w-9" />
          {t("profile")}
        </h1>
      </div>

      <div className="relative z-10 mt-[10vh]">
        {/* User ID + Settings */}
        <div className="pt-4 pb-4">
          <div className="w-[90%] mx-auto px-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs opacity-70">{t("userId")}</div>
                <div className="text-sm font-semibold">{userId}</div>
              </div>
              <button
                className="p-2 text-[#FFFE45] bg-transparent"
                onClick={() => navigate("/settings")}
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
                  <img src={wincub} alt="Win" className="h-3 w-3 mr-1" /> {totalWins || 0}
                </div>
              </div>
            </div>

            {/* Центрируем Date / Winnings / Status */}
            <div className="overflow-y-auto px-4 -mt-2">
              <table className="w-full text-[6px] leading-none text-[#8C8C8C]">
                <thead>
                  <tr className="text-[#FFFE45]">
                    <th className="py-[6px] text-left  text-[10px]">{t("number")}</th>
                    <th className="py-[6px] text-center text-[10px]">{t("date")}</th>
                    <th className="py-[6px] text-center text-[10px]">{t("winnings")}</th>
                    <th className="py-[6px] text-center text-[10px]">{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(winnings || []).map((w, i) => (
                    <tr key={i} className="border-b border-white/10">
                      <td className="py-[6px] text-[10px] text-left">{w.n}</td>
                      <td className="py-[6px] text-[10px] text-center">{w.date}</td>
                      <td className="py-[6px] text-[10px] text-center">{w.amount}</td>
                      <td className="py-[6px] text-[10px] text-center">{w.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="pb-6 mt-2 flex flex-col justify-center items-center">
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
            onClick={() => openExternal("https://win888strazci.com/en/office/support")}
          >
            <span className="text-[#FFFE45]">{t("support")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
