// src/pages/Profile.jsx
import { useEffect, useState, useContext, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";

import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import setting from "../assets/setting.svg";
import wincub from "../assets/wincub.svg";
import Header from "../components/Header";
import ClaimBonusModal from "../components/ClaimBonusModal";
import ClaimConfirmationModal from "../components/ClaimConfirmationModal";
import ClaimBonusButton from "../components/ClaimBonusButton";

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token, loading: authLoading } = useContext(AuthCtx);

  const [userId, setUserId] = useState("");
  const [wins, setWins] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true); // только для первого фетча
  const [showClaimBonus, setShowClaimBonus] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fetchingRef = useRef(false);

  const CLAIM_AMOUNT = 500;

  // Редирект только когда init завершён и токена нет
  useEffect(() => {
    if (!authLoading && !token) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, token, navigate]);

  const isSameUTCDate = (d1, d2) =>
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate();

  // Основной загрузчик
  const fetchAll = useCallback(async () => {
    if (authLoading || !token) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      // 1) /api/me — внешний ID + флаг одноразовой модалки
      const me = await api("/api/me", { token });
      const extId =
        me?.external_id ?? me?.ledger_user_id ?? me?.auth_user_id ?? me?.user_id;
      setUserId(extId != null ? String(extId) : "—");

      // Показываем бонусную модалку при необходимости
      if (me?.should_show_claim_denied) {
        api("/api/claim-denied-ack", { method: "POST", token }).catch(() => {});
        setShowClaimBonus(true);
      }

      // 2) /api/winners/my — фактические выигрыши
      const my = await api("/api/winners/my", { token });
      const rows =
        (my?.winnings || []).map((w, idx) => ({
          n: idx + 1,
          computed_at: w.computed_at, // пригодится для проверки «сегодня»
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

  // Стартовый фетч
  useEffect(() => {
    if (!authLoading && token) {
      fetchAll();
    }
  }, [authLoading, token, fetchAll]);

  // Есть ли на сегодня незаклейменный выигрыш?
  const hasUnclaimedToday = useMemo(() => {
    if (!wins?.length) return false;
    const todayUTC = new Date();
    return wins.some((w) => {
      if (!w?.computed_at) return false;
      const d = new Date(w.computed_at);
      return isSameUTCDate(d, todayUTC) && !w.claimed;
    });
  }, [wins]);

  // Общий обработчик «забрать бонус» — одинаков для модалки и кнопки
  const handleClaim = useCallback(async () => {
    try {
      await api("/api/claim-bonus", {
        method: "POST",
        token,
        body: { amount: CLAIM_AMOUNT, reason: "bonus" },
      });
      // Показать подтверждение
      setShowConfirm(true);
      // Обновить таблицу
      await fetchAll();
    } catch (e) {
      console.error("claim-bonus failed", e);
    } finally {
      setShowClaimBonus(false);
    }
  }, [token, fetchAll]);

  const totalWins = wins.length;

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative">
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

      {/* Контент */}
      <div className="relative z-10 mt-[10vh]">
        {/* User ID + Settings */}
        <div className="pt-4 pb-4">
          <div className="w-[90%] mx-auto px-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs opacity-70">{t("userId")}</div>
                <div className="text-sm font-semibold">
                  {authLoading ? "…" : (userId || "—")}
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
                  {initialLoading ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-[10px] text-[#8C8C8C]">
                        {t("loading")}…
                      </td>
                    </tr>
                  ) : (wins || []).length > 0 ? (
                    wins.map((w, i) => (
                      <tr key={i} className="border-b border-white/10">
                        <td className="py-[6px] text-[10px] text-left">{w.n}</td>
                        <td className="py-[6px] text-[10px] text-center">{w.date}</td>
                        <td className="py-[6px] text-[10px] text-center">{w.amount}</td>
                        <td className="py-[6px] text-[10px] text-center">{w.status}</td>
                        <td className="py-[6px] text-[10px] text-center">
                          {w.claimed ? t("yes", "Yes") : t("no", "No")}
                        </td>
                      </tr>
                    ))
                  ) : (
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
              const tg = window.Telegram?.WebApp;
              const url = "https://win888strazci.com/en/office/support";
              if (tg?.openLink) tg.openLink(url);
              else window.open(url, "_blank", "noopener");
            }}
          >
            <span className="text-[#FFFE45]">{t("support")}</span>
          </button>
        </div>

        {/* Новая КНОПКА «Claim Bonus» ПОД Support — показываем только если сегодня есть незаклейменный выигрыш */}
        {hasUnclaimedToday && (
          <ClaimBonusButton
            amount={CLAIM_AMOUNT}
            onClick={handleClaim}
            className="mb-6"
          />
        )}
      </div>

      {/* Модалка Claim Bonus (автопоказ по one-off флагу) */}
      <ClaimBonusModal
        open={showClaimBonus}
        amount={CLAIM_AMOUNT}
        onConfirm={handleClaim}
      />

      {/* Модалка подтверждения после успешного клейма */}
      <ClaimConfirmationModal
        open={showConfirm}
        onOK={() => setShowConfirm(false)}
      />
    </div>
  );
}
