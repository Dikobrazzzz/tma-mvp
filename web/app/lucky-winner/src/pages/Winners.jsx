// pages/Winners.jsx
import { useState, useEffect, useContext } from "react";
import { AuthCtx } from "../auth/TelegramProvider";
import wall from "../assets/Wall.svg";
import icWinners from "../assets/ic_Winners.svg";
import Header from "../components/Header";

const Tab = ({ active, children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      // размеры кнопок (шире и выше)
      padding: "8px 14px",        // было 6px 16px
      fontSize: "12px",            // было 10px
      borderRadius: "9999px",
      minWidth: "auto",            // чтобы все кнопки были ровнее по ширине
      minHeight: "36px",
      whiteSpace: "nowrap",

      // цвета
      background: active ? "#FFFE45" : "#1A1A1A",
      color: active ? "#000000" : "#FFFFFF",

      // тень: активная — заметная мягкая «жёлтая»; неактивная — лёгкая тёмная
      boxShadow: active
        ? "none" 
        : "0 4px 10px rgba(0,0,0,0.25)",

      // мелочи
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

export default function Winners() {
  const { token } = useContext(AuthCtx);
  const [tab, setTab] = useState("today");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const mockData = {
      today: [
        { n: 1, user: "askill****", count: 2, wins: "€100" },
        { n: 2, user: "askill****", count: 1, wins: "€200" },
        { n: 3, user: "askill****", count: 2, wins: "€90" },
        { n: 4, user: "askill****", count: 1, wins: "€90" },
      ],
      yesterday: [{ n: 1, user: "user****", count: 1, wins: "€150" }],
      last7: [],
      top10: [{ n: 1, user: "topuser****", count: 5, wins: "€5000" }],
    };
    const t = setTimeout(() => {
      setData(mockData[tab] || mockData.today);
      setLoading(false);
    }, 500);
    return () => clearTimeout(t);
  }, [tab]);

  const tabs = { today: "Today", yesterday: "Yesterday", last7: "Last 7 days", top10: "Top 10 Win" };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#151515] text-white flex items-center justify-center">
        Загрузка...
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
          Winners
        </h1>
      </div>

      {/* Контент сдвинут на 20% вниз */}
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
            {/* Базовый размер шрифта таблицы — 6px */}
            <table className="w-full text-[6px] text-[#8C8C8C]">
              <thead>
                <tr className="text-[#FFFE45]">
                  <th className="py-2 text-left text-[10px]">N°</th>
                  <th className="py-2 text-left text-[10px]">User ID</th>
                  <th className="py-2 text-left text-[10px]">Total Wins Count</th>
                  <th className="py-2 text-left text-[10px]">Total Wins €</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr key={i} className="border-b border-white/10">
                    <td className="py-2 text-[10px]">{item.n}</td>
                    <td className="py-2 text-[10px]">{item.user}</td>
                    <td className="py-2 text-[10px]">{item.count}</td>
                    <td className="py-2 text-[10px]">{item.wins}</td>
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
