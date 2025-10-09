// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
// Telegram WebApp init (для готовности)
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand(); // Полноэкранный режим
}
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
