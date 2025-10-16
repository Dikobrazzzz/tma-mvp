// src/pages/Settings.jsx
import { useEffect, useState, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import { clearToken } from "../auth/tokenStore";

import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import exit from "../assets/Exit.svg";
import languageIcon from "../assets/Language.svg";
import Header from "../components/Header";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { token, setToken } = useContext(AuthCtx);

  const normalize = (lng) => (lng?.toLowerCase().startsWith("ru") ? "ru" : "en");

  const [data, setData] = useState({ userId: "askill4831641654" });
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [selectedLang, setSelectedLang] = useState(normalize(i18n.language));

  useEffect(() => {
    if (token) {
      api("/api/profile")
        .then((responseData) => {
          if (!responseData || !responseData.email_verified) {
            navigate("/login");
            return;
          }
          setData((prev) => ({ ...prev, ...responseData }));
        })
        .catch(() => navigate("/login"));
    } else {
      navigate("/login");
    }
  }, [token, navigate]);

  const { userId } = data;

  const panelStyle = useMemo(
    () => ({
      backgroundColor: "#1A1A1A",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "none",
      borderRadius: "1.5rem",
    }),
    []
  );

  // ↓ БЫЛО py-3 — стало py-2, чтобы высота Language совпала с English/Russian
  const rowBase = "w-full flex flex-nowrap items-center justify-between px-4 py-2 text-sm";

  // Размер/толщина как у Language (text-sm, обычный вес)
  const itemStyle = (active) => ({
    fontSize: "14px",  // = text-sm
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
    await clearToken();
    setToken("");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative">
      <img
        src={wall}
        alt=""
        className="fixed inset-x-0 top-[-14%] w-full scale-30 object-cover z-0"
      />
      <Header />

      <div className="relative z-10 px-4 pt-4 pb-2">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <img src={icProfile} alt="" className="h-9 w-9" />
          {t("settings")}
        </h1>
      </div>

      <div className="relative z-10 mt-[10vh]">
        {/* userId + Back */}
        <div className="pt-4 pb-4">
          <div className="w-[90%] mx-auto px-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs opacity-70">{t("userId")}</div>
                <div className="text-sm font-semibold">{userId}</div>
              </div>

              {/* Back — по центру по вертикали */}
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
                <span className="text-[#FFFE45] text-xs leading-none">{t("back")}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="w-[90%] mx-auto space-y-4 pb-4">
          <div className="w-full overflow-hidden" style={panelStyle}>
            {/* Заголовок Language — теперь py-2 */}
            <div
              className={`${rowBase} select-none cursor-pointer`}
              onClick={() => setIsLanguageOpen((v) => !v)}
            >
              <span className="flex items-center gap-2 min-w-0">
                <img src={languageIcon} alt="Language" className="h-4 w-4" />
                <span className="text-white">Language</span>
              </span>

              {/* Увеличенная стрелка справа */}
              <span
                className="ml-auto shrink-0 leading-none"
                style={{ fontSize: "28px", lineHeight: 1 }}
                aria-hidden
              >
                {isLanguageOpen ? "▴" : "▾"}
              </span>
            </div>

            {/* Разделитель — только когда открыт */}
            {isLanguageOpen && <div className="border-t border-white/10" />}

            {/* Контент */}
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
                  {/* English — такая же высота: py-2 */}
                  <button
                    className="w-full flex items-center py-2 leading-none"
                    style={itemStyle(selectedLang === "en")}
                    onClick={() => handleLanguageSelect("en")}
                  >
                    {t("language.en")}
                  </button>

                  {/* Разделитель до краёв */}
                  <div className="border-t border-white/10 -mx-4" />

                  {/* Russian — такая же высота: py-2 */}
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

        {/* Go out — фиксировано, 14vh от нижнего края */}
        <div className="fixed left-4 flex justify-start" style={{ bottom: "14vh" }}>
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
  );
}
