// /opt/tma-mvp/web/app/lucky-winner/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import TelegramProvider from "./auth/TelegramProvider";
import RequireAuth from "./components/RequireAuth";
import { LiveChatWidget } from "@livechat/widget-react";

import BottomNav from "./components/BottomNav";
import Main from "./pages/Main";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Winners from "./pages/Winners";
import CodeError from "./pages/CodeError";
import Error403 from "./pages/Error403";
import ClaimDenied from "./pages/ClaimDenied";

import { useEffect } from "react";
import { setOnUnauthorized } from "./api/client";

import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";

// Analytics
import { usePageTracking } from "./analytics/useAnalytics.jsx";

function GateWrapper({ children }) {
  console.log("Gate bypassed — rendering children");
  return children;
}

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-[#151515] text-white pb-20 relative flex flex-col">
      <main className="flex-1">{children}</main>
      <BottomNav />
    </div>
  );
}

function AppInner() {
  const navigate = useNavigate();

  // Автоматический трекинг страниц и сессий
  usePageTracking();

  useEffect(() => {
    setOnUnauthorized(() => () => navigate("/login", { replace: true }));
  }, [navigate]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <GateWrapper>
            <Layout>
              <Main />
            </Layout>
          </GateWrapper>
        }
      />
      <Route
        path="/home"
        element={
          <GateWrapper>
            <Layout>
              <Home />
            </Layout>
          </GateWrapper>
        }
      />
      <Route
        path="/lucky"
        element={
          <GateWrapper>
            <Layout>
              <Main />
            </Layout>
          </GateWrapper>
        }
      />
      <Route
        path="/profile"
        element={
          <GateWrapper>
            <RequireAuth>
              <Layout>
                <Profile />
              </Layout>
            </RequireAuth>
          </GateWrapper>
        }
      />
      <Route
        path="/settings"
        element={
          <GateWrapper>
            <RequireAuth>
              <Layout>
                <Settings />
              </Layout>
            </RequireAuth>
          </GateWrapper>
        }
      />
      <Route path="/login" element={<Login />} />
      <Route
        path="/winners"
        element={
          <GateWrapper>
            <Layout>
              <Winners />
            </Layout>
          </GateWrapper>
        }
      />
      <Route path="/error-code" element={<CodeError />} />
      <Route path="/403" element={<Error403 />} />

      {/* NEW: ClaimDenied только для авторизованных, без Layout/BottomNav */}
      <Route
        path="/claim-denied"
        element={
          <RequireAuth>
            <ClaimDenied />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Обработчик изменения состояния виджета LiveChat
function handleLiveChatVisibility({ visibility }) {
  if (visibility === 'maximized') {
    // Чат открыт — полный экран
    document.body.classList.add('livechat-open');
  } else {
    // Чат закрыт/свёрнут — вернуть навигацию
    document.body.classList.remove('livechat-open');
  }
}

export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <TelegramProvider>
        <BrowserRouter>
          <AppInner />
          <LiveChatWidget 
            license="12926034"
            onVisibilityChanged={handleLiveChatVisibility}
          />
        </BrowserRouter>
      </TelegramProvider>
    </I18nextProvider>
  );
}
