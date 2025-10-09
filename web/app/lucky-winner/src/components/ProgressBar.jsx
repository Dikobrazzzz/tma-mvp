// /opt/tma-mvp/web/app/lucky-winner/src/components/ProgressBar.jsx
export default function ProgressBar({ value = 0.25, amount = 1500, currency = "€" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;

  return (
    <div
      className="relative rounded-3xl p-3 flex items-center justify-between gap-3"
      style={{
        // центр — ровный, рамка — градиент сверху светлее → вниз #151515
        background:
          "linear-gradient(#151515, #151515) padding-box, " +
          "linear-gradient(to bottom, rgba(255,255,255,0.22), #151515) border-box",
        border: "1px solid transparent",
        // большая, но мягкая «градиентная» тень из нескольких слоёв
        boxShadow:
          "0 4px 8px rgba(0,0,0,0.18), " +   // ближний слой
          "0 14px 28px rgba(0,0,0,0.16), " + // средний
          "0 32px 60px rgba(0,0,0,0.14)",    // дальний (самый мягкий)
      }}
    >
      {/* Прогресс-бар слева (толще в 2 раза) */}
      <div className="flex-1 h-4 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-in-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(180deg, rgba(255,80,80,1), rgba(200,0,0,1))",
          }}
        />
      </div>

      {/* Сумма справа: € — жёлтый, число — белый */}
      <div className="flex items-baseline gap-1 shrink-0">
        <span className="text-[#fffe45] font-bold text-sm">{currency}</span>
        <span className="text-white font-semibold text-sm">{amount}</span>
      </div>
    </div>
  );
}
