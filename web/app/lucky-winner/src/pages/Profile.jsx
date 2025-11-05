// src/pages/Profile.jsx
import { useEffect, useState, useContext, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
// Удалено: import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import setting from "../assets/setting.svg";
import wincub from "../assets/wincub.svg";
import Header from "../components/Header";
import ClaimBonusModal from "../components/ClaimBonusModal";

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useContext(AuthCtx);

  useEffect(() => {
    if (!token) navigate("/login", { replace: true });
  }, [token, navigate]);

  const [userId, setUserId] = useState("");
  const [wins, setWins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClaimBonus, setShowClaimBonus] = useState(false);

  const CLAIM_AMOUNT = 500;

  const openExternal = (url) => {
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, "_blank", "noopener");
  };

  // Вынесли fetchAll, чтобы можно было вызвать и из onConfirm модалки
  const fetchAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    let me = null;
    try {
      // 1) профиль (+ внешний ID из выгрузок)
      me = await api("/api/me", { token });
      if (me) {
        const extId =
          me.external_id ?? me.ledger_user_id ?? me.auth_user_id ?? me.user_id;
        if (extId != null) setUserId(String(extId));

        // Показ модалки, если бэкенд выставил флаг
        if (me?.should_show_claim_denied) {
          api("/api/claim-denied-ack", { method: "POST", token }).catch(() => {});
          setShowClaimBonus(true);
        }
      }

      // 2) мои выигрыши
      const my = await api("/api/winners/my", { token });
      const prepared =
        (my?.winnings || []).map((w, idx) => ({
          n: idx + 1,
          date: new Date(w.computed_at).toLocaleDateString(),
          amount: `€${w.amount_eur}`,
          status: "Win",
          claimed: Boolean(w.claimed ?? w.is_claimed ?? false),
        })) ?? [];
      setWins(prepared);
    } catch (e) {
      // если токен устарел — на логин
      navigate("/login", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchAll();
    })();
    return () => { cancelled = true; };
  }, [fetchAll]);

  const totalWins = wins.length;

  return (
    <div
      className="min-h-screen bg-[#151515] text-white flex flex-col relative"
      // Опционально: мгновенная «заглушка»-фон (LQIP), если сгенерирован wall-lqip.avif
      style={{
        backgroundImage: "url(/wall/wall-lqip.avif)",
        backgroundSize: "cover",
        backgroundPosition: "50% 0%",
      }}
    >
      {/* Фон: responsive picture (AVIF/WebP/JPG) из public/wall */}
      <picture>
        <source
          type="image/avif"
          srcSet="/wall/wall-480.avif 480w, /wall/wall-720.avif 720w, /wall/wall-1080.avif 1080w, /wall/wall-1440.avif 1440w"
          sizes="100vw"
        />
        <source
          type="image/webp"
          srcSet="/wall/wall-480.webp 480w, /wall/wall-720.webp 720w, /wall/wall-1080.webp 1080w, /wall/wall-1440.webp 1440w"
          sizes="100vw"
        />
        <img
          src="/wall/wall-1080.jpg"
          srcSet="/wall/wall-480.jpg 480w, /wall/wall-720.jpg 720w, /wall/wall-1080.jpg 1080w, /wall/wall-1440.jpg 1440w"
          sizes="100vw"
          alt=""
          loading="lazy"
          fetchpriority="low"
          decoding="async"
          className="fixed inset-x-0 top-[-14%] w-full object-cover z-0"
          // Ранее был кастомный scale-30 — повторяем поведение:
          style={{ transform: "scale(0.30)", transformOrigin: "top center" }}
          aria-hidden="true"
        />
      </picture>

      <Header />

      {/* Заголовок */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <img src={icProfile} alt="" className="h-9 w-9" />
          {t("profile")}
        </h1>
      </div>

      {/* FIX: mt-[10vh] вместо mt={[ "10vh" ]} */}
      <div className="relative z-10 mt-[10vh]">
        {/* User ID + Settings */}
        <div className="pt-4 pb-4">
          <div className="w-[90%] mx-auto px-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs opacity-70">{t("userId")}</div>
                <div className="text-sm font-semibold">
                  {loading ? "…" : userId || "—"}
                </div>
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

            <div className="overflow-y-auto px-4 -mt-2">
              <table className="w-full table-fixed text-[6px] leading-none text-[#8C8C8C]">
                <thead>
                  <tr className="text-[#FFFE45]">
                    <th className="py-[6px] text-left text-[10px]">{t("number")}</th>
                    <th className="py-[6px] text-center text-[10px]">{t("date")}</th>
                    <th className="py-[6px] text-center text-[10px]">{t("winnings")}</th>
                    <th className="py-[6px] text-center text-[10px]">{t("status")}</th>
                    <th className="py-[6px] text-center text-[10px]">{t("claimed", "Claimed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(wins || []).map((w, i) => (
                    <tr key={i} className="border-b border-white/10">
                      <td className="py-[6px] text-[10px] text-left">{w.n}</td>
                      <td className="py-[6px] text-[10px] text-center">{w.date}</td>
                      <td className="py-[6px] text-[10px] text-center">{w.amount}</td>
                      <td className="py-[6px] text-[10px] text-center">{w.status}</td>
                      <td className="py-[6px] text-[10px] text-center">
                        {w.claimed ? t("yes", "Yes") : t("no", "No")}
                      </td>
                    </tr>
                  ))}
                  {!loading && wins.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-[10px] text-[#8C8C8C]">
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

      {/* Модалка Claim Bonus */}
      <ClaimBonusModal
        open={showClaimBonus}
        amount={CLAIM_AMOUNT}
        onConfirm={async () => {
          try {
            const r = await api("/api/claim-bonus", {
              method: "POST",
              token: localStorage.getItem("jwt") || token,
              body: { amount: CLAIM_AMOUNT, reason: "claim_denied_bonus" },
            });
            if (typeof r?.new_balance === "number") {
              // TODO: обновить баланс в Header или глобальном состоянии по месту
            }
          } catch (e) {
            console.error("claim-bonus failed", e);
          } finally {
            setShowClaimBonus(false);
            // Перечитать профиль и выигрыши после апдейта
            fetchAll();
          }
        }}
        onClose={() => setShowClaimBonus(false)}
      />
    </div>
  );
}
