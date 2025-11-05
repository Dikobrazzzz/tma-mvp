// src/components/ClaimConfirmationModal.jsx
import claimBack from "../assets/Claim_back.svg";

export default function ClaimConfirmationModal({ open, onOK }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-[90%] max-w-md rounded-3xl overflow-hidden h-[70vh]">
        <img src={claimBack} alt="Claim Back" className="w-full h-auto" />
        <div className="absolute top-[50%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white font-bold text-xl">
          Your reward will be credited to your account soon.<br />
          The process may take up to 4 hours.
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] grid grid-cols-1 gap-2">
          <button
            onClick={onOK}
            className="py-3 rounded-full bg-[#fffe45] text-black font-extrabold text-lg shadow-lg"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
