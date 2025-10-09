// src/components/RequireAuth.jsx
import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";

export default function RequireAuth({ children }) {
  const { token, loading } = useContext(AuthCtx);
  if (loading) return null;                 // тут можно вернуть <LoaderGate/> если хочешь
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
