// src/pages/Home.jsx
import { useTranslation } from "react-i18next";

import Header from "../components/Header";
import wall from "../assets/Wall.svg";
import icTerms from "../assets/ic_Terms.svg";

export default function Home() {
  const { t } = useTranslation();

  const paragraphs = t("description")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col">
      {/* HERO — Wall.svg как фон, поднятый вверх (как на Winners) */}
      <div className="relative flex-shrink-0 overflow-hidden">
        <img
          src={wall}
          alt="Lucky Winner terms background"
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

      {/* КОНТЕНТ — заезжает на фон по той же схеме, что и Winners (-mt-[420px]) */}
      <div className="-mt-[420px] relative z-10">
        {/* Title */}
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <img src={icTerms} alt="" className="h-9 w-9" />
            {t("terms")}
          </h1>
        </div>

        {/* Остальной контент */}
        <div className="flex-1 px-4 space-y-4 overflow-y-auto pt-4 pb-6 mt-6">
          {/* Win up to €5000 */}
          <div className="py-4">
            <div className="flex items-baseline gap-2 text-3xl font-bold tracking-tight text-left">
              <span className="text-sm">{t("winUpTo")}</span>
              <span className="text-[#fffe45] text-3xl">€5 000</span>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-1.5 max-w-[90%] mx-auto">
            {/* 1 */}
            <div
              className="relative rounded-2xl p-1.5 flex items-center gap-3 text-white"
              style={{
                background:
                  "linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 40%, #c50f0d 100%) padding-box, " +
                  "linear-gradient(180deg, rgba(255,255,255,0.22), #151515) border-box",
                border: "1px solid transparent",
                boxShadow:
                  "0 4px 8px rgba(0,0,0,0.18), " +
                  "0 14px 28px rgba(0,0,0,0.16), " +
                  "0 32px 60px rgba(0,0,0,0.14)",
              }}
            >
              <span className="text-3xl font-bold text-white min-w-[1.5rem] ml-2">
                1
              </span>
              <span className="flex-1 text-sm">
                {t("registerWith888Starz")}
              </span>
            </div>

            {/* 2 */}
            <div
              className="relative rounded-2xl p-1.5 flex items-center gap-3 text-white"
              style={{
                background:
                  "linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 40%, #c50f0d 100%) padding-box, " +
                  "linear-gradient(180deg, rgba(255,255,255,0.22), #151515) border-box",
                border: "1px solid transparent",
                boxShadow:
                  "0 4px 8px rgba(0,0,0,0.18), " +
                  "0 14px 28px rgba(0,0,0,0.16), " +
                  "0 32px 60px rgba(0,0,0,0.14)",
              }}
            >
              <span className="text-3xl font-bold text-white min-w-[1.5rem] ml-2">
                2
              </span>
              <span className="flex-1 text-sm">{t("placeFirstBet")}</span>
            </div>

            {/* 3 */}
            <div
              className="relative rounded-2xl p-1.5 flex items-center gap-3 text-white"
              style={{
                background:
                  "linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 40%, #c50f0d 100%) padding-box, " +
                  "linear-gradient(180deg, rgba(255,255,255,0.22), #151515) border-box",
                border: "1px solid transparent",
                boxShadow:
                  "0 4px 8px rgba(0,0,0,0.18), " +
                  "0 14px 28px rgba(0,0,0,0.16), " +
                  "0 32px 60px rgba(0,0,0,0.14)",
              }}
            >
              <span className="text-3xl font-bold text-white min-w-[1.5rem] ml-2">
                3
              </span>
              <span className="flex-1 text-sm">{t("receiveBonus")}</span>
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="space-y-3 mt-6">
            <h3 className="text-lg font-semibold text-white">{t("text")}</h3>
            <div className="text-xs leading-relaxed text-[#7D7D7D] space-y-3">
              {paragraphs.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
