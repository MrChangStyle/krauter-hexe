import React from 'react';
import { Camera, Image as ImageIcon, ChevronRight, ChevronDown, ChevronUp, Leaf, Trophy, Bug } from 'lucide-react';

export default function HomeRedesign() {
  return (
    <div className="w-[390px] h-[844px] overflow-hidden relative bg-[#f7f5f1] font-sans text-slate-800 flex flex-col mx-auto border border-slate-200 shadow-xl rounded-3xl">
      {/* Background decoration elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#2d6a4f]/10 rounded-full blur-3xl opacity-60 -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-50 rounded-full blur-3xl opacity-50 translate-y-1/3 -translate-x-1/4 pointer-events-none" />
      
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-6 pt-14 pb-32 relative z-10">
        
        {/* Header */}
        <header className="flex justify-between items-start mb-12">
          <div>
            <div className="inline-flex items-center justify-center px-3 py-1 mb-3 rounded-full bg-[#2d6a4f]/10 text-[#2d6a4f] text-[10px] font-bold uppercase tracking-widest font-serif">
              Kräuterhexe
            </div>
            <h1 className="text-xl font-medium mb-1.5 text-slate-900">
              Hallo <span className="font-mono font-bold tracking-tight">WALDWITCH</span> 👋
            </h1>
            <p className="text-[13px] text-slate-500 font-medium">
              Dein Königsfarn braucht heute Pflege! 🌱
            </p>
          </div>
          
          {/* Progress Ring */}
          <button className="relative w-[52px] h-[52px] bg-white rounded-full shadow-sm flex items-center justify-center active:scale-95 transition-transform">
            <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-sm" viewBox="0 0 100 100">
              <circle 
                cx="50" cy="50" r="42" 
                stroke="#f1f5f9" strokeWidth="6" fill="none" 
              />
              <circle 
                cx="50" cy="50" r="42" 
                stroke="#2d6a4f" strokeWidth="6" fill="none" 
                strokeDasharray="264" strokeDashoffset={264 * (1 - 0.62)} 
                strokeLinecap="round"
              />
            </svg>
            <div className="relative flex flex-col items-center justify-center mt-0.5">
              <Leaf className="w-3.5 h-3.5 text-[#2d6a4f] mb-0.5" strokeWidth={2.5} />
              <span className="text-[11px] font-bold text-[#1b4332] leading-none">47</span>
            </div>
          </button>
        </header>

        {/* Scan Button Area */}
        <div className="mb-12 flex flex-col items-center">
          <button className="w-full h-16 rounded-2xl bg-gradient-to-r from-emerald-500 to-[#2d6a4f] text-white shadow-[0_8px_24px_rgba(45,106,79,0.35)] flex items-center justify-center gap-3 active:scale-[0.98] transition-transform relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out rounded-2xl" />
            <span className="text-xl relative z-10 drop-shadow-md">🌿</span>
            <span className="text-[17px] font-semibold tracking-wide relative z-10 drop-shadow-md">Neuer Scan</span>
          </button>
          <p className="mt-3.5 text-xs text-slate-400 font-medium tracking-widest uppercase">
            Pflanze · Pilz · Insekt
          </p>
        </div>

        {/* Leaderboard */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between bg-gradient-to-b from-white to-slate-50/50">
            <h2 className="font-serif font-semibold text-slate-800 text-[17px] flex items-center gap-2.5">
              Pflanzenretter-Rangliste <Trophy className="w-4 h-4 text-amber-400 drop-shadow-sm" />
            </h2>
          </div>
          
          <div className="px-3 py-3">
            {/* Rank 1 (Current User) */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 border border-emerald-100/50 mb-1.5 shadow-sm">
              <div className="flex items-center gap-3.5">
                <span className="text-xl drop-shadow-sm">🥇</span>
                <span className="font-mono font-bold text-[13px] text-[#1b4332]">WALDWITCH</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-full shadow-sm border border-emerald-50">
                <span className="font-bold text-[13px] text-[#2d6a4f]">47</span>
                <span className="text-[10px]">🌿</span>
              </div>
            </div>

            {/* Rank 2 */}
            <div className="flex items-center justify-between p-3 rounded-xl mb-1">
              <div className="flex items-center gap-3.5">
                <span className="text-xl opacity-90">🥈</span>
                <span className="font-mono font-semibold text-[13px] text-slate-600">GREENLEAF</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1">
                <span className="font-semibold text-[13px] text-slate-500">38</span>
                <span className="text-[10px] grayscale opacity-60">🌿</span>
              </div>
            </div>

            {/* Rank 3 */}
            <div className="flex items-center justify-between p-3 rounded-xl">
              <div className="flex items-center gap-3.5">
                <span className="text-xl opacity-90">🥉</span>
                <span className="font-mono font-semibold text-[13px] text-slate-600">HERBARIA</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1">
                <span className="font-semibold text-[13px] text-slate-500">31</span>
                <span className="text-[10px] grayscale opacity-60">🌿</span>
              </div>
            </div>
          </div>
          
          <button className="w-full py-3.5 border-t border-slate-50 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors uppercase tracking-wider">
            5 weitere anzeigen
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </section>
        
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-slate-900/40 z-20 backdrop-blur-[1px]" />

      {/* Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-30 shadow-[0_-8px_40px_rgba(0,0,0,0.12)] flex flex-col max-h-[85vh]">
        {/* Drag Handle */}
        <div className="w-full flex justify-center pt-4 pb-2">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full" />
        </div>

        <div className="px-6 pb-10 pt-2">
          {/* Action 1: Camera (expanded — sub-options visible) */}
          <div className="border-b border-slate-100">
            <div className="w-full flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100">
                  <Camera className="w-5 h-5 text-[#2d6a4f]" strokeWidth={2} />
                </div>
                <span className="font-semibold text-slate-800 text-[15px]">Pflanze fotografieren</span>
              </div>
              <ChevronUp className="w-5 h-5 text-[#2d6a4f]" />
            </div>

            {/* Sub-options */}
            <div className="ml-[60px] mb-3 flex flex-col gap-2">
              {/* Take photo */}
              <button className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#2d6a4f] text-white shadow-sm active:scale-[0.98] transition-transform">
                <Camera className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span className="text-[14px] font-semibold">Foto aufnehmen</span>
              </button>
              {/* Gallery */}
              <button className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 active:scale-[0.98] transition-transform">
                <ImageIcon className="w-4 h-4 shrink-0" strokeWidth={2} />
                <span className="text-[14px] font-semibold">Aus Galerie wählen</span>
              </button>
            </div>
          </div>

          {/* Action 2: Mushroom (Amber) */}
          <button className="w-full flex flex-col justify-center py-4 border-b border-slate-100 group active:scale-[0.99] transition-transform">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-full bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors border border-amber-100">
                  <span className="text-[22px] leading-none -mt-1 ml-0.5 drop-shadow-sm">🍄</span>
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-semibold text-amber-900 text-[15px]">Pilz scannen <span className="font-normal text-amber-700/70">(2 Fotos)</span></span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-amber-600/30" />
            </div>
            <div className="pl-[60px] text-left mt-1">
              <span className="text-[12px] text-amber-700/80 block leading-snug">Zwei Fotos für sichere Essbarkeits-Bestimmung</span>
            </div>
          </button>

          {/* Action 4: Insect */}
          <button className="w-full flex items-center justify-between py-4 group active:scale-[0.99] transition-transform">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors border border-slate-100">
                <Bug className="w-5 h-5 text-slate-600 group-hover:text-[#2d6a4f]" strokeWidth={2} />
              </div>
              <span className="font-semibold text-slate-800 text-[15px]">Insekt bestimmen</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300" />
          </button>
        </div>
      </div>
    </div>
  );
}
