// src/pages/Login.jsx
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import { setAutoLoginDisabled } from "../auth/tokenStore";

import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import Header from "../components/Header";
import BottomNav from "../components/BottomNav";
import ClaimBonusModal from "../components/ClaimBonusModal";
import EmailNotFoundModal from "../components/EmailNotFoundModal";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
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
  const [balance, setBalance] = useState(0);
  const [showClaimBonus, setShowClaimBonus] = useState(false);

  const CLAIM_AMOUNT = 500;
  const MAX_RESENDS = 5;

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

  const sendCode = async () => {
    setMsg("");
    const emailNorm = normalizeEmail(email);
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
      const chk = await api("/api/auth/exists", {
        method: "POST",
        body: { email: emailNorm },
        token,
      });
      if (!chk?.exists) {
        setEmail(emailNorm);
        setShowNotFound(true);
        setErrors((p) => ({ ...p, email: "" }));
        return;
      }
      await api("/api/verify/send", {
        method: "POST",
        body: { email: emailNorm },
        token,
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
        body: { email: emailNorm, code },
        token,
      });
      if (res.token) {
        await setToken(res.token);
        await setAutoLoginDisabled(false);

        try {
          const me = await api("/api/me", { token: res.token });
          if (typeof me?.balance === "number") setBalance(me.balance);
          if (me?.should_show_claim_denied) {
            api("/api/claim-denied-ack", {
              method: "POST",
              token: res.token,
            }).catch(() => {});
            setShowClaimBonus(true);
            return;
          }
        } catch (postLoginErr) {
          console.error("post-login /api/me failed:", postLoginErr);
        }

        navigate(location.state?.from || "/", { replace: true });
        return;
      }
      setMsg(t("verificationFailed"));
    } catch (e) {
      if (e.status === 400)
        setErrors((p) => ({
          ...p,
          code: e?.error || t("invalidCode"),
        }));
      else setMsg(e?.error || t("loginError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col">
      {/* HERO с Wall.svg, как в Home/Winners */}
      <div className="relative flex-shrink-0 overflow-hidden">
        <img
          src={wall}
          alt="Lucky Winner login background"
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

      {/* Весь контент (заголовок + форма) сильно поднят вверх за счёт отрицательного margin */}
      <div className="-mt-[68vh] sm:-mt-[210px] md:-mt-[250px] lg:-mt-[290px] relative z-10 flex-1 flex flex-col">
        {/* Заголовок LOGIN */}
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <img src={icProfile} alt="" className="h-9 w-9" />
            {t("login")}
          </h1>
        </div>

        {/* Форма */}
        <form
          className="flex flex-col flex-1 overflow-y-auto px-4 pb-6 mt-[14vh]"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) login();
          }}
        >
          {/* Email */}
          <div className="transition-none flex justify-center mt-2">
            <div className="w-[90%]">
              <div
                className="relative rounded-3xl px-3 py-2"
                style={styleFor(!!errors.email)}
              >
                <input
                  className="w-full bg-transparent rounded-3xl text-white outline-none text-[12px] md:text-[14px] text-left py-2"
                  placeholder={t("email")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email)
                      setErrors((p) => ({ ...p, email: "" }));
                  }}
                  inputMode="email"
                  autoComplete="email"
                  type="email"
                  enterKeyHint="next"
                />
              </div>
              <div className="h-4 relative">
                {errors.email && (
                  <span className="absolute left-3 top-[2px] text-[#C80302] text-[10px]">
                    {errors.email}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Send code */}
          {(() => {
            const disabled =
              left > 0 || (firstSent && resendCount >= MAX_RESENDS);
            return (
              <div className="w-[90%] mx-auto text-center">
                <span
                  role="button"
                  tabIndex={0}
                  aria-disabled={disabled}
                  onClick={disabled ? undefined : sendCode}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !disabled && sendCode()
                  }
                  className={`font-normal leading-tight ${
                    disabled
                      ? "text-[#FFFE45]/50 cursor-not-allowed"
                      : "text-[#FFFE45] cursor-pointer hover:opacity-90 active:opacity-80"
                  } text-[14px] md:text-[16px]`}
                  title={
                    disabled
                      ? firstSent && resendCount >= MAX_RESENDS
                        ? t("resendLimitReached")
                        : t("pleaseWait")
                      : t("sendCode")
                  }
                >
                  {t("sendCode")}
                </span>
              </div>
            );
          })()}

          {/* Enter code */}
          <div className="transition-none flex justify-center mt-6">
            <div className="w-[90%]">
              <div
                className="relative rounded-3xl px-3 py-2"
                style={styleFor(!!errors.code)}
              >
                <input
                  className="w-full bg-transparent rounded-3xl text-white outline-none text-[12px] md:text-[14px] text-left py-2"
                  placeholder={t("enterCode")}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    if (errors.code)
                      setErrors((p) => ({ ...p, code: "" }));
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

          {/* Таймер под inputs */}
          <div className="w-full flex justify-center mt-3 mb-1">
            <div
              className={`h-4 flex items-center text-[10px] font-semibold text-center ${
                left > 0 ? "" : "invisible"
              }`}
            >
              <span className="text-[#FFFE45]">{left}</span>{" "}
              <span className="text-gray-400">
                {t("secondLeft")}
              </span>
            </div>
          </div>

          {/* Login button */}
          <div className="transition-none flex justify-center mt-2">
            <button
              type="submit"
              className="w-[90%] py-3 rounded-3xl bg-[#FFFE45] text-black font-extrabold text-lg shadow-lg text-center"
              disabled={loading}
            >
              {loading ? t("loading") : t("enter")}
            </button>
          </div>

          {msg && (
            <div className="text-sm text-red-400 text-center mt-4">
              {msg}
            </div>
          )}
        </form>

      </div>

      {/* Нижняя навигация — как была */}
      <BottomNav />

      {/* Claim Bonus — одна кнопка */}
      <ClaimBonusModal
        open={showClaimBonus}
        amount={CLAIM_AMOUNT}
        onConfirm={async () => {
          try {
            await api("/api/claim-bonus", {
              method: "POST",
              token: localStorage.getItem("jwt") || token,
              body: { amount: CLAIM_AMOUNT, reason: "bonus" },
            });
          } catch (e) {
            console.error("claim-bonus failed", e);
          } finally {
            setShowClaimBonus(false);
            navigate(location.state?.from || "/", { replace: true });
          }
        }}
        onClose={() => {
          setShowClaimBonus(false);
          navigate(location.state?.from || "/", { replace: true });
        }}
      />

      <EmailNotFoundModal
        open={showNotFound}
        email={normalizeEmail(email)}
        onClose={() => setShowNotFound(false)}
      />
    </div>
  );
}
