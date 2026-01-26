import React from "react";
import { useTranslation } from "react-i18next";

export default function ClaimBonusButton({ amount = 500, onClick, className = "" }) {
  const { t, i18n } = useTranslation();
  const cta =
    (i18n.exists("claimBonusCTA") && t("claimBonusCTA")) ||
    (i18n.exists("claimBonus") && t("claimBonus")) ||
    "Claim Bonus";

  return (
    <div className={`w-[90%] mx-auto ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="w-full py-3 rounded-full bg-[#fffe45] text-black font-extrabold text-lg shadow-lg
                   hover:opacity-95 active:scale-[0.98]
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20
                   transition"
        aria-label={cta}
      >
        {cta}
      </button>
    </div>
  );
}
