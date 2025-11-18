// src/components/ProgressBar.jsx
// Адаптивная шкала: серый трек, красная линия прогресса, справа — текущая сумма.
// API: <ProgressBar value={0..1} amount={500} currency="€" />
export default function ProgressBar({ value = 0, amount = 0, currency = "€" }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0)) * 100;
  const formattedAmount =
    typeof amount === "number"
      ? amount.toLocaleString("ru-RU")
      : String(amount ?? "");

  return (
    <div
      className="relative rounded-3xl p-3 flex items-center justify-between gap-3"
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
      {/* Прогресс-бар слева (серый трек + красная линия) */}
      <div
        className="flex-1 h-4 rounded-full overflow-hidden"
        style={{ backgroundColor: "#3A3A3A" }}
        aria-label="progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        role="progressbar"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-in-out"
          style={{
            width: `${pct}%`,
            background:
              "linear-gradient(180deg, rgba(255,80,80,1) 0%, rgba(200,0,0,1) 100%)",
          }}
        />
      </div>

      {/* Сумма справа: € — жёлтый, число — белый */}
      <div className="flex items-baseline gap-1 shrink-0">
        <span className="text-[#fffe45] font-bold text-sm">{currency}</span>
        <span className="text-white font-semibold text-sm">
          {formattedAmount}
        </span>
      </div>
    </div>
  );
}
