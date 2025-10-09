import { useEffect, useState } from "react";
export default function LoaderGate({seconds}) {
  const [left,setLeft]=useState(seconds||0);
  useEffect(()=>{ const t=setInterval(()=>setLeft(s=>Math.max(0,s-1)),1000); return ()=>clearInterval(t);},[]);
  return (
    <div className="p-6 text-center">
      <div className="text-xl mb-2">⏳ Доступ будет позже</div>
      <div className="text-3xl font-bold">{left}s</div>
      <div className="opacity-70 mt-2">Зайдите через 24 часа или когда таймер истечёт.</div>
    </div>
  );
}
