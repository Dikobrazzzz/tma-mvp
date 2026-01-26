export default function BalanceBadge({ amount = 1500, currency = "€" }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 text-white/90 text-sm">
      <span className="text-yellow-300">{currency}</span>
      <span className="text-white">{amount}</span>
    </div>
  );
}
