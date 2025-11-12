// src/components/ClaimConfirmationModal.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

export default function ClaimConfirmationModal({ open, onOK }) {
  const { t } = useTranslation();

  // Делаем модалку «полуконтролируемой»: синхронизируемся с prop open,
  // но закрываемся локально при клике, чтобы гарантированно исчезала.
  const [visible, setVisible] = useState(Boolean(open));

  useEffect(() => {
    setVisible(Boolean(open));
  }, [open]);

  // Блокируем скролл фона только когда модалка видима
  useEffect(() => {
    if (visible) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  // Закрытие по ESC
  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setVisible(false);
        onOK && onOK();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onOK]);

  const handleOK = useCallback(() => {
    // Сначала локально закрываем модалку
    setVisible(false);
    // Затем уведомляем родителя (если он есть)
    try {
      const maybe = onOK && onOK();
      // Если родитель вернул промис — не ждём его для закрытия
      void maybe;
    } catch {
      // Ничего, модалка уже закрыта локально
    }
  }, [onOK]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-confirmation-title"
      // Клик по фону — тоже закрывает
      onClick={handleOK}
    >
      <div
        className="w-[88%] max-w-sm rounded-3xl p-6 text-center text-white pointer-events-auto"
        style={{
          background:
            "linear-gradient(#151515, #151515) padding-box, " +
            "linear-gradient(to bottom, rgba(255,255,255,0.22), #151515) border-box",
          border: "1px solid transparent",
          boxShadow:
            "0 6px 12px rgba(0,0,0,0.22), 0 22px 44px rgba(0,0,0,0.18)",
        }}
        // Останавливаем всплытие, чтобы клик внутри карточки не закрывал модалку случайно
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="claim-confirmation-title" className="text-lg font-extrabold mb-2">
          {t("claimCongratulationsTitle")}
        </h3>

        <p className="text-[13px] opacity-85 mb-5">
          {t("claimCongratulationsText")}
        </p>

        <button
          type="button"
          onClick={handleOK}
          className="
            w-full h-10 rounded-2xl bg-[#FFFE45] text-black text-sm font-extrabold
            flex items-center justify-center
            hover:opacity-95 active:scale-[0.98]
            focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20
            transition
          "
          aria-label={t("ok")}
        >
          {t("ok")}
        </button>
      </div>
    </div>
  );
}

