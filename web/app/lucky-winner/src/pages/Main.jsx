// /opt/tma-mvp/web/app/lucky-winner/src/pages/Main.jsx
import { useEffect, useState, useContext } from "react";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import imageMan from "../assets/Image man.svg";
import ProgressBar from "../components/ProgressBar";
import Countdown from "../components/Countdown";
import Header from "../components/Header";

export default function Main() {
  console.log("Main renders OK");
  const { token } = useContext(AuthCtx);

  const [data, setData] = useState({
    maxWin: 5000,
    currency: "€",
    balance: 1500,
    progress: 0.2,
    nextDrawAt: Date.now() + 13 * 3600 * 1000 + 41 * 60 * 1000,
  });

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (token) {
      api("/api/user")
        .then((responseData) => {
          console.log("User data:", responseData);
          setData((prev) => ({ ...prev, ...responseData }));
        })
        .catch((err) => {
          console.error("User fetch error:", err);
        });
    }
  }, [token]);

  const handleDeposit = () => {
    location.href = "https://888starz.bet";
  };

  const { maxWin, currency, balance, progress, nextDrawAt } = data;

  // форматируем 5000 → "5 000"
  const formattedWin = (maxWin || 5000).toLocaleString("ru-RU");

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col">
      {/* Общая шапка */}
      <Header balanceAmount={balance} currency={currency} />

      {/* Фоновая картинка (не трогаем) */}
      <div className="relative flex-shrink-0">
        <div
          className="h-60 rounded-b-[48px] overflow-hidden bg-cover bg-center"
          style={{ backgroundImage: `url(${imageMan})` }}
        />
      </div>

      {/* Сдвиг вниз (оставил как у тебя) */}
      <div className="mt-[1vh]">
        {/* Надпись Prize pool и прямоугольник ниже */}
        <div className="px-6 text-center">
          <div className="text-white/70 text-xs mb-2">Prize pool</div>

          {/* Прямоугольник вокруг суммы — как у ProgressBar */}
          <div
            className="relative mx-auto max-w-[12.8rem] rounded-3xl p-2 text-center"
            style={{
              background:
                "linear-gradient(#151515, #151515) padding-box, " +
                "linear-gradient(to bottom, rgba(255,255,255,0.22), #151515) border-box",
              border: "1px solid transparent",
              boxShadow:
                "0 4px 8px rgba(0,0,0,0.18), " +
                "0 14px 28px rgba(0,0,0,0.16), " +
                "0 32px 60px rgba(0,0,0,0.14)",
            }}
          >
            <div className="text-5xl font-bold text-[#fffe45] tracking-tight">
              {currency}{formattedWin}
            </div>
          </div>
        </div>

        {/* Контент */}
        <div className="px-6 mt-6 flex flex-col gap-4 max-w-md mx-auto">
          <div className="transition-none">
            <ProgressBar value={progress || 0.2} amount={maxWin || 5000} currency={currency || "€"} />
          </div>

          <div className="transition-none">
            <Countdown to={nextDrawAt || Date.now() + 13 * 3600 * 1000 + 41 * 60 * 1000} />
          </div>

          <div className="transition-none flex justify-center">
            <button
              onClick={handleDeposit}
              className="w-[90%] py-3 rounded-full bg-[#fffe45] text-black font-extrabold text-lg shadow-lg text-center"
            >
              Deposit
            </button>
          </div>

          <div className="transition-none">
            <span
              onClick={() => setExpanded(!expanded)}
              className="text-center block w-full text-[#fffe45] text-sm hover:text-yellow-200 cursor-pointer transition-colors select-none"
            >
              More details {expanded ? "▲" : "▼"}
            </span>
          </div>

          <div
            className={expanded ? "visible opacity-100" : "invisible opacity-0"}
            style={{ transition: "opacity 0.3s ease" }}
          >
            <div className="space-y-4 animate-fade-in mt-4">
              <div className="text-sm opacity-70 leading-relaxed">
                Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam
                rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beat
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
