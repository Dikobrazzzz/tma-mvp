// pages/Terms.jsx
import Header from "../components/Header";
import wall from "../assets/Wall.svg";
import icTerms from "../assets/ic_Terms.svg";

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#151515] text-white flex flex-col relative">
      {/* Фоновое изображение */}
      <img
        src={wall}
        alt=""
        className="fixed inset-x-0 top-[-14%] w-full scale-30 object-cover z-0"
      />

      <Header />

      {/* Заголовок */}
      <div className="relative z-10 px-4 pt-4 pb-2">
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <img src={icTerms} alt="" className="h-9 w-9" />
          Terms
        </h1>
      </div>

      {/* Контент */}
      <div className="relative z-10 flex-1 px-4 space-y-4 overflow-y-auto pt-4">
        {/* Win up to €5000 */}
        <div className="py-4 mt-10">
          <div className="flex items-baseline gap-2 text-3xl font-bold tracking-tight text-left">
            <span className="text-sm">WIN UP TO</span>
            <span className="text-[#fffe45] text-3xl">€5 000</span>
          </div>
        </div>

        {/* Шаги с градиентом + тонкая градиентная обводка */}
        <div className="space-y-1.5 max-w-[90%] mx-auto">
          {/* 1 */}
          <div
            className="relative rounded-2xl p-1.5 flex items-center gap-3 text-white"
            style={{
              // центр — градиент слева чёрный → справа красный (как было)
              background:
                "linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 40%, #c50f0d 100%) padding-box, " +
                // обводка — сверху светлее → вниз #151515
                "linear-gradient(180deg, rgba(255,255,255,0.22), #151515) border-box",
              border: "1px solid transparent",
              boxShadow:
                "0 4px 8px rgba(0,0,0,0.18), " +
                "0 14px 28px rgba(0,0,0,0.16), " +
                "0 32px 60px rgba(0,0,0,0.14)",
            }}
          >
            <span className="text-3xl font-bold text-white min-w-[1.5rem] ml-2">1</span>
            <span className="flex-1 text-sm">Register with 888STARZ</span>
          </div>

          {/* 2 */}
          <div
            className="relative rounded-2xl p-1.5 flex items-center gap-3 text-white"
            style={{
              background:
                "linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 40%, #c50f0d 100%) padding-box, " +
                "linear-gradient(180deg, rgba(255,255,255,0.22), #151515) border-box",
              border: "1px solid transparent",
              boxShadow:
                "0 4px 8px rgba(0,0,0,0.18), " +
                "0 14px 28px rgba(0,0,0,0.16), " +
                "0 32px 60px rgba(0,0,0,0.14)",
            }}
          >
            <span className="text-3xl font-bold text-white min-w-[1.5rem] ml-2">2</span>
            <span className="flex-1 text-sm">Place your first bet</span>
          </div>

          {/* 3 */}
          <div
            className="relative rounded-2xl p-1.5 flex items-center gap-3 text-white"
            style={{
              background:
                "linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 40%, #c50f0d 100%) padding-box, " +
                "linear-gradient(180deg, rgba(255,255,255,0.22), #151515) border-box",
              border: "1px solid transparent",
              boxShadow:
                "0 4px 8px rgba(0,0,0,0.18), " +
                "0 14px 28px rgba(0,0,0,0.16), " +
                "0 32px 60px rgba(0,0,0,0.14)",
            }}
          >
            <span className="text-3xl font-bold text-white min-w-[1.5rem] ml-2">3</span>
            <span className="flex-1 text-sm">Receive a bonus of 500 EUR</span>
          </div>
        </div>

        {/* Текст */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">Text</h3>
          <p className="text-xs leading-relaxed text-[#7D7D7D]">
            Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam,
            eaque ipsa quae ab illo inventore verit&gt;
          </p>
        </div>
      </div>
    </div>
  );
}
