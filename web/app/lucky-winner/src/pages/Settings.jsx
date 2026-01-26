import { useEffect, useState, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import {
  clearTokenNoReload,
  setAutoLoginDisabled,
} from "../auth/tokenStore";

import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import exit from "../assets/Exit.svg";
import languageIcon from "../assets/Language.svg";
import Header from "../components/Header";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const { token, setToken, loading: authLoading } = useContext(AuthCtx);

  const normalize = (lng) =>
    lng?.toLowerCase().startsWith("ru") ? "ru" : "en";

  const [userId, setUserId] = useState("");
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState(normalize(i18n.language));

  useEffect(() => {
    if (!authLoading && !token) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, token, navigate]);

  useEffect(() => {
    let cancelled = false;

    const fetchMe = async () => {
      if (authLoading || !token) return;
      try {
        const me = await api("/api/me", { token });
        if (cancelled) return;

        const extId =
          me?.external_id ??
          me?.ledger_user_id ??
          me?.auth_user_id ??
          me?.user_id;

        setUserId(extId != null ? String(extId) : "—");
      } catch {
        if (!authLoading) navigate("/login", { replace: true });
      }
    };

    fetchMe();
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, navigate]);

  const panelStyle = useMemo(
    () => ({
      backgroundColor: "#1A1A1A",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "none",
      borderRadius: "1.5rem",
    }),
    []
  );

  const rowBase =
    "w-full flex flex-nowrap items-center justify-between px-4 py-2 text-sm";

  const itemStyle = (active) => ({
    fontSize: "14px",
    background: "transparent",
    color: active ? "#FFFE45" : "#FFFFFF",
    fontWeight: 400,
    border: "none",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    transition: "color 0.15s ease",
  });

  const handleLanguageSelect = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("language", lang);
    setSelectedLang(lang);
    setIsLanguageOpen(false);
  };

  const handleLogout = async () => {
    try {
      await setAutoLoginDisabled(true);
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {}

    await clearTokenNoReload();

    setToken("");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative">
      <div className="absolute inset-x-0 top-0 z-[400]">
        <Header />
      </div>

      <div className="relative flex-shrink-0 overflow-hidden">
        <img
          src={wall}
          alt="Lucky Winner settings background"
          loading="eager"
          fetchpriority="high"
          decoding="async"
          className="w-full h-[66vh] min-h-[500px] md:h-[70vh] object-cover rounded-b-[48px] select-none pointer-events-none"
          style={{
            objectPosition: "50% -70%",
            transform: "translateY(-160px)",
          }}
        />
      </div>

      <div className="-mt-[420px] relative z-10">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <img src={icProfile} alt="" className="h-9 w-9" />
            {t("settings")}
          </h1>
        </div>

        <div className="mt-16 md:mt-20">
          <div className="pt-2 pb-4">
            <div className="w-[90%] mx-auto px-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs opacity-70">{t("userId")}</div>
                  <div className="text-sm font-semibold">
                    {userId || "—"}
                  </div>
                </div>

                <button
                  className="ml-auto inline-flex items-center justify-center rounded-3xl px-3 h-8 font-semibold"
                  style={{
                    background:
                      "linear-gradient(#151515, #151515) padding-box, " +
                      "linear-gradient(to bottom, rgba(255,255,255,0.22), #151515) border-box",
                    border: "1px solid transparent",
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,0.18), " +
                      "0 3.5px 7px rgba(0,0,0,0.16), " +
                      "0 8px 15px rgba(0,0,0,0.14)",
                  }}
                  onClick={() => navigate("/profile")}
                >
                  <span className="text-[#FFFE45] text-xs leading-none">
                    {t("back")}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="w-[90%] mx-auto space-y-4 pb-4">
            <div className="w-full overflow-hidden" style={panelStyle}>
              <div
                className={`${rowBase} select-none cursor-pointer`}
                onClick={() => setIsLanguageOpen((v) => !v)}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <img
                    src={languageIcon}
                    alt="Language"
                    className="h-4 w-4"
                  />
                  <span className="text-white">{t("language")}</span>
                </span>
                <span
                  className="ml-auto shrink-0 leading-none"
                  style={{ fontSize: "28px", lineHeight: 1 }}
                  aria-hidden
                >
                  {isLanguageOpen ? "▴" : "▾"}
                </span>
              </div>

              {isLanguageOpen && (
                <div className="border-t border-white/10" />
              )}

              <div
                className="transition-all duration-200"
                style={{
                  paddingLeft: isLanguageOpen ? "1rem" : 0,
                  paddingRight: isLanguageOpen ? "1rem" : 0,
                  maxHeight: isLanguageOpen ? 200 : 0,
                  paddingTop: isLanguageOpen ? "0.5rem" : 0,
                  paddingBottom: isLanguageOpen ? "0.5rem" : 0,
                  overflow: "hidden",
                }}
              >
                {isLanguageOpen && (
                  <div className="flex flex-col">
                    <button
                      className="w-full flex items-center py-2 leading-none"
                      style={itemStyle(selectedLang === "en")}
                      onClick={() => handleLanguageSelect("en")}
                    >
                      {t("language.en")}
                    </button>
                    <div className="border-t border-white/10 -mx-4" />
                    <button
                      className="w-full flex items-center py-2 leading-none"
                      style={itemStyle(selectedLang === "ru")}
                      onClick={() => handleLanguageSelect("ru")}
                    >
                      {t("language.ru")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            className="fixed left-4 flex justify-start"
            style={{ bottom: "14vh" }}
          >
            <button
              className="flex items-center outline-none focus:outline-none border-none bg-transparent hover:bg-transparent active:bg-transparent"
              onClick={handleLogout}
            >
              <img src={exit} alt="Exit" className="h-5 w-5 mr-2" />
              <span className="text-white text-xs">{t("goOut")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
