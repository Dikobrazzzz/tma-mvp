// src/components/BottomNav.jsx
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from 'react-i18next';

import lucky from "../assets/Lucky.svg";
import luckyY from "../assets/Lucky-y.svg";
import terms from "../assets/Terms-2.svg";
import termsY from "../assets/Terms-y.svg";
import icProfile from "../assets/ic_Profile.svg";
import profileY from "../assets/Profile-y.svg";
import icWinners from "../assets/ic_Winners.svg";
import winnersY from "../assets/Winners-y.svg";
import cta from "../assets/CTA.svg";

export default function BottomNav() {
  const { t } = useTranslation();

  const { pathname } = useLocation();

  const isLuckyActive   = pathname === "/" || pathname.startsWith("/lucky");
  const isTermsActive   = pathname.startsWith("/home");
  const isProfileActive = pathname.startsWith("/profile") || pathname.startsWith("/login");
  const isWinnersActive = pathname.startsWith("/winners");

  const LIFT_PRESET = "subtle";  

  const LIFT = {
    subtle: { icon: "-translate-y-[2px]", text: "-translate-y-[2px]" },
    medium: { icon: "-translate-y-[4px]", text: "-translate-y-[3px]" },
    high:   { icon: "-translate-y-[7px]", text: "-translate-y-[6px]" },
  }[LIFT_PRESET];

  const ITEM_OFFSET = ""; 

  const iconCls = (active, key) =>
    `h-6 w-6 mb-1 transition-all ${ITEM_OFFSET} ${
      active ? "" : `grayscale opacity-60 ${key === "lucky" ? "brightness-105" : ""}`
    }`;

  const textCls = (active) =>
    `text-xs ${ITEM_OFFSET} ${active ? "text-white" : "text-white/60"}`;

  const TwoLineLabel = ({ active, line1, line2Hidden = false, extra = "" }) => (
    <div className={`flex flex-col items-center leading-tight ${textCls(active)} ${extra}`}>
      <span>{line1}</span>
      <span className={line2Hidden ? "opacity-0 select-none" : undefined}>
        {line2Hidden ? "•" : t('luckyWinner').split(' ')[1]}
      </span>
    </div>
  );

  const SITE_URL = "https://win888strazci.com/en";
  const onCtaClick = (e) => {
    const tg = window?.Telegram?.WebApp;
    if (tg?.openLink) {
      e.preventDefault();        
      tg.openLink(SITE_URL);     
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a]/95 backdrop-blur border-t border-white/10 flex justify-around items-center h-20 z-50 rounded-t-[20px]">
      {/* Terms */}
      <NavLink to="/home" className="flex flex-col items-center py-2 ml-2" aria-current={isTermsActive ? "page" : undefined}>
        <img src={isTermsActive ? termsY : terms} alt="Terms" className={`${iconCls(isTermsActive, "terms")} scale-90`} />
        <TwoLineLabel active={isTermsActive} line1={t('terms')} line2Hidden />
      </NavLink>

      {/* Центр: Lucky + CTA + Profile */}
      <div className="flex items-center gap-4">
        {/* Lucky (с подъёмом) */}
        <NavLink to="/" className="flex flex-col items-center py-2" aria-current={isLuckyActive ? "page" : undefined}>
          <img
            src={isLuckyActive ? luckyY : lucky}
            alt="Lucky"
            className={`${iconCls(isLuckyActive, "lucky")} ${LIFT.icon}`}
          />
          <TwoLineLabel
            active={isLuckyActive}
            line1={t('luckyWinner').split(' ')[0]}
            extra={LIFT.text}  
          />
        </NavLink>

        {/* CTA — обычная ссылка; без рамок/фонов/квадратов */}
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onCtaClick}
          className="flex flex-col items-center justify-center w-30 h-30 active:scale-95 focus:outline-none"
          style={{ WebkitTapHighlightColor: "transparent" }}
          aria-label={t('deposit')}
        >
          <img
            src={cta}
            alt="CTA"
            className="w-24 h-24 pointer-events-none select-none"
            draggable="false"
          />
        </a>

        {/* Profile */}
        <NavLink to="/profile" className="flex flex-col items-center py-2" aria-current={isProfileActive ? "page" : undefined}>
          <img src={isProfileActive ? profileY : icProfile} alt="Profile" className={iconCls(isProfileActive, "profile")} />
          <TwoLineLabel active={isProfileActive} line1={t('profile')} line2Hidden />
        </NavLink>
      </div>

      {/* Winners */}
      <NavLink to="/winners" className="flex flex-col items-center py-2 mr-2" aria-current={isWinnersActive ? "page" : undefined}>
        <img src={isWinnersActive ? winnersY : icWinners} alt="Winners" className={iconCls(isWinnersActive, "winners")} />
        <TwoLineLabel active={isWinnersActive} line1={t('winners')} line2Hidden />
      </NavLink>
    </nav>
  );
}
