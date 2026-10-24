export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand-compact" : ""}`}>
      <svg
        className="brand-mark"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="20"
          cy="20"
          r="13"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.45"
        />
        <circle cx="20" cy="20" r="2.6" fill="currentColor" />
        <path
          d="M20 2v9M20 29v9M2 20h9M29 20h9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span className="brand-word">FANTOM</span>
    </div>
  );
}
