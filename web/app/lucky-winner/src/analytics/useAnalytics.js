// src/analytics/useAnalytics.js
// React хук для интеграции аналитики

import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  trackPageView,
  trackClick,
  trackNavigation,
  trackSessionStart,
  trackEvent,
  incrementPageCount
} from "./analytics";

/**
 * Хук для автоматического трекинга страниц
 * Вызывать один раз в корневом компоненте (App)
 */
export function usePageTracking() {
  const location = useLocation();
  const prevPathRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const currentPath = location.pathname;
    
    // При первом рендере отправляем session_start
    if (isFirstRender.current) {
      isFirstRender.current = false;
      trackSessionStart();
    }
    
    // Трекаем навигацию и page_view
    if (prevPathRef.current && prevPathRef.current !== currentPath) {
      trackNavigation(prevPathRef.current, currentPath);
    }
    
    trackPageView(currentPath, {
      search: location.search,
      hash: location.hash
    });
    
    incrementPageCount();
    prevPathRef.current = currentPath;
  }, [location]);
}

/**
 * Хук для создания tracked клика
 * @param {string} buttonId - ID кнопки для аналитики
 * @param {function} onClick - оригинальный обработчик клика
 * @param {object} extra - дополнительные данные
 */
export function useTrackedClick(buttonId, onClick, extra = {}) {
  const location = useLocation();
  
  return useCallback((e) => {
    trackClick(buttonId, location.pathname, extra);
    if (onClick) onClick(e);
  }, [buttonId, onClick, location.pathname, extra]);
}

/**
 * Хук для трекинга времени на странице
 * @param {string} pageName - название страницы
 */
export function useTimeOnPage(pageName) {
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    
    return () => {
      const duration = Date.now() - startTimeRef.current;
      trackEvent("page_duration", {
        page: pageName,
        extra: { duration_ms: duration }
      });
    };
  }, [pageName]);
}

/**
 * Компонент-обёртка для трекинга кликов
 * Использование: <TrackedButton id="deposit_btn" onClick={handleClick}>...</TrackedButton>
 */
export function TrackedButton({ id, onClick, children, extra = {}, ...props }) {
  const trackedClick = useTrackedClick(id, onClick, extra);
  
  return (
    <button onClick={trackedClick} {...props}>
      {children}
    </button>
  );
}

/**
 * Компонент-обёртка для трекинга кликов по ссылкам
 */
export function TrackedLink({ id, onClick, children, extra = {}, ...props }) {
  const trackedClick = useTrackedClick(id, onClick, extra);
  
  return (
    <a onClick={trackedClick} {...props}>
      {children}
    </a>
  );
}

export default {
  usePageTracking,
  useTrackedClick,
  useTimeOnPage,
  TrackedButton,
  TrackedLink
};

