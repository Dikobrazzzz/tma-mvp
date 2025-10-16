// src/pages/Winners.jsx
import { useState, useEffect, useContext } from "react";
import { useTranslation } from 'react-i18next';

import { AuthCtx } from "../auth/TelegramProvider";
import wall from "../assets/Wall.svg";
import icWinners from "../assets/ic_Winners.svg";
import Header from "../components/Header";

const Tab = ({ active, children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: "8px 14px",
      fontSize: "12px",
      borderRadius: "9999px",
      minWidth: "auto",
      minHeight: "36px",
      whiteSpace: "nowrap",
      background: active ? "#FFFE45" : "#1A1A1A",
      color: active ? "#000000" : "#FFFFFF",
      boxShadow: active ? "none" : "0 4px 10px rgba(0,0,0,0.25)",
      fontWeight: active ? 700 : 500,
      border: "1px solid transparent",
      transition: "transform 0.15s ease, box-shadow 0.2s ease",
      cursor: "pointer",
    }}
    onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
    onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
  >
    {children}
  </button>
);

function genMock(tab) {
  const rows = [];
  const conf = {
    today:     { base: 100, userPrefix: "askill" },
    yesterday: { base: 80,  userPrefix: "user"   },
    last7:     { base: 120, userPrefix: "week"   },
    top10:     { base: 500, userPrefix: "top"    },
  }[tab] || { base: 100, userPrefix: "user" };

  for (let i = 1; i <= 25; i++) {
    const isTop = tab === "top10";
    const multiplier = isTop ? (26 - i) * 100 : (i % 5 + 1) * 10;
    const amount = conf.base + multiplier + (isTop ? i * 50 : i);
    const wins = `€${amount.toLocaleString("en-US")}`;
    const count = isTop ? (i % 5) + 3 : (i % 4) + 1;
    const user = `${conf.userPrefix}${(1000 + i).toString(36)}****`;
    rows.push({ n: i, user, count, wins });
  }
  return rows;
}

export default function Winners() {
  const { t } = useTranslation();

  const { token } = useContext(AuthCtx);
  const [tab, setTab] = useState("today");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const timeoutId = setTimeout(() => {
      setData(genMock(tab));
      setLoading(false);
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [tab]);

  const tabs = {
    today: t('today'),
    yesterday: t('yesterday'),
    last7: t('last7Days'),
    top10: t('top10Win')
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#151515] text-white flex items-center justify-center">
        {t('loading')}...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative">
      {/* Фон */}
      <img src={wall} alt="" className="fixed inset-x-0 top-[-14%] w-full scale-30 object-cover z-0" />

      <Header />

      {/* Заголовок — сверху */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <img src={icWinners} alt="" className="h-9 w-9" />
          {t('winners')}
        </h1>
      </div>

      {/* Контент сдвинут на 12vh вниз */}
      <div className="relative z-10 mt-[12vh] flex flex-col items-center">
        {/* Табы — по центру */}
        <div className="flex gap-3 flex-wrap justify-center mb-4">
          {Object.entries(tabs).map(([key, label]) => (
            <Tab key={key} active={tab === key} onClick={() => setTab(key)}>
              {label}
            </Tab>
          ))}
        </div>

        {/* Таблица */}
        <div
          className="w-[90%] mx-auto rounded-3xl overflow-hidden shadow-lg"
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 0 20px rgba(0,0,0,0.3)",
          }}
        >
          <div className="overflow-y-auto px-4">
            <table className="w-full text-[6px] text-[#8C8C8C]">
              <thead>
                <tr className="text-[#FFFE45]">
                  <th className="py-2 text-center text-[10px]">{t('number')}</th>
                  <th className="py-2 text-left   text-[10px]">{t('userId')}</th>
                  <th className="py-2 text-center text-[10px] leading-tight">
                    <span className="block">Total wins</span>
                    <span className="block">count</span>
                  </th>
                  <th className="py-2 text-center text-[10px] leading-tight">
                    <span className="block">Total wins</span>
                    <span className="block">amount</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {data.map((item, i) => (
                  <tr key={i} className="border-b border-white/10">
                    {/* было 20px → стало ~13px */}
                    <td className="py-2 text-[13px] text-center">{item.n}</td>
                    <td className="py-2 text-[13px] text-left">{item.user}</td>
                    <td className="py-2 text-[13px] text-center">{item.count}</td>
                    <td className="py-2 text-[13px] text-center">{item.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
