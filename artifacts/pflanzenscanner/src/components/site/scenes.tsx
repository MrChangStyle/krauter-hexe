import { useId, type ReactNode } from "react";

/**
 * The drawn pictures of the homepage (docs/landingpage.md): one small scene
 * per topic – bees, raised bed, herbs, pantry, chickens, goats, sheep, alpacas, the
 * team, the harvest basket – in the style of the farm behind the start page,
 * with a little life in them (clouds drift, bees buzz, chickens peck). The
 * movement stops for "reduce motion".
 */

export const SCENE_STYLES = `
@keyframes lf-drift { from { transform: translateX(-30px); } to { transform: translateX(30px); } }
@keyframes lf-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes lf-peck { 0%, 60%, 100% { transform: rotate(0deg); } 70%, 85% { transform: rotate(22deg); } }
@keyframes lf-buzz { 0% { transform: translate(0, 0); } 25% { transform: translate(14px, -8px); } 50% { transform: translate(26px, 2px); } 75% { transform: translate(10px, 9px); } 100% { transform: translate(0, 0); } }
@keyframes lf-sway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@keyframes lf-twinkle { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
.lf-drift { animation: lf-drift 14s ease-in-out infinite alternate; }
.lf-bob { animation: lf-bob 3s ease-in-out infinite; transform-box: fill-box; }
.lf-peck { animation: lf-peck 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: 30% 80%; }
.lf-buzz { animation: lf-buzz 3.2s ease-in-out infinite; transform-box: fill-box; }
.lf-sway { animation: lf-sway 4s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.lf-twinkle { animation: lf-twinkle 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .lf-drift, .lf-bob, .lf-peck, .lf-buzz, .lf-sway, .lf-twinkle { animation: none; }
}
`;

/** Once per page: the keyframes the scenes use. */
export function SceneStyles() {
  return <style>{SCENE_STYLES}</style>;
}

const OUTLINE = "#6b4f3a";

function Frame({ label, sky = ["#bfe3f7", "#eef8fc"], children, className = "" }: { label: string; sky?: [string, string]; children: ReactNode; className?: string }) {
  // Unique per picture: several scenes share a page.
  const id = `sky${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      {children}
    </svg>
  );
}

function Sun({ x = 330, y = 60, r = 26 }: { x?: number; y?: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 14} fill="#ffd55a" opacity="0.2" />
      <circle cx={x} cy={y} r={r} fill="#ffd55a" />
    </g>
  );
}

function Clouds() {
  return (
    <g className="lf-drift" fill="#ffffff" opacity="0.9">
      <ellipse cx="90" cy="50" rx="38" ry="12" />
      <ellipse cx="115" cy="42" rx="24" ry="13" />
      <ellipse cx="230" cy="34" rx="30" ry="9" />
    </g>
  );
}

function Hills({ y = 190 }: { y?: number }) {
  return (
    <>
      <path d={`M0 ${y} Q90 ${y - 40} 200 ${y - 10} T400 ${y - 20} V300 H0 Z`} fill="#9fd28f" />
      <path d={`M0 ${y + 40} Q140 ${y + 5} 260 ${y + 30} T400 ${y + 25} V300 H0 Z`} fill="#6fb35f" />
    </>
  );
}

function Flowers({ y = 280, xs = [30, 80, 150, 300, 360] }: { y?: number; xs?: number[] }) {
  const colors = ["#f7d34a", "#f28ab2", "#ffffff", "#b58cf2", "#f7d34a"];
  return (
    <g>
      {xs.map((x, i) => (
        <g key={x} className="lf-sway" style={{ animationDelay: `${i * 0.4}s` }}>
          <path d={`M${x} ${y} V${y - 14}`} stroke="#3f8a39" strokeWidth="2" />
          <circle cx={x} cy={y - 16} r="4" fill={colors[i % colors.length]} />
          <circle cx={x} cy={y - 16} r="1.5" fill="#e0a83a" />
        </g>
      ))}
    </g>
  );
}

export function Chicken({ x, y, flip = false, color = "#ffffff", peck = true, delay = 0 }: { x: number; y: number; flip?: boolean; color?: string; peck?: boolean; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <g className={peck ? "lf-peck" : undefined} style={{ animationDelay: `${delay}s` }}>
        <ellipse cx="0" cy="0" rx="13" ry="10" fill={color} stroke={OUTLINE} strokeWidth="1.2" />
        <circle cx="10" cy="-9" r="6" fill={color} stroke={OUTLINE} strokeWidth="1.2" />
        <path d="M8 -16 q2 -4 4 0 q2 -4 3 1" fill="#e2453c" />
        <path d="M16 -9 l5 1.5 l-5 1.5 z" fill="#f2a93b" />
        <circle cx="11.5" cy="-10" r="1" fill="#2b2b2b" />
        <path d="M-13 -4 q-8 -6 -6 4" fill={color} stroke={OUTLINE} strokeWidth="1.2" />
      </g>
      <path d="M-2 10 v6 M3 10 v6" stroke="#f2a93b" strokeWidth="1.6" />
    </g>
  );
}

function Bee({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return (
    <g className="lf-buzz" style={{ animationDelay: `${delay}s` }}>
      <g transform={`translate(${x} ${y})`}>
        <ellipse cx="-2" cy="-5" rx="4" ry="3" fill="#ffffff" opacity="0.85" />
        <ellipse cx="3" cy="-5" rx="4" ry="3" fill="#ffffff" opacity="0.85" />
        <ellipse cx="0" cy="0" rx="6" ry="4" fill="#f2c14e" stroke="#2b2b2b" strokeWidth="0.8" />
        <path d="M-2 -3.6 V3.6 M2 -3.6 V3.6" stroke="#2b2b2b" strokeWidth="1.4" />
      </g>
    </g>
  );
}

// ── Scenes ───────────────────────────────────────────────────────────────────

/** Bienen: hives at the edge of a flowering meadow, bees flying. */
export function BeesScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnete Bienenstöcke auf einer Blumenwiese mit fliegenden Bienen" className={className}>
      <Sun />
      <Clouds />
      <Hills y={180} />
      {/* Apple tree in bloom */}
      <g transform="translate(320 150)">
        <rect x="-6" y="20" width="12" height="70" fill="#7a5233" />
        <circle cx="0" cy="10" r="38" fill="#4a9c44" />
        {[[-18, -4], [10, -14], [20, 12], [-10, 22], [0, 2]].map(([cx, cy]) => (
          <circle key={`${cx}${cy}`} cx={cx} cy={cy} r="5" fill="#f9c6d8" />
        ))}
      </g>
      {/* Hives */}
      {[60, 150, 240].map((x, i) => (
        <g key={x} transform={`translate(${x} ${190 + (i % 2) * 6})`}>
          <rect x="-4" y="70" width="64" height="8" fill="#8b6a47" />
          <rect x="0" y="22" width="56" height="48" fill={["#f2c14e", "#9fd3e6", "#f5a3a3"][i]} stroke="#b8862a" strokeWidth="2" />
          <path d="M0 46 H56" stroke="#b8862a" strokeWidth="2" />
          <rect x="-5" y="12" width="66" height="12" rx="2" fill="#e0a83a" />
          <rect x="20" y="60" width="16" height="5" fill="#4b3a2b" />
        </g>
      ))}
      <Flowers y={295} xs={[20, 45, 120, 215, 300, 345, 380]} />
      <Bee x={95} y={180} />
      <Bee x={180} y={165} delay={0.8} />
      <Bee x={270} y={150} delay={1.6} />
      <Bee x={300} y={210} delay={0.4} />
    </Frame>
  );
}

/** Beet-Architekt: a raised bed full of vegetables, a watering can. */
export function GardenScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnetes Hochbeet mit Tomaten, Salat und Möhren" className={className}>
      <Sun x={60} />
      <Clouds />
      <Hills y={170} />
      {/* Raised bed */}
      <g transform="translate(60 170)">
        {/* Tomato stakes */}
        {[40, 90].map((x, i) => (
          <g key={x} className="lf-sway" style={{ animationDelay: `${i * 0.7}s` }}>
            <path d={`M${x} 40 V-10`} stroke="#a57a43" strokeWidth="3" />
            <path d={`M${x} 40 q-14 -16 0 -30 q14 -14 0 -34`} stroke="#3f8f3d" strokeWidth="4" fill="none" />
            <circle cx={x - 8} cy="12" r="7" fill="#e2453c" />
            <circle cx={x + 7} cy="-4" r="6" fill="#e2453c" />
            <circle cx={x - 5} cy="-16" r="5" fill="#f2a93b" />
          </g>
        ))}
        {/* Lettuce */}
        {[140, 175].map((x) => (
          <g key={x}>
            <circle cx={x} cy="34" r="15" fill="#8fd16a" />
            <circle cx={x} cy="32" r="9" fill="#b6e58e" />
          </g>
        ))}
        {/* Carrot tops */}
        {[210, 228, 246].map((x, i) => (
          <g key={x} className="lf-sway" style={{ animationDelay: `${i * 0.5}s` }}>
            <path d={`M${x} 42 l-6 -22 M${x} 42 l0 -24 M${x} 42 l6 -22`} stroke="#4a9c44" strokeWidth="3" strokeLinecap="round" />
            <path d={`M${x - 4} 42 h8 l-4 8 z`} fill="#f28c28" />
          </g>
        ))}
        {/* Marigold */}
        <circle cx="270" cy="30" r="7" fill="#f2a93b" />
        <circle cx="270" cy="30" r="3" fill="#e0782a" />
        {/* The bed */}
        <rect x="0" y="42" width="290" height="70" fill="#a57a43" stroke="#7a5233" strokeWidth="3" />
        <path d="M0 65 H290 M0 88 H290" stroke="#8b6a47" strokeWidth="2" />
        <rect x="-6" y="36" width="302" height="10" fill="#8b6a47" />
      </g>
      {/* Watering can */}
      <g transform="translate(20 252)" className="lf-bob">
        <rect x="0" y="0" width="30" height="22" rx="4" fill="#5ba3c7" />
        <path d="M30 6 l18 -12" stroke="#5ba3c7" strokeWidth="5" strokeLinecap="round" />
        <path d="M6 0 q9 -14 18 0" stroke="#5ba3c7" strokeWidth="4" fill="none" />
      </g>
    </Frame>
  );
}

/** Pflanzen: plants on a window sill, a phone scanning a leaf. */
export function PlantsScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnete Zimmerpflanzen am Fenster und ein Handy, das ein Blatt scannt" sky={["#f6efe3", "#efe4d2"]} className={className}>
      {/* Window */}
      <rect x="40" y="20" width="320" height="170" rx="8" fill="#bfe3f7" stroke="#ffffff" strokeWidth="10" />
      <path d="M200 20 V190" stroke="#ffffff" strokeWidth="8" />
      <g opacity="0.9">
        <Sun x={300} y={70} r={20} />
      </g>
      <g className="lf-drift" fill="#ffffff">
        <ellipse cx="110" cy="70" rx="30" ry="9" />
      </g>
      <path d="M40 160 Q120 130 200 150 T360 140 V190 H40 Z" fill="#9fd28f" />
      {/* Sill */}
      <rect x="20" y="190" width="360" height="16" rx="3" fill="#d9c4a3" />
      {/* Monstera */}
      <g transform="translate(90 190)">
        <path d="M-18 0 h36 l-5 40 h-26 z" fill="#c8673b" />
        <g className="lf-sway">
          <path d="M0 0 C-8 -30 -30 -40 -44 -60" stroke="#3f8f3d" strokeWidth="3" fill="none" />
          <ellipse cx="-44" cy="-66" rx="22" ry="16" fill="#3f8f3d" />
          <path d="M0 0 C6 -30 24 -50 34 -76" stroke="#3f8f3d" strokeWidth="3" fill="none" />
          <ellipse cx="34" cy="-82" rx="20" ry="15" fill="#4a9c44" />
          <ellipse cx="0" cy="-48" rx="16" ry="12" fill="#5aa64a" />
        </g>
      </g>
      {/* Cactus */}
      <g transform="translate(175 190)">
        <path d="M-14 0 h28 l-4 30 h-20 z" fill="#5ba3c7" />
        <rect x="-8" y="-46" width="16" height="46" rx="8" fill="#6fb35f" />
        <rect x="6" y="-30" width="12" height="8" rx="4" fill="#6fb35f" />
        <circle cx="0" cy="-48" r="4" fill="#f28ab2" className="lf-twinkle" />
      </g>
      {/* Phone scanning */}
      <g transform="translate(270 110)" className="lf-bob">
        <rect x="0" y="0" width="62" height="110" rx="10" fill="#2f3b33" />
        <rect x="5" y="10" width="52" height="88" rx="4" fill="#e9f6ef" />
        <ellipse cx="31" cy="52" rx="14" ry="10" fill="#4a9c44" />
        <path d="M14 34 v-6 h6 M42 28 h6 v6 M48 70 v6 h-6 M20 76 h-6 v-6" stroke="#3f7a5a" strokeWidth="2.5" fill="none" />
        <rect x="16" y="84" width="30" height="6" rx="3" fill="#3f7a5a" />
      </g>
    </Frame>
  );
}

/** Kräuter-Hexe: herb bundles drying, a mortar, chamomile. */
export function HerbsScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnete Kräuterbündel, die trocknen, ein Mörser und Kamille" sky={["#f6efe3", "#efe4d2"]} className={className}>
      {/* Beam with bundles */}
      <rect x="0" y="30" width="400" height="14" fill="#8b6a47" />
      {[60, 140, 220, 300].map((x, i) => (
        <g key={x} className="lf-sway" style={{ animationDelay: `${i * 0.6}s`, transformOrigin: "50% 0%" }}>
          <path d={`M${x} 44 V70`} stroke="#a57a43" strokeWidth="2" />
          <path d={`M${x} 70 l-16 50 h32 z`} fill={["#6fb35f", "#8fae6a", "#4a9c44", "#9b8fc2"][i]} />
          <rect x={x - 6} y="66" width="12" height="8" fill="#d9c4a3" />
        </g>
      ))}
      {/* Table */}
      <rect x="0" y="220" width="400" height="80" fill="#a57a43" />
      <path d="M0 220 H400" stroke="#7a5233" strokeWidth="4" />
      {/* Mortar */}
      <g transform="translate(110 215)">
        <path d="M-40 -30 h80 q-6 40 -40 40 q-34 0 -40 -40 z" fill="#c9c2b4" stroke="#9a9283" strokeWidth="2" />
        <rect x="18" y="-62" width="10" height="44" rx="5" fill="#b7aa95" transform="rotate(20 23 -40)" />
      </g>
      {/* Chamomile and sage on the table */}
      {[230, 255, 280, 305].map((x, i) => (
        <g key={x} className="lf-sway" style={{ animationDelay: `${i * 0.3}s` }}>
          <path d={`M${x} 222 V190`} stroke="#4a9c44" strokeWidth="2" />
          <circle cx={x} cy="188" r="8" fill="#ffffff" />
          <circle cx={x} cy="188" r="3.5" fill="#f2c14e" />
        </g>
      ))}
      <ellipse cx="350" cy="214" rx="22" ry="8" fill="#8fae6a" />
      <ellipse cx="342" cy="206" rx="14" ry="6" fill="#9cbf78" />
    </Frame>
  );
}

/** Vorratskammer: a shelf with jars of jam, pickles and honey. */
export function PantryScene({ className }: { className?: string }) {
  const jar = (x: number, y: number, fill: string, lid: string, h = 46) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y - h})`}>
      <rect x="0" y="8" width="38" height={h - 8} rx="6" fill={fill} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="2" />
      <rect x="-2" y="0" width="42" height="10" rx="2" fill={lid} />
      <rect x="6" y={h / 2} width="26" height="12" rx="2" fill="#f3e3c3" />
      <rect x="6" y="14" width="5" height={h - 22} rx="2" fill="#ffffff" opacity="0.4" />
    </g>
  );
  return (
    <Frame label="Gezeichnetes Regal mit Gläsern voller Marmelade, Gurken und Honig" sky={["#f3ead9", "#e8dcc5"]} className={className}>
      {[120, 210, 300].map((y) => (
        <rect key={y} x="20" y={y} width="360" height="12" rx="2" fill="#8b6a47" />
      ))}
      {jar(40, 120, "#c0392b", "#d9a441")}
      {jar(90, 120, "#e67e22", "#d9a441", 40)}
      {jar(140, 120, "#8e44ad", "#d9a441")}
      {jar(200, 120, "#c0392b", "#7a5233", 36)}
      {jar(250, 120, "#f39c12", "#d9a441")}
      {jar(310, 120, "#e74c3c", "#d9a441", 42)}
      {jar(40, 210, "#7fa650", "#8a8a8a", 54)}
      {jar(95, 210, "#6b8f3f", "#8a8a8a", 54)}
      {jar(150, 210, "#d4a017", "#7a5233", 40)}
      {jar(205, 210, "#e3b23c", "#7a5233", 40)}
      {jar(260, 210, "#a3c76b", "#8a8a8a", 50)}
      {jar(320, 210, "#d35400", "#d9a441")}
      {jar(50, 300, "#f2c14e", "#7a5233", 48)}
      {jar(110, 300, "#f2c14e", "#7a5233", 48)}
      {/* Honey dipper */}
      <g transform="translate(170 260)" className="lf-bob">
        <rect x="0" y="0" width="60" height="6" rx="3" fill="#a57a43" transform="rotate(-20)" />
        <ellipse cx="62" cy="-20" rx="10" ry="8" fill="#e0a83a" />
      </g>
      {/* Basket of potatoes */}
      <g transform="translate(270 255)">
        <path d="M0 0 h90 l-10 40 h-70 z" fill="#c99a5b" stroke="#8b6a47" strokeWidth="2" />
        {[15, 35, 55, 75].map((x) => (
          <ellipse key={x} cx={x} cy="-2" rx="11" ry="8" fill="#c8a06a" />
        ))}
      </g>
    </Frame>
  );
}

/** Tiere: chickens in front of their coop, eggs in the nest. */
export function ChickensScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnete Hühner auf der Wiese vor ihrem Stall" className={className}>
      <Sun />
      <Clouds />
      <Hills y={180} />
      {/* Coop */}
      <g transform="translate(40 120)">
        <rect x="0" y="40" width="120" height="90" fill="#c8453b" />
        <path d="M-10 44 L60 0 L130 44 Z" fill="#8f2f2a" />
        <rect x="45" y="80" width="30" height="50" fill="#5b3b2a" />
        <rect x="14" y="58" width="22" height="18" fill="#f3e3c3" />
        <path d="M60 130 l30 30" stroke="#a57a43" strokeWidth="6" />
        <rect x="0" y="130" width="10" height="20" fill="#8b6a47" />
        <rect x="110" y="130" width="10" height="20" fill="#8b6a47" />
      </g>
      {/* Nest with eggs */}
      <g transform="translate(330 262)">
        <ellipse cx="0" cy="0" rx="34" ry="12" fill="#d9b26a" />
        <ellipse cx="-12" cy="-6" rx="8" ry="10" fill="#fff6e6" />
        <ellipse cx="4" cy="-8" rx="8" ry="10" fill="#f3d7b0" />
        <ellipse cx="16" cy="-5" rx="7" ry="9" fill="#fff6e6" />
      </g>
      <Chicken x={190} y={250} delay={0} />
      <Chicken x={240} y={268} flip color="#c9853f" delay={0.9} />
      <Chicken x={150} y={278} color="#3b3b3b" delay={1.7} />
      <Flowers y={298} xs={[20, 110, 290, 380]} />
    </Frame>
  );
}

function Goat({ x, y, flip = false, kid = false, delay = 0 }: { x: number; y: number; flip?: boolean; kid?: boolean; delay?: number }) {
  const s = kid ? 0.65 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path d="M-22 18 v26 M-10 18 v26 M14 18 v26 M24 18 v26" stroke="#efe6d8" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="0" cy="8" rx="32" ry="20" fill="#efe6d8" stroke={OUTLINE} strokeWidth="1.2" />
      <g className="lf-peck" style={{ animationDelay: `${delay}s` }}>
        <path d="M24 -2 l18 -18 l10 6 l-8 20 z" fill="#efe6d8" stroke={OUTLINE} strokeWidth="1.2" />
        <path d="M40 -18 l-4 -14 M46 -16 l2 -14" stroke="#8b6a47" strokeWidth="3" strokeLinecap="round" />
        <circle cx="45" cy="-10" r="1.6" fill="#2b2b2b" />
        <path d="M50 6 l2 8" stroke="#efe6d8" strokeWidth="3" />
      </g>
    </g>
  );
}

/** Futter & Zucht: goats and a kid at the hay rack. */
export function GoatsScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnete Ziegen und ein Zicklein an der Heuraufe" className={className}>
      <Sun x={70} />
      <Clouds />
      <Hills y={175} />
      {/* Hay rack */}
      <g transform="translate(250 160)">
        <rect x="0" y="0" width="110" height="80" fill="#8b6a47" />
        {[10, 30, 50, 70, 90].map((x) => (
          <path key={x} d={`M${x} 0 V80`} stroke="#6b4f3a" strokeWidth="5" />
        ))}
        <path d="M-6 0 Q55 -40 116 0 Z" fill="#e3c26b" />
        <path d="M10 -10 l8 -8 M40 -18 l6 -10 M75 -16 l-4 -10" stroke="#c9a04a" strokeWidth="3" />
        <rect x="0" y="80" width="8" height="40" fill="#6b4f3a" />
        <rect x="102" y="80" width="8" height="40" fill="#6b4f3a" />
      </g>
      <Goat x={180} y={230} delay={0} />
      <Goat x={90} y={238} flip delay={1.2} />
      <Goat x={140} y={262} kid delay={0.5} />
      {/* Hay on the ground */}
      <ellipse cx="300" cy="282" rx="50" ry="8" fill="#e3c26b" />
    </Frame>
  );
}

function Sheep({ x, y, flip = false, delay = 0 }: { x: number; y: number; flip?: boolean; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M-14 12 v16 M-4 12 v16 M8 12 v16 M16 12 v16" stroke="#3b3b3b" strokeWidth="4" strokeLinecap="round" />
      <g fill="#ffffff" stroke="#d9d4c7" strokeWidth="1">
        <circle cx="-14" cy="0" r="12" />
        <circle cx="0" cy="-6" r="13" />
        <circle cx="14" cy="0" r="12" />
        <circle cx="0" cy="8" r="12" />
      </g>
      <g className="lf-peck" style={{ animationDelay: `${delay}s` }}>
        <ellipse cx="26" cy="2" rx="9" ry="7" fill="#3b3b3b" />
        <circle cx="29" cy="0" r="1.4" fill="#ffffff" />
      </g>
    </g>
  );
}

/** Weide: sheep grazing on a fenced pasture. */
export function PastureScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnete Schafe auf einer eingezäunten Weide" className={className}>
      <Sun x={340} y={56} />
      <Clouds />
      <Hills y={160} />
      <g stroke="#8b6a47" strokeWidth="5" strokeLinecap="round">
        <path d="M0 196 H400" />
        <path d="M0 214 H400" />
        {[20, 80, 140, 200, 260, 320, 380].map((x) => (
          <path key={x} d={`M${x} 184 V228`} />
        ))}
      </g>
      <path d="M0 230 Q200 210 400 232 V300 H0 Z" fill="#4f9a48" />
      <Sheep x={90} y={250} delay={0} />
      <Sheep x={200} y={268} flip delay={1.1} />
      <Sheep x={300} y={248} delay={0.6} />
      <Flowers y={298} xs={[30, 150, 250, 370]} />
    </Frame>
  );
}

function Person({ x, y, shirt, hair, scale = 1, children }: { x: number; y: number; shirt: string; hair: string; scale?: number; children?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-10 40 v34 M10 40 v34" stroke="#4b5d73" strokeWidth="8" strokeLinecap="round" />
      <path d="M-18 4 q18 -12 36 0 v40 h-36 z" fill={shirt} />
      <circle cx="0" cy="-14" r="13" fill="#f2c9a0" />
      <path d="M-13 -16 q13 -16 26 0 q-4 -8 -13 -8 q-9 0 -13 8 z" fill={hair} />
      {children}
    </g>
  );
}

/** Gemeinsam auf dem Hof: three generations working together. */
export function TeamScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnete Familie, die gemeinsam auf dem Hof arbeitet" sky={["#f9d9a8", "#fdf0dc"]} className={className}>
      <Sun x={70} y={70} />
      <Clouds />
      <Hills y={175} />
      {/* Barn */}
      <g transform="translate(270 110)">
        <rect x="0" y="40" width="100" height="80" fill="#c8453b" />
        <path d="M-8 44 L50 4 L108 44 Z" fill="#8f2f2a" />
        <rect x="35" y="70" width="30" height="50" fill="#f3e3c3" />
      </g>
      <Person x={110} y={190} shirt="#4f9a48" hair="#8a8a8a">
        <g transform="translate(18 20)" className="lf-bob">
          <path d="M0 0 h30 l-5 20 h-20 z" fill="#c99a5b" />
          <circle cx="8" cy="-2" r="5" fill="#e2453c" />
          <circle cx="20" cy="-3" r="5" fill="#f28c28" />
        </g>
      </Person>
      <Person x={185} y={186} shirt="#5ba3c7" hair="#5b3b2a" />
      <Person x={240} y={214} shirt="#f2a93b" hair="#c9853f" scale={0.72} />
      <Chicken x={300} y={270} delay={0.4} />
      <Chicken x={60} y={276} flip color="#c9853f" delay={1.3} />
    </Frame>
  );
}

/** Preise & Pakete: a harvest basket with eggs, vegetables and honey. */
export function BasketScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichneter Korb mit Eiern, Gemüse und einem Glas Honig" sky={["#e9f6ef", "#f6fbf7"]} className={className}>
      <Sun x={340} y={56} r={22} />
      <Hills y={190} />
      <rect x="0" y="230" width="400" height="70" fill="#a57a43" />
      <path d="M0 230 H400" stroke="#7a5233" strokeWidth="4" />
      {/* Basket */}
      <g transform="translate(110 150)">
        <path d="M0 0 q90 -90 180 0" stroke="#8b6a47" strokeWidth="8" fill="none" />
        <g className="lf-bob">
          <circle cx="40" cy="-6" r="16" fill="#e2453c" />
          <ellipse cx="78" cy="-10" rx="11" ry="14" fill="#fff6e6" />
          <ellipse cx="98" cy="-8" rx="11" ry="14" fill="#f3d7b0" />
          <circle cx="132" cy="-8" r="15" fill="#8fd16a" />
          <path d="M150 -2 l26 -30" stroke="#f28c28" strokeWidth="9" strokeLinecap="round" />
          <path d="M176 -32 l4 -10 M176 -32 l10 -4" stroke="#4a9c44" strokeWidth="3" />
        </g>
        <path d="M-6 0 h192 l-16 80 h-160 z" fill="#c99a5b" stroke="#8b6a47" strokeWidth="3" />
        <path d="M2 26 h176 M8 52 h164" stroke="#a57a43" strokeWidth="3" />
      </g>
      {/* Honey jar */}
      <g transform="translate(320 186)">
        <rect x="0" y="10" width="40" height="44" rx="6" fill="#f2c14e" />
        <rect x="-2" y="2" width="44" height="10" rx="2" fill="#7a5233" />
        <rect x="8" y="24" width="24" height="12" rx="2" fill="#f3e3c3" />
      </g>
      <Bee x={360} y={160} />
    </Frame>
  );
}

/** Wildtier-Radar: a fox at the coop fence at night, the camera lights up. */
export function WildlifeScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichneter Fuchs nachts am Hühnerzaun, eine Kamera leuchtet" sky={["#22314f", "#3b4f73"]} className={className}>
      <circle cx="320" cy="60" r="24" fill="#f6f1d3" />
      <circle cx="310" cy="54" r="5" fill="#e3dcb6" />
      {[[40, 40], [90, 80], [160, 30], [220, 70], [370, 120]].map(([x, y], i) => (
        <circle key={x} cx={x} cy={y} r="2" fill="#ffffff" className="lf-twinkle" style={{ animationDelay: `${i * 0.5}s` }} />
      ))}
      <path d="M0 200 Q120 170 240 195 T400 185 V300 H0 Z" fill="#2f5a3a" />
      {/* Coop */}
      <g transform="translate(250 140)">
        <rect x="0" y="30" width="110" height="80" fill="#7d3a35" />
        <path d="M-8 34 L55 0 L118 34 Z" fill="#5a2a27" />
        <rect x="40" y="60" width="28" height="50" fill="#3a2a22" />
        {/* Camera with light */}
        <rect x="-4" y="12" width="18" height="12" rx="2" fill="#cfd6dc" />
        <circle cx="5" cy="18" r="3" fill="#ff5c5c" className="lf-twinkle" />
        <path d="M-6 18 L-90 70 L-60 110 Z" fill="#fff6c9" opacity="0.25" className="lf-twinkle" />
      </g>
      {/* Fence */}
      <g stroke="#a58a6a" strokeWidth="4">
        <path d="M0 236 H240 M0 256 H240" />
        {[20, 70, 120, 170, 220].map((x) => (
          <path key={x} d={`M${x} 226 V272`} />
        ))}
      </g>
      {/* Fox */}
      <g transform="translate(130 250)" className="lf-bob">
        <path d="M-40 0 q-30 -10 -24 -26 q14 10 26 16 z" fill="#e07a2e" />
        <ellipse cx="0" cy="0" rx="34" ry="16" fill="#e07a2e" />
        <path d="M24 -6 l26 -8 l-6 22 z" fill="#e07a2e" />
        <path d="M30 -12 l4 -14 l8 10 z M40 -14 l6 -12 l6 12 z" fill="#c4611f" />
        <circle cx="42" cy="-4" r="1.8" fill="#ffffff" />
        <path d="M-20 14 v12 M-6 14 v12 M10 14 v12 M22 14 v12" stroke="#3a2a22" strokeWidth="4" strokeLinecap="round" />
        <path d="M-58 -22 q4 -4 8 2" stroke="#ffffff" strokeWidth="4" />
      </g>
      {/* Push on a phone */}
      <g transform="translate(20 30)" className="lf-bob">
        <rect x="0" y="0" width="120" height="40" rx="10" fill="#ffffff" opacity="0.95" />
        <circle cx="20" cy="20" r="10" fill="#e2453c" />
        <rect x="38" y="12" width="70" height="6" rx="3" fill="#3b4f73" />
        <rect x="38" y="24" width="50" height="5" rx="2.5" fill="#9aa3a8" />
      </g>
    </Frame>
  );
}

/** Schädlinge & Nützlinge: a ladybug on a leaf, seen through a magnifier. */
export function PestsScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichneter Marienkäfer auf einem Blatt unter einer Lupe" sky={["#e9f6ef", "#f6fbf7"]} className={className}>
      <Hills y={200} />
      <g className="lf-sway" style={{ transformOrigin: "50% 100%" }}>
        <path d="M200 300 C200 240 190 200 180 160" stroke="#3f8f3d" strokeWidth="6" fill="none" />
        <path d="M180 160 C110 150 80 90 120 50 C170 70 210 110 180 160 Z" fill="#5aa64a" />
        <path d="M180 160 C150 120 140 90 120 50" stroke="#3f8f3d" strokeWidth="3" fill="none" />
        <path d="M196 220 C260 210 300 160 280 110 C230 120 200 170 196 220 Z" fill="#6fb35f" />
      </g>
      {/* Ladybug */}
      <g transform="translate(150 110)" className="lf-bob">
        <ellipse cx="0" cy="0" rx="18" ry="14" fill="#e2453c" />
        <path d="M0 -14 V14" stroke="#2b2b2b" strokeWidth="2" />
        <circle cx="-8" cy="-4" r="3" fill="#2b2b2b" />
        <circle cx="8" cy="4" r="3" fill="#2b2b2b" />
        <circle cx="-6" cy="7" r="2.5" fill="#2b2b2b" />
        <circle cx="0" cy="-17" r="7" fill="#2b2b2b" />
      </g>
      {/* Aphids */}
      {[[250, 150], [262, 142], [270, 156]].map(([x, y]) => (
        <ellipse key={x} cx={x} cy={y} rx="4" ry="3" fill="#a8d66b" />
      ))}
      {/* Magnifier */}
      <g transform="translate(250 60)">
        <circle cx="0" cy="0" r="40" fill="#ffffff" opacity="0.25" stroke="#7a5233" strokeWidth="8" />
        <path d="M28 28 l40 40" stroke="#7a5233" strokeWidth="12" strokeLinecap="round" />
      </g>
      <Bee x={330} y={210} />
    </Frame>
  );
}

/** Zucht: a mother hen with chicks, eggs hatching. */
export function ChicksScene({ className }: { className?: string }) {
  const chick = (x: number, y: number, delay: number) => (
    <g key={x} transform={`translate(${x} ${y})`}>
      <g className="lf-peck" style={{ animationDelay: `${delay}s` }}>
        <circle cx="0" cy="0" r="9" fill="#f7d34a" />
        <circle cx="6" cy="-7" r="5" fill="#f7d34a" />
        <path d="M10 -7 l4 1 l-4 1 z" fill="#f2a93b" />
        <circle cx="7" cy="-8" r="0.9" fill="#2b2b2b" />
      </g>
      <path d="M-2 8 v5 M2 8 v5" stroke="#f2a93b" strokeWidth="1.4" />
    </g>
  );
  return (
    <Frame label="Gezeichnete Glucke mit Küken und schlüpfenden Eiern" sky={["#fdf0dc", "#fbf7ee"]} className={className}>
      <Sun x={70} y={60} />
      <Hills y={190} />
      {/* Straw nest */}
      <ellipse cx="120" cy="250" rx="80" ry="22" fill="#e3c26b" />
      <g transform="translate(120 222) scale(2.2)">
        <Chicken x={0} y={0} color="#c9853f" peck={false} />
      </g>
      {chick(230, 262, 0)}
      {chick(262, 270, 0.7)}
      {chick(292, 258, 1.4)}
      {/* Hatching egg */}
      <g transform="translate(340 262)" className="lf-bob">
        <ellipse cx="0" cy="0" rx="13" ry="16" fill="#fff6e6" stroke="#d9c4a3" />
        <path d="M-12 -2 l6 -5 l5 5 l6 -6 l5 5 l3 -2" stroke="#b39b78" strokeWidth="1.5" fill="none" />
      </g>
    </Frame>
  );
}

function Alpaca({ x, y, flip = false, wool = "#f3e6cf", cria = false, delay = 0 }: { x: number; y: number; flip?: boolean; wool?: string; cria?: boolean; delay?: number }) {
  const s = cria ? 0.6 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      {/* Legs */}
      <path d="M-18 10 v34 M-8 12 v32 M10 12 v32 M20 10 v34" stroke={wool} strokeWidth="7" strokeLinecap="round" />
      <path d="M-18 10 v34 M-8 12 v32 M10 12 v32 M20 10 v34" stroke={OUTLINE} strokeWidth="1" strokeLinecap="round" fill="none" opacity=".35" />
      {/* Fluffy body */}
      <g fill={wool} stroke={OUTLINE} strokeWidth="1.1">
        <ellipse cx="0" cy="0" rx="30" ry="18" />
        <circle cx="-22" cy="-6" r="9" />
        <circle cx="-6" cy="-12" r="10" />
        <circle cx="12" cy="-11" r="9" />
      </g>
      {/* Long neck and head, nodding now and then */}
      <g className="lf-bob" style={{ animationDelay: `${delay}s` }}>
        <path d="M18 -6 C22 -24 22 -40 26 -52 L38 -50 C34 -38 34 -20 32 -2 Z" fill={wool} stroke={OUTLINE} strokeWidth="1.1" />
        <ellipse cx="36" cy="-56" rx="11" ry="9" fill={wool} stroke={OUTLINE} strokeWidth="1.1" />
        <ellipse cx="45" cy="-52" rx="5" ry="4" fill="#e9d3b4" />
        <path d="M30 -63 q-2 -10 2 -14 q3 5 3 13 M38 -64 q0 -10 5 -13 q1 6 -1 13" fill={wool} stroke={OUTLINE} strokeWidth="1.1" />
        <circle cx="39" cy="-58" r="1.8" fill="#2b2b2b" />
        <path d="M44 -49 q2 1 3 0" stroke="#2b2b2b" strokeWidth="1" fill="none" />
      </g>
    </g>
  );
}

/** Alpakas: a small herd with a cria on the pasture. */
export function AlpacasScene({ className }: { className?: string }) {
  return (
    <Frame label="Gezeichnete Alpakas mit einem Jungtier auf der Weide" className={className}>
      <Sun x={330} y={58} />
      <Clouds />
      <Hills y={170} />
      <g stroke="#8b6a47" strokeWidth="4" strokeLinecap="round">
        <path d="M0 200 H400" />
        {[30, 110, 190, 270, 350].map((x) => (
          <path key={x} d={`M${x} 190 V214`} />
        ))}
      </g>
      <path d="M0 214 Q200 198 400 216 V300 H0 Z" fill="#5aa64f" />
      <Alpaca x={110} y={238} delay={0} />
      <Alpaca x={250} y={232} flip wool="#b98a5e" delay={1.3} />
      <Alpaca x={185} y={262} wool="#f8f1e4" cria delay={0.6} />
      <Flowers y={286} xs={[40, 330, 370]} />
    </Frame>
  );
}

/** Slot → scene; anything else falls back to the farm with an icon (SitePhoto). */
export const SCENES: Record<string, (props: { className?: string }) => ReactNode> = {
  plants: PlantsScene,
  garden: GardenScene,
  herbs: HerbsScene,
  pantry: PantryScene,
  animals: ChickensScene,
  goats: GoatsScene,
  pasture: PastureScene,
  bees: BeesScene,
  team: TeamScene,
  pricing: BasketScene,
  wildlife: WildlifeScene,
  pests: PestsScene,
  chicks: ChicksScene,
  alpacas: AlpacasScene,
};
