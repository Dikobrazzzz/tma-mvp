// src/pages/Main.jsx
import { useEffect, useState, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import ProgressBar from "../components/ProgressBar";
import Countdown from "../components/Countdown";
import Header from "../components/Header";

// 🔹 НОВОЕ: импортируем SVG из assets
import imageMan from "../assets/Image man.optimized.svg";

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
    // Сбрасываем таймер в 00:01 UTC следующего дня (только для отсчёта времени)
    const reset = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        1,
        0,
        0
      )
    );
    return reset.getTime();
  };

  // Витрина по умолчанию
  const DEFAULT_CAP = 5000; // визуальный prize pool

  const [data, setData] = useState({
    cap: DEFAULT_CAP, // кап для прогресса
    currency: "€",
    progressAmount: 0, // фактический накопленный банк
    progress: 0, // 0..1
    nextDrawAt: calculateNextDraw(),
  });

  const [expanded, setExpanded] = useState(false);

  // Пробуем подтянуть профиль (как было)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api("/api/me"); // JWT-запрос (автоматически)
        if (cancelled) return;
        // нет логики модалки
      } catch (e) {
        console.error("Main: /api/me failed:", e);
        // navigate("/login", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);


  const applyProgress = () => {
    const DEMO_AMOUNT = 5000; // временное значение для прогресс-бара

    setData((d) => {
      const cap = DEFAULT_CAP
      return {
        ...d,
        cap,
        progressAmount: DEMO_AMOUNT,              // всегда 1500
        progress: Math.min(DEMO_AMOUNT / cap, 1), 
      };
    });
  };


  //const applyProgress = (amount, capFromServer) => {
  //  setData((d) => {
   //   const cap = Math.max(1, Number(capFromServer) || d.cap || DEFAULT_CAP);
    //  const a = Math.max(0, Number(amount) || 0);
    //  return {
    //    ...d,
    //    cap,
     //   progressAmount: a, // сколько накоплено
      //  progress: Math.min(a / cap, 1), // 0..1
    //  };
  //  });
//  };

  // Первичная загрузка прогресса + поллинг
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await api("/api/ui-progress");
        if (stop) return;

        const amount = res?.amount_eur ?? 0;
        const cap = res?.cap_eur ?? DEFAULT_CAP;
        applyProgress(amount, cap);

        if (res?.reset_at_utc) {
          const ts = new Date(res.reset_at_utc).getTime();
          setData((d) => ({ ...d, nextDrawAt: ts }));
        } else {
          setData((d) => ({ ...d, nextDrawAt: calculateNextDraw() }));
        }
      } catch (e) {
        // молчим
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  // Принимаем "пуш" от Profile после успешного клейма
  useEffect(() => {
    const onUiProgress = (e) => {
      const detail = e?.detail || {};
      if (detail.amount_eur != null) {
        applyProgress(detail.amount_eur, detail.cap_eur);
      }
    };
    window.addEventListener("ui-progress", onUiProgress);
    return () => window.removeEventListener("ui-progress", onUiProgress);
  }, []);

  const { currency, progress, progressAmount, nextDrawAt } = data;

  // Prize pool ВСЕГДА 5000 — витринная цель, не зависящая от прогресса
  const formattedWin = DEFAULT_CAP.toLocaleString("ru-RU");

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
      {/* Раньше тут был preload hero-AVIF. Можно удалить, т.к. теперь используем SVG */}

      <div className="relative flex-shrink-0">
        {/* 🔹 HERO теперь на SVG */}
        <img
          src={imageMan}
          alt="Lucky Winner hero"
          loading="eager"
          fetchpriority="high"
          decoding="async"
          className="w-full h-[66vh] min-h-[500px] md:h-[70vh] object-cover rounded-b-[48px] select-none pointer-events-none"
          style={{ objectPosition: "50% 62%" }}
        />

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
            amount={progressAmount}
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
