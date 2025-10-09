// pages/Profile.jsx
import { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg";
import setting from "../assets/setting.svg";
import wincub from "../assets/wincub.svg";
import Header from "../components/Header";

export default function Profile() {
  console.log("Profile renders OK");
  const navigate = useNavigate();
  const { token } = useContext(AuthCtx);

  const [data, setData] = useState({
    userId: "askill4831641654",
    totalWins: 34,
    winnings: [
      { n: 1, date: "03.10", amount: "€1200", status: "Win" },
      { n: 2, date: "08.09", amount: "€900", status: "Win" },
      { n: 3, date: "08.09", amount: "€900", status: "Win" },
      { n: 4, date: "08.09", amount: "€900", status: "Win" },
      { n: 5, date: "08.09", amount: "€900", status: "Win" },
      { n: 6, date: "08.09", amount: "€900", status: "Win" },
      { n: 7, date: "08.09", amount: "€900", status: "Win" },
    ],
  });

  useEffect(() => {
    if (token) {
      api("/api/profile")
        .then((responseData) => {
          console.log("Profile data:", responseData);
          if (!responseData || !responseData.email_verified) {
            console.log("Email not verified, redirecting to login");
            navigate("/login");
            return;
          }
          setData((prev) => ({ ...prev, ...responseData }));
        })
        .catch((err) => {
          console.error("Profile fetch error:", err);
          navigate("/login");
        });
    } else {
      console.log("No token, redirecting to login");
      navigate("/login");
    }
  }, [token, navigate]);

  const { userId, totalWins, winnings = [] } = data;

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative">
      {/* Фон как в Terms */}
      <img src={wall} alt="" className="fixed inset-x-0 top-[-14%] w-full scale-30 object-cover z-0" />

      <Header />

      {/* Заголовок Profile — возвращён вверх (не сдвигается на 20vh) */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <img src={icProfile} alt="" className="h-9 w-9" />
          Profile
        </h1>
      </div>

      {/* Весь остальной контент сдвигаем на 20% вниз */}
      <div className="relative z-10 mt-[10vh]">
        {/* User ID */}
        <div className="pt-4 pb-4">
          <div className="w-[90%] mx-auto px-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs opacity-70">User ID</div>
                <div className="text-sm font-semibold">{userId}</div>
              </div>
              <button
                className="p-2 text-[#FFFE45] bg-transparent"
                onClick={() => alert("Settings")}
                aria-label="Settings"
              >
                <img src={setting} alt="Settings" className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* My Winnings + Таблица — стиль как в Winners */}
        <div className="pb-4">
          <div
            className="w-[90%] mx-auto rounded-3xl overflow-hidden"
            style={{
              backgroundColor: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 0 20px rgba(0,0,0,0.3)",
            }}
          >
            <div className="px-4 pt-4 pb-1">
              <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">My Winnings</div>
                <div className="flex items-center gap-1 bg-[#FFFE45] text-black px-2 py-1 rounded-full text-xs font-semibold">
                  <img src={wincub} alt="Win" className="h-3 w-3 mr-1" /> {totalWins || 0}
                </div>
              </div>
            </div>

            <div className="overflow-y-auto px-4 -mt-2">
              <table className="w-full text-[6px] leading-none text-[#8C8C8C]">
                <thead>
                  <tr className="text-[#FFFE45]">
                    <th className="py-[6px] text-left text-[10px]">N°</th>
                    <th className="py-[6px] text-left text-[10px]">Date</th>
                    <th className="py-[6px] text-left text-[10px]">Winnings</th>
                    <th className="py-[6px] text-left text-[10px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(winnings || []).map((w, i) => (
                    <tr key={i} className="border-b border-white/10">
                      <td className="py-[6px] text-[10px]">{w.n}</td>
                      <td className="py-[6px] text-[10px]">{w.date}</td>
                      <td className="py-[6px] text-[10px]">{w.amount}</td>
                      <td className="py-[6px] text-[10px]">{w.status}</td> {/* цвет текста теперь общий #8C8C8C */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Кнопка Support — как «€5 000» в Main (градиентная обводка) */}
        <div className="pb-6 mt-2 flex justify-center">
          <button
            className="w-[90%] rounded-3xl py-3 px-4 font-semibold relative"
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
            <span className="text-[#FFFE45]">Support</span>
          </button>
        </div>
      </div>
    </div>
  );
}
