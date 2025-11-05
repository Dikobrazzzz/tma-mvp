// src/components/EmailNotFoundModal.jsx
import React from "react";
export default function EmailNotFoundModal({ open, onClose }) {
  if (!open) return null;
  return (
    <>
      {/* Затемняет/блюрит только контент под ним. Header/BottomNav выше, поэтому не блюрятся и не затемняются. */}
      <div
        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm pointer-events-none"
        aria-hidden="true"
      />
      {/* Поп-ап поверх всего — делаем прозрачным для событий */}
      <div className="fixed inset-0 z-[400] flex items-center justify-center px-4 pointer-events-none">
        <div
          className="relative w-[81%] max-w-sm rounded-3xl text-white p-8 min-h-[288px] flex flex-col pointer-events-auto"
          style={{
            background: "linear-gradient(to bottom, #2a2a2a 0%, #1a1a1a 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.25)",
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-not-found-title"
        >
          {/* Кнопка закрытия — без оранжевого прямоугольника/outline вообще */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="
              absolute top-2 right-2 p-2
              bg-transparent hover:bg-transparent focus:bg-transparent
              border-0 hover:border-none focus:border-none
              outline-none focus:outline-none focus-visible:outline-none
              ring-0 focus:ring-0 hover:ring-0
              hover:opacity-90 active:opacity-80
              select-none
              appearance-none
              text-[#676c70]
            "
            style={{
              WebkitTapHighlightColor: "transparent",
              outline: "none",
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.currentTarget.blur();
            }}
            onFocus={(e) => {
              e.currentTarget.blur();
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none select-none"
              style={{ display: "block" }}
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="text-center mt-2 flex flex-col grow">
            <div>
              <h2 id="email-not-found-title" className="text-xl font-semibold leading-snug">
                We couldn&apos;t find<br />this email
              </h2>
              <p className="mt-3 text-xs text-white/85 leading-snug">
                If you registered recently,<br />please try again later.
              </p>
            </div>
            <div className="mt-auto pt-10">
              <div className="text-[10px] text-white/60 mb-1">
                Need personalized support?
              </div>
              <div className="text-[10px] font-medium text-[#FFFE45]">
                support@888STARZ
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
