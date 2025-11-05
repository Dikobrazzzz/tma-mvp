// src/pages/Main.jsx
import { useEffect, useState, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
// УДАЛЕНО: import imageMan from "../assets/Image man.svg";
// УДАЛЕНО: import hero ...?imagetools
import ProgressBar from "../components/ProgressBar";
import Countdown from "../components/Countdown";
import Header from "../components/Header";

export default function Main() {
  const { t } = useTranslation();
  const { token } = useContext(AuthCtx);
  const navigate = useNavigate();
  const SITE_URL = "https://win888strazci.com/en";

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
    nextMidnight.setUTCHours(24, 0, 0, 0);
    return nextMidnight.getTime();
  };

  // Целевые значения для витрины
  const TARGET_MAX = 5000; // общий банк — €5 000
  const PROGRESS_AMOUNT = 500; // текущая сумма — €500
  const PROGRESS_VALUE = PROGRESS_AMOUNT / TARGET_MAX; // 0.1 (10%)

  const [data, setData] = useState({
    maxWin: TARGET_MAX,
    currency: "€",
    progress: PROGRESS_VALUE,
    nextDrawAt: calculateNextDraw(),
  });

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api("/api/me"); // JWT-запрос
        if (cancelled) return;
        // нет логики модалки
      } catch (e) {
        console.error("Main: /api/me failed:", e);
        // navigate("/login", { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [token, navigate]);

  const { maxWin, currency, progress, nextDrawAt } = data;
  const formattedWin = (maxWin || TARGET_MAX).toLocaleString("ru-RU");

  const paragraphs = useMemo(
    () =>
      t("description")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    [t]
  );

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col">
      {/* Preload одного из мобильно-типичных размеров (браузер всё равно выберет нужный из picture/srcset) */}
      <link
        rel="preload"
        as="image"
        href="/hero/hero-720.avif"
        fetchpriority="high"
      />

      <div className="relative flex-shrink-0">
        {/* HERO: варианты лежат в /public/hero, генерятся скриптом build-hero.mjs */}
        <picture>
          <source
            type="image/avif"
            srcSet="/hero/hero-480.avif 480w, /hero/hero-720.avif 720w, /hero/hero-1080.avif 1080w, /hero/hero-1440.avif 1440w"
            sizes="100vw"
          />
          <source
            type="image/webp"
            srcSet="/hero/hero-480.webp 480w, /hero/hero-720.webp 720w, /hero/hero-1080.webp 1080w, /hero/hero-1440.webp 1440w"
            sizes="100vw"
          />
          {/* JPG — самый совместимый фоллбэк */}
          <img
            src="/hero/hero-1080.jpg"
            srcSet="/hero/hero-480.jpg 480w, /hero/hero-720.jpg 720w, /hero/hero-1080.jpg 1080w, /hero/hero-1440.jpg 1440w"
            sizes="100vw"
            alt="Изображение человека"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            className="w-full h-[66vh] min-h-[500px] md:h-[70vh] object-cover rounded-b-[48px] select-none pointer-events-none"
            style={{ objectPosition: "50% 62%" }}
          />
        </picture>

        <div className="absolute inset-x-0 top-0 z-10">
          <Header />
        </div>
      </div>

      <div className="-mt-[22vh] sm:-mt-[200px] md:-mt-[240px] lg:-mt-[280px] relative z-10">
        <div className="px-6 text-center">
          <div className="text-white text-xs mb-2">{t("prizePool")}</div>
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
          <ProgressBar
            value={progress}
            amount={PROGRESS_AMOUNT}
            currency={currency}
          />
          <Countdown to={nextDrawAt} />
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

          <div className="transition-none">
            <span
              onClick={() => setExpanded((v) => !v)}
              className="text-center block w-full text-[#fffe45] text-sm hover:text-yellow-200 cursor-pointer transition-colors select-none"
            >
              {t("moreDetails")} {expanded ? "▲" : "▼"}
            </span>
          </div>

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
