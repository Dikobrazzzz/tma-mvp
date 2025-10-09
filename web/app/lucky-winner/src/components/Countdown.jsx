// components/Countdown.jsx
import { useEffect, useState } from "react";
export default function Countdown({ to }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.floor((to - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(Math.floor(left / 3600)).padStart(2, "0");
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  return (
    <div className="text-center">
      <div className="text-white/70 text-sm mb-1">Next draw starts in</div>
      <div className="flex items-center justify-center gap-6"> {/* Изменение: items-end → items-center для горизонтального выравнивания */}
        <div className="flex items-baseline gap-1"> {/* Новая пара: число + подпись */}
          <div className="text-xl font-extrabold text-yellow-300">{h}</div>
          <div className="text-xs text-white/60">h</div>
        </div>
        <div className="flex items-baseline gap-1"> {/* Новая пара: число + подпись */}
          <div className="text-xl font-extrabold text-yellow-300">{m}</div>
          <div className="text-xs text-white/60">m</div>
        </div>
      </div>
      {/* Убрали нижний div с подписями, так как они теперь inline */}
    </div>
  );
}
