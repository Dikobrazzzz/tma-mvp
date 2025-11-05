// src/pages/Login.jsx
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import { setAutoLoginDisabled } from "../auth/tokenStore"; // NEW
import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import Header from "../components/Header";
import BottomNav from "../components/BottomNav";
import ClaimBonusModal from "../components/ClaimBonusModal";
import ClaimConfirmationModal from "../components/ClaimConfirmationModal"; // NEW: импорт отдельного компонента
import EmailNotFoundModal from "../components/EmailNotFoundModal";
import claimBack from "../assets/Claim_back.svg"; // Reused for consistency

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token, setToken } = useContext(AuthCtx);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(0);
  const [sentAt, setSentAt] = useState(null);
  const [firstSent, setFirstSent] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ email: "", code: "" });
  const [msg, setMsg] = useState("");
  const [showNotFound, setShowNotFound] = useState(false);
  // баланс для шапки
  const [balance, setBalance] = useState(0);
  // модалка «Claim Bonus» после логина
  const [showClaimBonus, setShowClaimBonus] = useState(false);
  // NEW: вторая модалка с подтверждением
  const [showConfirmation, setShowConfirmation] = useState(false);
  const CLAIM_AMOUNT = 500;

  useEffect(() => {
    if (left > 0) {
      const tmr = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
      return () => clearInterval(tmr);
    }
  }, [left]);

  const normalizeEmail = (e) => e.trim().toLowerCase();
  const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const baseBorder = {
    background:
      "linear-gradient(#151515, #151515) padding-box, linear-gradient(to bottom, rgba(255,255,255,0.22), #151515) border-box",
    border: "1px solid transparent",
    boxShadow:
      "0 4px 8px rgba(0,0,0,0.18), 0 14px 28px rgba(0,0,0,0.16), 0 32px 60px rgba(0,0,0,0.14)",
  };
  const errorBorder = {
    background:
      "linear-gradient(#151515, #151515) padding-box, linear-gradient(#C80302, #C80302) border-box",
    border: "1px solid transparent",
    boxShadow:
      "0 4px 8px rgba(0,0,0,0.18), 0 14px 28px rgba(0,0,0,0.16), 0 32px 60px rgba(0,0,0,0.14)",
  };
  const styleFor = (hasError) => (hasError ? errorBorder : baseBorder);

  const MAX_RESENDS = 5;

  const sendCode = async () => {
    setMsg("");
    const emailNorm = normalizeEmail(email);
    // кастомная валидация email
    if (!emailNorm) {
      setErrors((p) => ({ ...p, email: t("thisFieldRequired") }));
      return;
    }
    if (!isValidEmail(emailNorm)) {
      setErrors((p) => ({ ...p, email: t("invalidEmail", "Invalid email") }));
      return;
    }
    if (firstSent && resendCount >= MAX_RESENDS) {
      setMsg(t("resendLimitReached"));
      return;
    }
    if (left > 0) return;
    try {
      // проверка в белом списке
      const chk = await api("/api/auth/exists", {
        method: "POST",
        token,
        body: { email: emailNorm },
      });
      if (!chk?.exists) {
        setShowNotFound(true);
        setErrors((p) => ({ ...p, email: "" }));
        return;
      }
      await api("/api/verify/send", {
        method: "POST",
        token,
        body: { email: emailNorm },
      });
      setLeft(30);
      const now = Date.now();
      setSentAt(now);
      if (!firstSent) setFirstSent(true);
      else setResendCount((n) => n + 1);
    } catch (e) {
      setMsg(e?.error || t("sendError"));
    }
  };

  const login = async () => {
    setMsg("");
    const nextErrors = { email: "", code: "" };
    let has = false;
    const emailNorm = normalizeEmail(email);
    if (!emailNorm) {
      nextErrors.email = t("thisFieldRequired");
      has = true;
    } else if (!isValidEmail(emailNorm)) {
      nextErrors.email = t("invalidEmail", "Invalid email");
      has = true;
    }
    if (!code.trim()) {
      nextErrors.code = t("thisFieldRequired");
      has = true;
    }
    setErrors(nextErrors);
    if (has) return;
    const THIRTY_MIN = 30 * 60 * 1000;
    if (!sentAt || Date.now() - sentAt > THIRTY_MIN) {
      setErrors((p) => ({ ...p, code: t("codeExpired") }));
      return;
    }
    try {
      setLoading(true);
      const res = await api("/api/verify/check", {
        method: "POST",
        token,
        body: { email: emailNorm, code },
      });
      if (res.token) {
        // сохраняем токен централизованно (CloudStorage + LS через AuthCtx)
        await setToken(res.token);
        // включаем автологин по initData на будущее (после явного входа)
        await setAutoLoginDisabled(false); // NEW
        // пост-логин: профиль (баланс + флаг модалки)
        try {
          const me = await api("/api/me", { token: res.token });
          if (typeof me?.balance === "number") setBalance(me.balance);
          if (me?.should_show_claim_denied) {
            api("/api/claim-denied-ack", { method: "POST", token: res.token }).catch(() => {});
            setShowClaimBonus(true);
            return; // дождёмся действия в модалке
          }
        } catch (postLoginErr) {
          console.error("post-login /api/me check failed:", postLoginErr);
        }
        // обычный сценарий
        navigate("/", { replace: true });
        return;
      }
      setMsg(t("verificationFailed"));
    } catch (e) {
      if (e.status === 400) {
        setErrors((p) => ({ ...p, code: e?.error || t("invalidCode") }));
      } else {
        setMsg(e?.error || t("loginError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative pb-20">
      <img
        src={wall}
        alt=""
        className="fixed inset-x-0 top-[-14%] w-full scale-30 object-cover z-0"
      />
      <Header balanceAmount={balance} />
      <div className="relative z-10 px-4 pt-4 pb-2">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <img src={icProfile} alt="" className="h-9 w-9" />
          {t("login")}
        </h1>
      </div>
      {/* ФОРМА */}
      <form
        className="relative z-10 flex-1 px-4 pt-[15vh] overflow-y-auto"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading) login();
        }}
      >
        {/* Email */}
        <div className="transition-none flex justify-center">
          <div className="w-[90%]">
            <div className="relative rounded-3xl px-3 py-2" style={styleFor(!!errors.email)}>
              <input
                className="w-full bg-transparent rounded-3xl text-white outline-none text-[12px] md:text-[14px] text-left py-2"
                placeholder={t("email")}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                }}
                inputMode="email"
                autoComplete="email"
                type="email"
                enterKeyHint="next"
              />
            </div>
            <div className="h-4 relative">
              {errors.email && (
                <span className="absolute left-3 top-[2px] text-[#C80302] text-[10px] font-normal">
                  {errors.email}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Send code */}
        {(() => {
          const sendDisabled = left > 0 || (firstSent && resendCount >= MAX_RESENDS);
          return (
            <div className="w-[90%] mx-auto -mt-1 text-center">
              <span
                role="button"
                tabIndex={0}
                aria-disabled={sendDisabled}
                onClick={sendDisabled ? undefined : sendCode}
                onKeyDown={(e) => e.key === "Enter" && !sendDisabled && sendCode()}
                className={`font-normal leading-tight ${
                  sendDisabled
                    ? "text-[#FFFE45]/50 cursor-not-allowed"
                    : "text-[#FFFE45] cursor-pointer hover:opacity-90 active:opacity-80"
                } text-[14px] md:text-[16px]`}
                title={
                  firstSent && resendCount >= MAX_RESENDS
                    ? t("resendLimitReached")
                    : left > 0
                    ? t("pleaseWait")
                    : t("sendCode")
                }
              >
                {t("sendCode")}
              </span>
            </div>
          );
        })()}
        {/* Enter code */}
        <div className="transition-none flex justify-center mt-[4vh]">
          <div className="w-[90%]">
            <div className="relative rounded-3xl px-3 py-2" style={styleFor(!!errors.code)}>
              <input
                className="w-full bg-transparent rounded-3xl text-white outline-none text-[12px] md:text-[14px] text-left py-2"
                placeholder={t("enterCode")}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errors.code) setErrors((p) => ({ ...p, code: "" }));
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="go"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (!loading) login();
                  }
                }}
              />
            </div>
            <div className="h-4 relative">
              {errors.code && (
                <span className="absolute left-3 top-[2px] text-[#C80302] text-[10px] font-semibold">
                  {errors.code}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Spacer */}
        <div className="h-[12vh]" />
        {/* Timer */}
        <div className="w-full flex justify-center mb-2">
          <div
            className={`h-4 flex items-center text-[10px] font-semibold text-center ${left > 0 ? "" : "invisible"}`}
            aria-hidden={left > 0 ? "false" : "true"}
          >
            <span className="text-[#FFFE45]">{left}</span>{" "}
            <span className="text-gray-400">{t("secondLeft")}</span>
          </div>
        </div>
        {/* Login button */}
        <div className="transition-none flex justify-center mt-[2vh]">
          <button
            type="submit"
            className="w-[90%] py-3 rounded-3xl bg-[#FFFE45] text-black font-extrabold text-lg shadow-lg text-center"
            disabled={loading}
          >
            {loading ? t("loading") : t("enter")}
          </button>
        </div>
        {msg && <div className="text-sm text-red-400 text-center mt-4">{msg}</div>}
      </form>
      <BottomNav />
      {/* Модалка Claim Bonus сразу после логина */}
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
            if (typeof r?.new_balance === "number") setBalance(r.new_balance);
          } catch (e) {
            console.error("claim-bonus failed", e);
          } finally {
            setShowClaimBonus(false);
            setShowConfirmation(true); // NEW: показать вторую модалку
          }
        }}
        onClose={() => {
          setShowClaimBonus(false);
          navigate("/", { replace: true });
        }}
      />
      {/* NEW: Модалка подтверждения после Claim Bonus */}
      <ClaimConfirmationModal
        open={showConfirmation}
        onOK={() => {
          setShowConfirmation(false);
          navigate("/", { replace: true });
        }}
      />
      <EmailNotFoundModal open={showNotFound} onClose={() => setShowNotFound(false)} />
    </div>
  );
}
