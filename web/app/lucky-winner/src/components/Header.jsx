// /opt/tma-mvp/web/app/lucky-winner/src/components/Header.jsx
import { useContext, useCallback } from "react";
import { AuthCtx } from "../auth/TelegramProvider";
import { Link } from "react-router-dom";
import logo from "../assets/logo.svg";
import flagUk from "../assets/flag-uk.svg";
import BalanceBadge from "./BalanceBadge";

export default function Header({
  className = "",
  logoHref = "https://888starz.bet",
  showFlag = true,
  balanceAmount = 1500,
  currency = "€",
}) {
  const { token } = useContext(AuthCtx);

  const onLogoClick = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(logoHref);                    // Telegram Mini App
    } else {
      window.open(logoHref, "_blank", "noopener"); // Браузер
    }
  }, [logoHref]);

  return (
    <div className={`relative z-10 flex-shrink-0 p-4 flex items-center justify-between ${className}`}>
      {/* Лого — кликабельно */}
      <img
        src={logo}
        alt="eStarz"
        className="h-5 cursor-pointer"
        onClick={onLogoClick}
      />

      <div className="flex items-center gap-2">
        {showFlag && (
          <img src={flagUk} className="h-5 w-5 rounded-full" alt="UK" />
        )}

        {token ? (
          <BalanceBadge amount={balanceAmount} currency={currency} />
        ) : (
          <Link
            to="/login"
            className="px-3 py-1 bg-[#fffe45] text-black rounded-full text-xs"
          >
            Login
          </Link>
        )}
      </div>
    </div>
  );
}
