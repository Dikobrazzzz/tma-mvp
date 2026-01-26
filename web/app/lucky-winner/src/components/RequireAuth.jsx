import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthCtx } from "../auth/TelegramProvider";

export default function RequireAuth({ children }) {
  const { token, loading } = useContext(AuthCtx);
  if (loading) return null;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
