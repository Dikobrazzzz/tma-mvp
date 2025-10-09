// components/BottomNav.jsx
import { NavLink } from "react-router-dom";
import lucky from "../assets/Lucky.svg";
import luckyY from "../assets/Lucky-y.svg";
import icTerms from "../assets/ic_Terms.svg";
import termsY from "../assets/Terms-y.svg";
import icProfile from "../assets/ic_Profile.svg";
import profileY from "../assets/Profile-y.svg";
import icWinners from "../assets/ic_Winners.svg";
import winnersY from "../assets/Winners-y.svg";
import cta from "../assets/CTA.svg";

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] backdrop-blur border-t border-white/10 flex justify-around items-center h-20 z-50 rounded-t-[20px]">
      {/* Terms — без изменений */}
      <NavLink
        to="/home"
        className={({ isActive }) =>
          `flex flex-col items-center py-2 text-xs ${isActive ? "text-white" : "text-white/70"} ml-2`
        }
      >
        <img
          src={window.location.pathname === "/home" ? termsY : icTerms}
          alt="Terms"
          className="h-6 w-6 mb-1"
        />
        <span className={window.location.pathname === "/home" ? "text-white" : "text-white/70"}>
          Terms
        </span>
      </NavLink>
      {/* Средняя группа — без изменений */}
      <div className="flex items-center gap-4">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 text-xs ${isActive ? "text-white" : "text-white/70"}`
          }
        >
          <img
            src={window.location.pathname === "/" ? luckyY : lucky}
            alt="Lucky"
            className="h-6 w-6 mb-1"
          />
          {/* Текст в две строки: div с flex-col для вертикального стека */}
          <div
            className={`flex flex-col items-center leading-tight text-xs ${
              window.location.pathname === "/" ? "text-white" : "text-white/70"
            }`}
          >
            <span>Lucky</span>
            <span>winner</span>
          </div>
        </NavLink>
        {/* CTA — без изменений */}
        <a
          href="https://win888strazci.com/en"
          className="flex flex-col items-center justify-center w-30 h-30 shadow-lg active:scale-95"
          aria-label="Deposit"
        >
          <img src={cta} alt="CTA" className="w-24 h-24" />
        </a>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex flex-col items-center py-2 text-xs ${isActive ? "text-white" : "text-white/70"}`
          }
        >
          <img
            src={window.location.pathname === "/profile" ? profileY : icProfile}
            alt="Profile"
            className="h-6 w-6 mb-1"
          />
          <span className={window.location.pathname === "/profile" ? "text-white" : "text-white/70"}>
            Profile
          </span>
        </NavLink>
      </div>
      {/* Winners — без изменений */}
      <NavLink
        to="/winners"
        className={({ isActive }) =>
          `flex flex-col items-center py-2 text-xs ${isActive ? "text-white" : "text-white/70"} mr-2`
        }
      >
        <img
          src={window.location.pathname === "/winners" ? winnersY : icWinners}
          alt="Winners"
          className="h-6 w-6 mb-1"
        />
        <span className={window.location.pathname === "/winners" ? "text-white" : "text-white/70"}>
          Winners
        </span>
      </NavLink>
    </nav>
  );
}
