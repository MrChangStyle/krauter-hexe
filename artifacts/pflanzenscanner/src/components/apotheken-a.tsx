/**
 * The traditional German pharmacy symbol ("Rotes A") — a stylised
 * red capital A with a snake/staff. Used inline next to section labels.
 */
export function ApothekenA({ size = 22 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      aria-label="Apothekenzeichen"
      style={{ flexShrink: 0 }}
    >
      {/* outer circle background */}
      <circle cx="14" cy="14" r="13" fill="#dc2626" />
      <circle cx="14" cy="14" r="11.5" fill="white" />

      {/* stylised red A */}
      <text
        x="14"
        y="19.5"
        textAnchor="middle"
        fontSize="16"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold"
        fill="#dc2626"
        letterSpacing="-0.5"
      >
        A
      </text>

      {/* snake: a simple curved line wrapping the A's right leg */}
      <path
        d="M18.5 9 Q21 11 19 14 Q17 17 19.5 19"
        stroke="#dc2626"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
      {/* snake head */}
      <circle cx="19.5" cy="20" r="1.2" fill="#dc2626" />
      {/* snake tongue */}
      <path
        d="M19.5 21.2 L18.8 22.4 M19.5 21.2 L20.2 22.4"
        stroke="#dc2626"
        strokeWidth=".8"
        strokeLinecap="round"
      />
    </svg>
  );
}
