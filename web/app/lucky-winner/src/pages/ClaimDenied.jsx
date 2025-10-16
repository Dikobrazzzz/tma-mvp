// src/pages/ClaimDenied.jsx
import { useNavigate } from "react-router-dom";
import wall from "../assets/Wall.svg";
import trophyOops from "../assets/Trophy_Claim_Oops.svg";
import logo from "../assets/logo.svg";

export default function ClaimDenied() {
  const navigate = useNavigate();

  const buttonStyle = {
    background:
      "linear-gradient(#151515, #151515) padding-box, " +
      "linear-gradient(to bottom, rgba(255,255,255,0.22), #151515) border-box",
    border: "1px solid transparent",
    boxShadow:
      "0 4px 8px rgba(0,0,0,0.18), " +
      "0 14px 28px rgba(0,0,0,0.16), " +
      "0 32px 60px rgba(0,0,0,0.14)",
  };

  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative">
      <img src={wall} alt="" className="fixed inset-x-0 top-[-14%] w-full scale-30 object-cover z-0" />
      <img src={logo} alt="Logo" className="absolute top-4 left-1/2 transform -translate-x-1/2 h-5" />

      <div className="relative flex-1 flex flex-col items-center justify-center mt-20">
        {/* ↑ поднял на 15%: -translate-y-[75%] */}
        <img
          src={trophyOops}
          alt="Trophy Oops"
          className="
            pointer-events-none select-none
            absolute top-1/2 left-1/2
            -translate-x-1/2 -translate-y-[75%]
            w-[140%] max-w-none h-auto
          "
        />

        <div className="relative z-10 mt-[35vh] flex flex-col items-center">
          <h1 className="text-6xl font-bold text-white">Oops!</h1>
          <p className="text-xl text-white mt-2">Come back in 24 hours</p>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 pb-6 flex justify-center bg-[#151515]/50 backdrop-blur">
        <button
          className="w-[90%] rounded-3xl py-3 px-4 font-semibold relative"
          style={buttonStyle}
          onClick={() => navigate("/profile")}
        >
          <span className="text-[#FFFE45]">Back</span>
        </button>
      </div>
    </div>
  );
}
