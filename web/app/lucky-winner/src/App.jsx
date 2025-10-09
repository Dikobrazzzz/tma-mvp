// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TelegramProvider, { AuthCtx } from "./auth/TelegramProvider";
import BottomNav from "./components/BottomNav";
import Main from "./pages/Main";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Winners from "./pages/Winners";
import CodeError from "./pages/CodeError";
import Error403 from "./pages/Error403";
import LoaderGate from "./components/LoaderGate";
import RequireAuth from "./components/RequireAuth";
import { useContext, useEffect, useState } from "react";
import { api } from "./api/client";
function GateWrapper({ children }) {
  // Убрали проверки — всегда рендерим (MVP без auth)
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
export default function App() {
  return (
    <TelegramProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <GateWrapper>
              <Layout>
                <Main />
              </Layout>
            </GateWrapper>
          } />
          <Route path="/home" element={
            <GateWrapper>
              <Layout>
                <Home />
              </Layout>
            </GateWrapper>
          } />
          <Route path="/lucky" element={
            <GateWrapper>
              <Layout>
                <Main />
              </Layout>
            </GateWrapper>
          } />
          <Route path="/profile" element={
            <GateWrapper>
              <RequireAuth>
                <Layout>
                  <Profile />
                </Layout>
              </RequireAuth>
            </GateWrapper>
          } />
          <Route path="/login" element={<Login />} />
          <Route path="/winners" element={
            <GateWrapper>
              <Layout>
                <Winners />
              </Layout>
            </GateWrapper>
          } />
          <Route path="/error-code" element={<CodeError />} />
          <Route path="/403" element={<Error403 />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </TelegramProvider>
  );
} 
