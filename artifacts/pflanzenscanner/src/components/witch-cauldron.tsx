/**
 * Animated witch stirring a cauldron – displayed next to the Kräuter-Hexe heading.
 * Pure inline SVG + CSS keyframe animations; no external dependencies.
 */
export function WitchCauldron({ size = 72 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 90 100"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <style>{`
        @keyframes wc-stir {
          0%,100% { transform: rotate(-28deg); }
          50%      { transform: rotate(26deg);  }
        }
        @keyframes wc-bubble {
          0%   { transform: translateY(0)    scale(1);   opacity: .85; }
          70%  {                                          opacity: .4;  }
          100% { transform: translateY(-22px) scale(.2); opacity: 0;   }
        }
        @keyframes wc-twinkle {
          0%,100% { opacity: 1;    transform: scale(1);   }
          50%     { opacity: .12;  transform: scale(.65); }
        }
        @keyframes wc-sway {
          0%,100% { transform: rotate(-4deg); }
          50%     { transform: rotate(4deg);  }
        }
        .wc-stir  { animation: wc-stir   1.9s ease-in-out infinite;
                    transform-origin: 50px 55px; }
        .wc-b1    { animation: wc-bubble 2.1s ease-out   infinite 0s;   }
        .wc-b2    { animation: wc-bubble 2.1s ease-out   infinite .75s; }
        .wc-b3    { animation: wc-bubble 2.1s ease-out   infinite 1.4s; }
        .wc-tw1   { animation: wc-twinkle 1.6s ease-in-out infinite 0s;  }
        .wc-tw2   { animation: wc-twinkle 1.6s ease-in-out infinite .55s;}
        .wc-tw3   { animation: wc-twinkle 1.6s ease-in-out infinite 1.1s;}
        .wc-sway  { animation: wc-sway   2.8s ease-in-out infinite;
                    transform-origin: 38px 32px; }
      `}</style>

      {/* ── sparkle stars ── */}
      <text className="wc-tw1" x="4"  y="26" fontSize="11" fill="#a855f7">✦</text>
      <text className="wc-tw2" x="76" y="20" fontSize="9"  fill="#eab308">✦</text>
      <text className="wc-tw3" x="72" y="46" fontSize="7"  fill="#818cf8">✦</text>

      {/* ── hat (swaying slightly with the body) ── */}
      <g className="wc-sway">
        {/* brim */}
        <ellipse cx="38" cy="34" rx="19" ry="5.5" fill="#1e1b4b"/>
        {/* cone */}
        <path d="M22 34 L38 5 L54 34 Z" fill="#1e1b4b"/>
        {/* purple band */}
        <rect x="27" y="26.5" width="22" height="5.5" fill="#7c3aed"/>
        {/* gold buckle */}
        <rect x="35" y="27" width="6" height="4" rx="1" fill="#fbbf24"/>
        <rect x="37" y="28" width="2" height="2" rx=".5" fill="#b45309"/>

        {/* ── head ── */}
        {/* hair wisps left */}
        <path d="M20 36 Q17 45 22 50" stroke="#1e1b4b" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
        {/* hair wisps right */}
        <path d="M56 36 Q59 45 54 50" stroke="#1e1b4b" strokeWidth="3.5" fill="none" strokeLinecap="round"/>
        {/* face */}
        <circle cx="38" cy="43" r="11" fill="#d1fae5"/>
        {/* eyes */}
        <ellipse cx="34" cy="42" rx="1.8" ry="2" fill="#1e1b4b"/>
        <ellipse cx="42" cy="42" rx="1.8" ry="2" fill="#1e1b4b"/>
        {/* eye gleam */}
        <circle cx="34.6" cy="41.2" r=".7" fill="white"/>
        <circle cx="42.6" cy="41.2" r=".7" fill="white"/>
        {/* nose */}
        <path d="M36.5 46 Q38 48.5 39.5 46" stroke="#6b7280" strokeWidth="1" fill="none"/>
        {/* smile */}
        <path d="M33 48 Q38 52.5 43 48" stroke="#1e1b4b" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
        {/* cheek blush */}
        <ellipse cx="31.5" cy="47" rx="3" ry="2" fill="#fca5a5" opacity=".45"/>
        <ellipse cx="44.5" cy="47" rx="3" ry="2" fill="#fca5a5" opacity=".45"/>
      </g>

      {/* ── robe/body ── */}
      <path d="M27 52 L20 88 L56 88 L49 52 Z" fill="#581c87"/>
      {/* collar detail */}
      <path d="M31 52 L38 58 L45 52" stroke="#7c3aed" strokeWidth="1.8" fill="none"/>
      {/* robe sheen */}
      <path d="M24 56 Q22 70 23 82" stroke="#7c3aed" strokeWidth="1.2" fill="none" opacity=".6" strokeLinecap="round"/>

      {/* left arm (static) */}
      <line x1="27" y1="57" x2="15" y2="70" stroke="#d1fae5" strokeWidth="4" strokeLinecap="round"/>
      {/* left hand */}
      <circle cx="14" cy="71" r="3" fill="#d1fae5"/>

      {/* right arm – stirring (animated) */}
      <g className="wc-stir">
        <line x1="50" y1="57" x2="67" y2="65" stroke="#d1fae5" strokeWidth="4" strokeLinecap="round"/>
        <circle cx="67" cy="65" r="3" fill="#d1fae5"/>
        {/* wooden spoon stick */}
        <line x1="67" y1="66" x2="69" y2="76" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round"/>
        {/* spoon bowl */}
        <ellipse cx="67.5" cy="78" rx="4" ry="3" fill="#92400e"/>
      </g>

      {/* ── cauldron ── */}
      {/* legs */}
      <rect x="27" y="86" width="7" height="10" rx="2.5" fill="#374151"/>
      <rect x="54" y="86" width="7" height="10" rx="2.5" fill="#374151"/>
      {/* body */}
      <path d="M18 70 Q16 94 45 95 Q74 94 72 70 Z" fill="#111827"/>
      {/* rim */}
      <ellipse cx="45" cy="70" rx="27" ry="8.5" fill="#374151"/>
      {/* inside dark */}
      <ellipse cx="45" cy="70" rx="23" ry="6.5" fill="#14532d"/>
      {/* liquid surface */}
      <ellipse cx="45" cy="69" rx="21" ry="5" fill="#16a34a"/>
      {/* liquid highlight */}
      <ellipse cx="41" cy="68" rx="9" ry="2" fill="#22c55e" opacity=".5"/>
      {/* cauldron shine */}
      <path d="M20 74 Q18 83 20 90" stroke="#4b5563" strokeWidth="2.5" fill="none" opacity=".6" strokeLinecap="round"/>

      {/* bubbles (staggered animations) */}
      <circle className="wc-b1" cx="41" cy="67" r="4"   fill="#4ade80"/>
      <circle className="wc-b2" cx="50" cy="65" r="3"   fill="#86efac"/>
      <circle className="wc-b3" cx="45" cy="63" r="2.5" fill="#4ade80"/>
    </svg>
  );
}
