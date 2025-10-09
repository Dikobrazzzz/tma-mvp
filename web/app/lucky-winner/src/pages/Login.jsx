// pages/Login.jsx
import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";
import { api } from "../api/client";
import wall from "../assets/Wall.svg";
import icProfile from "../assets/ic_Profile.svg"; // Используем как иконку пользователя
import Header from "../components/Header";
import BottomNav from "../components/BottomNav";

export default function Login() {
  const navigate = useNavigate(); // Добавлен здесь

  const { token, setToken } = useContext(AuthCtx);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const [left, setLeft] = useState(0);

  // ✅ [ИЗМЕНЕНИЕ 1] — добавили loading:
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (left > 0) {
      const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
      return () => clearInterval(t);
    }
  }, [left]);

  const sendCode = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setMsg("Неверный email");
      return;
    }
    try {
      const res = await api("/api/verify/send", { method: "POST", token, body: { email } });
      setSent(true);
      setLeft(30);
      setMsg("Код отправлен. Проверь почту.");
    } catch (e) {
      setMsg(e?.error || "Ошибка отправки");
    }
  };

  // ✅ [ИЗМЕНЕНИЕ 2] — заменили login на “тихий успех”:
  const login = async () => {
    const codeRegex = /^\d{6}$/;
    if (!codeRegex.test(code)) {
      setMsg("Код должен быть 6 цифр");
      return;
    }
    try {
      setLoading(true);
      const res = await api("/api/verify/check", { method: "POST", token, body: { email, code } });

      if (res.token) {
        setToken(res.token);
        localStorage.setItem("jwt", res.token);

        // Никаких сообщений — сразу уходим на профиль
        navigate("/profile", { replace: true });
        return; // важно: не падаем в setMsg ниже
      }

      setMsg("Верификация не удалась");
    } catch (e) {
      setMsg(e?.error || "Неверный код");
      if (e.status === 400) navigate("/error-code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f10] text-white flex flex-col relative pb-20">
      {/* Фоновое изображение — как в Terms */}
      <img
        src={wall}
        alt=""
        className="fixed inset-x-0 top-[-14%] w-full scale-30 object-cover z-0"
      />

      <Header />

      {/* Заголовок Login, размер как Terms, без градиента */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <img src={icProfile} alt="" className="h-9 w-9" />
          Login
        </h1>
      </div>
      {/* Основной контент */}
      <div className="relative z-10 flex-1 px-4 space-y-4 pt-20 overflow-y-auto">
        <div className="transition-none flex justify-center">
          <input
            className="w-[90%] px-3 py-2 bg-white/5 rounded-full text-white placeholder-gray-400"
            placeholder="email@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        <div className="transition-none flex justify-center">
          <button
            onClick={sendCode}
            className="w-[90%] py-3 rounded-full bg-yellow-300 text-black font-extrabold text-lg shadow-lg text-center"
          >
            Enter
          </button>
        </div>
        {sent && (
          <div className="transition-none flex justify-center">
            <input
              className="w-[90%] px-3 py-2 bg-white/5 rounded-full text-white placeholder-gray-400"
              placeholder="Enter Code"
              value={code}
              onChange={e => setCode(e.target.value)}
            />
          </div>
        )}
        {sent && (
          <div className="transition-none flex justify-center pt-4">
            <button
              onClick={login}
              className="w-[90%] py-3 rounded-full bg-yellow-300 text-black font-extrabold text-lg shadow-lg text-center"
            >
              Login
            </button>
          </div>
        )}
        <div className="text-sm opacity-80 text-center">{msg}</div>
      </div>
      {/* BottomNav */}
      <BottomNav />
    </div>
  );
}
