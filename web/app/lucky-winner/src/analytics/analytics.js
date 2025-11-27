// src/analytics/analytics.js
// Сервис аналитики для трекинга пользователей

const ANALYTICS_ENDPOINT = "/api/analytics/track";
const ANALYTICS_BATCH_ENDPOINT = "/api/analytics/batch";

// Генерируем уникальный session_id при загрузке
let sessionId = null;
let sessionStartTime = null;
let lastPage = null;
let eventQueue = [];
let flushTimer = null;

// Инициализация сессии
function initSession() {
  if (sessionId) return sessionId;
  
  // Проверяем, есть ли сессия в sessionStorage (для persist между обновлениями страницы)
  const stored = sessionStorage.getItem("analytics_session");
  if (stored) {
    try {
      const data = JSON.parse(stored);
      // Если сессия не старше 30 минут, используем её
      if (Date.now() - data.startTime < 30 * 60 * 1000) {
        sessionId = data.sessionId;
        sessionStartTime = data.startTime;
        return sessionId;
      }
    } catch {}
  }
  
  // Создаём новую сессию
  sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  sessionStartTime = Date.now();
  
  sessionStorage.setItem("analytics_session", JSON.stringify({
    sessionId,
    startTime: sessionStartTime
  }));
  
  return sessionId;
}

// Получаем данные о Telegram WebApp
function getTelegramData() {
  const tg = window?.Telegram?.WebApp;
  if (!tg) return { tgUserID: null, tgPlatform: null };
  
  return {
    tgUserID: tg.initDataUnsafe?.user?.id || null,
    tgPlatform: tg.platform || null
  };
}

// Получаем общие данные для события
function getCommonData() {
  const { tgUserID, tgPlatform } = getTelegramData();
  
  return {
    session_id: initSession(),
    tg_user_id: tgUserID,
    platform: window?.Telegram?.WebApp ? "tma" : "web",
    tg_platform: tgPlatform,
    screen_width: window.innerWidth,
    screen_height: window.innerHeight,
    language: navigator.language || document.documentElement.lang || "en"
  };
}

// Отправка события (с debounce через очередь)
async function sendEvent(eventData) {
  eventQueue.push({
    ...getCommonData(),
    ...eventData,
    ts: new Date().toISOString()
  });
  
  // Debounce: отправляем через 500ms или когда накопится 10 событий
  if (eventQueue.length >= 10) {
    flushEvents();
  } else {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushEvents, 500);
  }
}

// Отправка накопленных событий
async function flushEvents() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  
  if (eventQueue.length === 0) return;
  
  const events = [...eventQueue];
  eventQueue = [];
  
  try {
    if (events.length === 1) {
      await fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(events[0]),
        keepalive: true
      });
    } else {
      await fetch(ANALYTICS_BATCH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ events }),
        keepalive: true
      });
    }
  } catch (e) {
    // Молча игнорируем ошибки аналитики
    console.debug("[Analytics] Failed to send:", e);
  }
}

// === PUBLIC API ===

/**
 * Трекинг просмотра страницы
 * @param {string} page - название/путь страницы
 * @param {object} extra - дополнительные данные
 */
export function trackPageView(page, extra = {}) {
  const referrer = lastPage;
  lastPage = page;
  
  sendEvent({
    event_type: "page_view",
    page,
    referrer,
    extra
  });
}

/**
 * Трекинг клика по кнопке/элементу
 * @param {string} target - ID или название кнопки
 * @param {string} page - текущая страница
 * @param {object} extra - дополнительные данные
 */
export function trackClick(target, page = null, extra = {}) {
  sendEvent({
    event_type: "button_click",
    page: page || lastPage,
    target,
    extra
  });
}

/**
 * Трекинг навигации между страницами
 * @param {string} from - откуда
 * @param {string} to - куда
 * @param {object} extra - дополнительные данные
 */
export function trackNavigation(from, to, extra = {}) {
  sendEvent({
    event_type: "navigation",
    page: to,
    referrer: from,
    extra
  });
}

/**
 * Трекинг начала сессии
 * @param {object} extra - дополнительные данные
 */
export function trackSessionStart(extra = {}) {
  const { tgUserID, tgPlatform } = getTelegramData();
  const tg = window?.Telegram?.WebApp;
  
  sendEvent({
    event_type: "session_start",
    page: window.location.pathname,
    extra: {
      ...extra,
      url: window.location.href,
      tg_version: tg?.version || null,
      tg_color_scheme: tg?.colorScheme || null,
      tg_is_expanded: tg?.isExpanded || null,
      viewport_height: tg?.viewportHeight || null,
      viewport_stable_height: tg?.viewportStableHeight || null,
      start_param: tg?.initDataUnsafe?.start_param || null
    }
  });
}

/**
 * Трекинг завершения сессии
 */
export function trackSessionEnd() {
  const duration = sessionStartTime ? Date.now() - sessionStartTime : 0;
  
  // Используем sendBeacon для надёжной отправки при закрытии
  const data = {
    ...getCommonData(),
    event_type: "session_end",
    page: lastPage || window.location.pathname,
    duration_ms: duration,
    extra: {
      pages_visited: sessionStorage.getItem("analytics_pages_count") || 1
    }
  };
  
  try {
    navigator.sendBeacon(ANALYTICS_ENDPOINT, JSON.stringify(data));
  } catch {
    // Fallback
    fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      keepalive: true
    }).catch(() => {});
  }
}

/**
 * Трекинг произвольного события
 * @param {string} eventType - тип события
 * @param {object} data - данные события
 */
export function trackEvent(eventType, data = {}) {
  const { page, target, referrer, extra, ...rest } = data;
  
  sendEvent({
    event_type: eventType,
    page: page || lastPage,
    target,
    referrer,
    extra: { ...extra, ...rest }
  });
}

/**
 * Инкрементируем счётчик посещённых страниц
 */
export function incrementPageCount() {
  const current = parseInt(sessionStorage.getItem("analytics_pages_count") || "0", 10);
  sessionStorage.setItem("analytics_pages_count", String(current + 1));
}

// Инициализация при загрузке модуля
initSession();

// Отправляем события при закрытии/уходе со страницы
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushEvents();
    trackSessionEnd();
  });
  
  window.addEventListener("pagehide", () => {
    flushEvents();
    trackSessionEnd();
  });
  
  // Для Telegram WebApp: отслеживаем сворачивание
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushEvents();
    }
  });
}

export default {
  trackPageView,
  trackClick,
  trackNavigation,
  trackSessionStart,
  trackSessionEnd,
  trackEvent,
  incrementPageCount,
  flushEvents
};




