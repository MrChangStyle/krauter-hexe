import { Chicken } from "@/components/site/scenes";

/**
 * The farm behind the homepage hero (docs/landingpage.md): sky, sun, hills,
 * a red barn, a field with rows, a tree, a fence, chickens and a beehive –
 * drawn, so it needs no photo and stays sharp on every screen; clouds drift,
 * chickens peck and bees buzz (SCENE_STYLES in scenes.tsx). `variant`
 * shifts the light for the sub pages.
 */

const SKY = {
  day: ["#bfe3f7", "#e9f6fb"],
  evening: ["#f9c98b", "#fde9cf"],
  green: ["#cfe9d3", "#f1f8ef"],
} as const;

export function FarmScene({ variant = "day", className = "" }: { variant?: keyof typeof SKY; className?: string }) {
  const [top, bottom] = SKY[variant];
  return (
    <svg viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax slice" className={className} role="img" aria-label="Gezeichneter Bauernhof mit Scheune, Feld, Bienenstock und Hühnern">
      <defs>
        <linearGradient id={`sky-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <linearGradient id="hill-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd28f" />
          <stop offset="1" stopColor="#7fbf72" />
        </linearGradient>
        <linearGradient id="hill-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fb35f" />
          <stop offset="1" stopColor="#4f9a48" />
        </linearGradient>
      </defs>

      <rect width="1200" height="520" fill={`url(#sky-${variant})`} />
      <circle cx="1010" cy="110" r="58" fill="#ffd55a" opacity="0.95" />
      <circle cx="1010" cy="110" r="84" fill="#ffd55a" opacity="0.18" />
      <g fill="#ffffff" opacity="0.9" className="lf-drift">
        <ellipse cx="220" cy="90" rx="70" ry="20" />
        <ellipse cx="270" cy="78" rx="45" ry="22" />
        <ellipse cx="720" cy="60" rx="60" ry="16" />
        <ellipse cx="760" cy="50" rx="38" ry="18" />
      </g>

      {/* Hills */}
      <path d="M0 300 Q180 220 380 270 T760 250 T1200 270 V520 H0 Z" fill="url(#hill-far)" />
      <path d="M0 360 Q240 300 520 340 T1200 320 V520 H0 Z" fill="url(#hill-near)" />

      {/* Field with rows */}
      <path d="M620 360 L1200 330 V520 H520 Z" fill="#c99a5b" />
      <g stroke="#a57a43" strokeWidth="5" strokeLinecap="round">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M${640 + i * 18} ${372 + i * 22} L1200 ${342 + i * 26}`} />
        ))}
      </g>
      <g fill="#5aa64a">
        {[0, 1, 2, 3, 4, 5].map((i) =>
          [0, 1, 2, 3, 4, 5, 6, 7].map((j) => <circle key={`${i}-${j}`} cx={720 + j * 60 + i * 6} cy={378 + i * 22 - j * 3} r={6 + (i % 2)} />),
        )}
      </g>

      {/* Barn */}
      <g transform="translate(150 215)">
        <rect x="0" y="60" width="190" height="125" fill="#c8453b" />
        <path d="M-12 64 L95 0 L202 64 Z" fill="#8f2f2a" />
        <rect x="65" y="105" width="60" height="80" fill="#f3e3c3" />
        <path d="M65 105 L125 185 M125 105 L65 185" stroke="#c8453b" strokeWidth="6" />
        <rect x="80" y="30" width="30" height="24" fill="#f3e3c3" />
        <rect x="18" y="82" width="30" height="26" fill="#f3e3c3" />
        <rect x="142" y="82" width="30" height="26" fill="#f3e3c3" />
      </g>
      {/* Silo */}
      <g transform="translate(350 230)">
        <rect x="0" y="20" width="46" height="150" fill="#d9d4c7" />
        <path d="M0 22 Q23 -8 46 22 Z" fill="#9aa3a8" />
        <path d="M0 60 H46 M0 100 H46 M0 140 H46" stroke="#b9b3a5" strokeWidth="3" />
      </g>

      {/* Tree */}
      <g transform="translate(470 250)">
        <rect x="-8" y="40" width="16" height="70" fill="#7a5233" />
        <circle cx="0" cy="20" r="46" fill="#3f8f3d" />
        <circle cx="-28" cy="38" r="30" fill="#4a9c44" />
        <circle cx="30" cy="36" r="32" fill="#4a9c44" />
        <circle cx="-14" cy="12" r="6" fill="#e2453c" />
        <circle cx="18" cy="30" r="6" fill="#e2453c" />
        <circle cx="-30" cy="44" r="6" fill="#e2453c" />
      </g>

      {/* Beehive */}
      <g transform="translate(560 368)">
        <rect x="0" y="12" width="44" height="38" fill="#f2c14e" stroke="#b8862a" strokeWidth="2" />
        <rect x="-4" y="4" width="52" height="10" fill="#e0a83a" />
        <rect x="16" y="40" width="12" height="5" fill="#6b4f3a" />
        <circle cx="62" cy="10" r="3" fill="#2b2b2b" className="lf-buzz" />
        <circle cx="74" cy="0" r="3" fill="#2b2b2b" className="lf-buzz" style={{ animationDelay: "1.1s" }} />
      </g>

      {/* Fence */}
      <g stroke="#8b6a47" strokeWidth="6" strokeLinecap="round">
        <path d="M0 448 H520" />
        <path d="M0 476 H520" />
        {[20, 80, 140, 200, 260, 320, 380, 440, 500].map((x) => (
          <path key={x} d={`M${x} 430 V500`} />
        ))}
      </g>

      {/* Meadow in front, chickens */}
      <path d="M0 470 Q300 440 600 470 T1200 460 V520 H0 Z" fill="#3f8a39" />
      <Chicken x={220} y={490} />
      <Chicken x={300} y={498} flip color="#c9853f" delay={0.9} />
      <Chicken x={380} y={488} delay={1.7} />
      <g fill="#f7d34a">
        <circle cx="120" cy="500" r="5" />
        <circle cx="640" cy="492" r="5" />
        <circle cx="900" cy="500" r="5" />
        <circle cx="1080" cy="488" r="5" />
      </g>
    </svg>
  );
}
