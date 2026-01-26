// src/analytics/useAnalytics.jsx

import React, { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  trackPageView,
  trackClick,
  trackNavigation,
  trackSessionStart,
  trackEvent,
  incrementPageCount
} from "./analytics";

export function usePageTracking() {
  const location = useLocation();
  const prevPathRef = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const currentPath = location.pathname;
    
    if (isFirstRender.current) {
      isFirstRender.current = false;
      trackSessionStart();
    }
    
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

export function useTrackedClick(buttonId, onClick, extra = {}) {
  const location = useLocation();
  
  return useCallback((e) => {
    trackClick(buttonId, location.pathname, extra);
    if (onClick) onClick(e);
  }, [buttonId, onClick, location.pathname, extra]);
}

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

export function TrackedButton({ id, onClick, children, extra = {}, ...props }) {
  const trackedClick = useTrackedClick(id, onClick, extra);
  
  return (
    <button onClick={trackedClick} {...props}>
      {children}
    </button>
  );
}

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

