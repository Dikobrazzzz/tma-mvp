// src/pages/Login.jsx
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import Header from "../components/Header";
import BottomNav from "../components/BottomNav";

export default function Login() {
  const { t } = useTranslation();

  const navigate = useNavigate();
  const { token, setToken } = useContext(AuthCtx);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  // таймер 30 сек на повторную отправку
  const [left, setLeft] = useState(0);
  // отметка времени отправки кода (для 30-минутной валидности)
  const [sentAt, setSentAt] = useState(null); // number|null (ms)
  // лимит повторных отправок: не более 5 раз ПОСЛЕ первой
  const [firstSent, setFirstSent] = useState(false);
  const [resendCount, setResendCount] = useState(0);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ email: "", code: "" });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (left > 0) {
      const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
      return () => clearInterval(t);
    }
  }, [left]);

  // стили «как €5000 в Main»
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
    if (!email.trim()) {
      setErrors((p) => ({ ...p, email: t("thisFieldRequired") }));
      return;
    }
    if (firstSent && resendCount >= MAX_RESENDS) {
      setMsg(t("resendLimitReached"));
      return;
    }
    if (left > 0) return;

    try {
      await api("/api/verify/send", { method: "POST", token, body: { email } });
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

    if (!email.trim()) {
      nextErrors.email = t("thisFieldRequired"); has = true;
    }
    if (!code.trim()) {
      nextErrors.code = t("thisFieldRequired"); has = true;
    }
    setErrors(nextErrors);
    if (has) return;

    // валидность кода: 30 минут с момента последней отправки
    const THIRTY_MIN = 30 * 60 * 1000;
    if (!sentAt || Date.now() - sentAt > THIRTY_MIN) {
      setErrors((p) => ({ ...p, code: t("codeExpired") }));
      return;
    }

    try {
      setLoading(true);
      const res = await api("/api/verify/check", { method: "POST", token, body: { email, code } });
      if (res.token) {
        setToken(res.token);
        localStorage.setItem("jwt", res.token);
        navigate("/profile", { replace: true });
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
          {t("login")}
        </h1>
      </div>

      {/* Контент */}
      <div className="relative z-10 flex-1 px-4 pt-[15vh] overflow-y-auto">
        {/* Email */}
        <div className="transition-none flex justify-center">
          <div className="w-[90%]">
            <div className="relative rounded-3xl px-3 py-2" style={styleFor(!!errors.email)}>
              <input
                className="w-full bg-transparent rounded-3xl text-white outline-none text-[12px] md:text-[14px] text-left py-2"
                placeholder=""
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                }}
                inputMode="email"
                autoComplete="email"
              />
              {/* Лейбл рендерим только когда поле пустое */}
              {!email.trim() && (
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2
                             text-[#9CA3AF] text-[14px] md:text-[16px] font-light"
                >
                  {t("email")}
                </span>
              )}
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

        {/* "Send code" */}
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
                placeholder=""
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errors.code) setErrors((p) => ({ ...p, code: "" }));
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              {/* Лейбл рендерим только когда поле пустое */}
              {!code.trim() && (
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2
                             text-[#9CA3AF] text-[14px] md:text-[16px] font-light"
                >
                  {t("enterCode")}
                </span>
              )}
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

        {/* Отступ перед таймером/кнопкой — регулирует общий блок ниже */}
        <div className="h-[12vh]" />

        {/* ТАЙМЕР — фиксированный слот, чтобы кнопка не двигалась */}
        <div className="w-full flex justify-center mb-2">
          <div
            className={`h-4 flex items-center text-[10px] font-semibold text-center ${left > 0 ? "" : "invisible"}`}
            aria-hidden={left > 0 ? "false" : "true"}
          >
            <span className="text-[#FFFE45]">{left}</span>{" "}
            <span className="text-gray-400">{t("secondLeft")}</span>
          </div>
        </div>

        {/* Кнопка Enter — позиция больше не меняется */}
        <div className="transition-none flex justify-center mt-[2vh]">
          <button
            onClick={login}
            className="w-[90%] py-3 rounded-3xl bg-[#FFFE45] text-black font-extrabold text-lg shadow-lg text-center"
            disabled={loading}
          >
            {loading ? t("loading") : t("enter")}
          </button>
        </div>

        {/* Общие ошибки (сервер/сеть) */}
        {msg && <div className="text-sm text-red-400 text-center mt-4">{msg}</div>}
      </div>

      <BottomNav />
    </div>
  );
}
