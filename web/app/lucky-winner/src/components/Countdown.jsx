// src/components/Countdown.jsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function Countdown({ to }) {
  const { t } = useTranslation();

  const [left, setLeft] = useState(() =>
    Math.max(0, Math.floor((to - Date.now()) / 1000))
  );

  useEffect(() => {
    const tmr = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tmr);
  }, []);

  const h = String(Math.floor(left / 3600)).padStart(2, "0");
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");

  return (
    <div className="text-center">
      <div className="text-white/70 text-sm mb-1">
        {t("nextDrawStartsInTitle")}
      </div>

      <div className="flex items-center justify-center gap-6">
        <div className="flex items-baseline gap-1">
          <div className="text-xl font-extrabold text-yellow-300">{h}</div>
          <div className="text-xs text-white/60">{t("hourShort")}</div>
        </div>

        <div className="flex items-baseline gap-1">
          <div className="text-xl font-extrabold text-yellow-300">{m}</div>
          <div className="text-xs text-white/60">{t("minuteShort")}</div>
        </div>
      </div>
    </div>
  );
}
