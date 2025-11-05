// src/components/ClaimBonusModal.jsx
export default function ClaimBonusModal({ open, amount = 500, onConfirm }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-[90%] max-w-md rounded-3xl overflow-hidden h-[70vh]">
        {/* Фон модалки: responsive picture (из public/claim) */}
        <picture>
          <source
            type="image/avif"
            srcSet="/claim/claim-back-480.avif 480w, /claim/claim-back-720.avif 720w, /claim/claim-back-960.avif 960w"
            sizes="100vw"
          />
          <source
            type="image/webp"
            srcSet="/claim/claim-back-480.webp 480w, /claim/claim-back-720.webp 720w, /claim/claim-back-960.webp 960w"
            sizes="100vw"
          />
          <img
            src="/claim/claim-back-720.jpg"
            srcSet="/claim/claim-back-480.jpg 480w, /claim/claim-back-720.jpg 720w, /claim/claim-back-960.jpg 960w"
            sizes="100vw"
            alt=""
            loading="lazy"
            fetchpriority="low"
            decoding="async"
            className="w-full h-auto"
            aria-hidden="true"
            style={{ display: "block" }}
          />
        </picture>

        {/* Трофей */}
        <picture>
          <source
            type="image/avif"
            srcSet="/claim/trophy-oops-240.avif 240w, /claim/trophy-oops-360.avif 360w, /claim/trophy-oops-480.avif 480w"
            sizes="50vw"
          />
          <source
            type="image/webp"
            srcSet="/claim/trophy-oops-240.webp 240w, /claim/trophy-oops-360.webp 360w, /claim/trophy-oops-480.webp 480w"
            sizes="50vw"
          />
          <img
            src="/claim/trophy-oops-360.jpg"
            srcSet="/claim/trophy-oops-240.jpg 240w, /claim/trophy-oops-360.jpg 360w, /claim/trophy-oops-480.jpg 480w"
            sizes="50vw"
            alt="Trophy"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/2 h-auto pointer-events-none select-none"
            style={{ display: "block" }}
          />
        </picture>

        {/* Текст и кнопка */}
        <div className="absolute top-[70%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white font-bold text-xl">
          Congratulations!<br />
          <span className="text-[#fffe45] text-6xl">€{amount}</span>
        </div>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] grid grid-cols-1 gap-2">
          <button
            onClick={onConfirm}
            className="py-3 rounded-full bg-[#fffe45] text-black font-extrabold text-lg shadow-lg"
          >
            Claim Bonus
          </button>
        </div>
      </div>
    </div>
  );
}
