// src/components/Header.jsx
import { useContext, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { AuthCtx } from "../auth/TelegramProvider";
import logo from "../assets/logo.svg";
import flagUk from "../assets/flag-uk.svg";
import BalanceBadge from "./BalanceBadge";

export default function Header({
  className = "",
  logoHref = "https://win888strazci.com/en",
  showFlag = true,
  balanceAmount = 0,        // ← дефолт 0
  currency = "€",
}) {
  const { t, i18n } = useTranslation();
  const { token } = useContext(AuthCtx);

  const LOGO_H = "h-5";
  const FLAG_H = "h-7";
  const BTN_H  = "h-7";

  const toggleLanguage = () => {
    const newLang = i18n.language === "en" ? "ru" : "en";
    i18n.changeLanguage(newLang);
    localStorage.setItem("language", newLang);
  };

  const onLogoClick = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(logoHref);
    else window.open(logoHref, "_blank", "noopener");
  }, [logoHref]);

  return (
    <div className={`relative z-10 flex-shrink-0 px-4 pt-3 pb-2 flex items-center justify-between leading-none ${className}`}>
      {/* Логотип */}
      <img
        src={logo}
        alt="eStarz"
        className={`${LOGO_H} cursor-pointer`}
        onClick={onLogoClick}
      />

      {/* Правый блок */}
      <div className="flex items-center gap-2">
        {showFlag && (
          <button
            onClick={toggleLanguage}
            className="p-0 m-0 inline-flex items-center justify-center leading-none focus:outline-none border-none bg-transparent hover:bg-transparent active:bg-transparent"
            aria-label="toggle language"
            type="button"
          >
            <img
              src={flagUk}
              className={`${FLAG_H} w-7 rounded-full`}
              alt={i18n.language.toUpperCase()}
            />
          </button>
        )}

        {token ? (
          // Для залогиненного пользователя — всегда 0
          <BalanceBadge amount={0} currency={currency} />
          // Если хочешь оставить возможность прокинуть другое значение из пропсов, можно так:
          // <BalanceBadge amount={balanceAmount ?? 0} currency={currency} />
        ) : (
          <Link
            to="/login"
            className={`${BTN_H} inline-flex items-center justify-center px-8 rounded-full bg-[#fffe45] text-black text-xs font-medium leading-none`}
            style={{ lineHeight: 1 }}
          >
            {t("login")}
          </Link>
        )}
      </div>
    </div>
  );
}
