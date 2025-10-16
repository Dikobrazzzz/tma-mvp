// src/pages/Main.jsx
import { useEffect, useState, useContext } from "react";
import { useTranslation } from "react-i18next";

import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import imageMan from "../assets/Image man.svg";
import ProgressBar from "../components/ProgressBar";
import Countdown from "../components/Countdown";
import Header from "../components/Header";

export default function Main() {
  const { t } = useTranslation();
  const { token } = useContext(AuthCtx);

  const SITE_URL = "https://win888strazci.com/en";

  // как в BottomNav: предотвращаем дефолт ТОЛЬКО если можем открыть через Telegram
  const onDepositClick = (e) => {
    const tg = window?.Telegram?.WebApp;
    if (tg?.openLink) {
      e.preventDefault();
      tg.openLink(SITE_URL);
    }
  };

  const calculateNextDraw = () => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setUTCHours(24, 0, 0, 0); // Next day at 00:00 UTC
    return nextMidnight.getTime();
  };

  const [data, setData] = useState({
    maxWin: 5000,
    currency: "€",
    balance: 1500,
    progress: 0.2,
    nextDrawAt: calculateNextDraw(),
  });

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (token) {
      api("/api/user")
        .then((responseData) => setData((prev) => ({ ...prev, ...responseData })))
        .catch((err) => console.error("User fetch error:", err));
    }
  }, [token]);

  const { maxWin, currency, balance, progress, nextDrawAt } = data;
  const formattedWin = (maxWin || 5000).toLocaleString("ru-RU");

  // Абзацы для описания
  const paragraphs = t("description").split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col">
      {/* Hero + Header */}
      <div className="relative flex-shrink-0">
        <img
          src={imageMan}
          alt=""
          className="w-full h-[66vh] min-h-[500px] md:h-[70vh] object-cover rounded-b-[48px] select-none pointer-events-none"
          style={{ objectPosition: "50% 62%" }}
        />
        <div className="absolute inset-x-0 top-0 z-10">
          <Header balanceAmount={balance} currency={currency} />
        </div>
      </div>

      {/* Контент */}
      <div className="-mt-[22vh] sm:-mt-[200px] md:-mt-[240px] lg:-mt-[280px] relative z-10">
        <div className="px-6 text-center">
          <div className="text-white/70 text-xs mb-2">{t("prizePool")}</div>

          <div
            className="relative mx-auto max-w-[12.8rem] rounded-3xl p-2 text-center"
            style={{
              background:
                "linear-gradient(#151515, #151515) padding-box, " +
                "linear-gradient(to bottom, rgba(255,255,255,0.22), #151515) border-box",
              border: "1px solid transparent",
              boxShadow:
                "0 4px 8px rgba(0,0,0,0.18), 0 14px 28px rgba(0,0,0,0.16), 0 32px 60px rgba(0,0,0,0.14)",
            }}
          >
            <div className="text-5xl font-bold text-[#fffe45] tracking-tight">
              {currency}
              {formattedWin}
            </div>
          </div>
        </div>

        <div className="px-6 mt-4 flex flex-col gap-4 max-w-md mx-auto">
          <div className="transition-none">
            <ProgressBar value={progress || 0.2} amount={maxWin || 5000} currency={currency || "€"} />
          </div>

          <div className="transition-none">
            <Countdown to={nextDrawAt} />
          </div>

          {/* Deposit: ссылка-«кнопка», логика как в BottomNav */}
          <div className="transition-none flex justify-center">
            <a
              href={SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onDepositClick}
              className="inline-flex items-center justify-center w-[90%] py-3 rounded-full bg-[#fffe45] text-black font-extrabold text-lg shadow-lg text-center active:scale-95 focus:outline-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
              aria-label={t("deposit")}
            >
              {t("deposit")}
            </a>
          </div>

          {/* Тогглер подробностей */}
          <div className="transition-none">
            <span
              onClick={() => setExpanded((v) => !v)}
              className="text-center block w-full text-[#fffe45] text-sm hover:text-yellow-200 cursor-pointer transition-colors select-none"
            >
              {t("moreDetails")} {expanded ? "▲" : "▼"}
            </span>
          </div>

          {/* Блок условий рендерим только когда открыт */}
          {expanded && (
            <div className="mt-3">
              <div className="space-y-3 text-sm opacity-70 leading-relaxed">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
