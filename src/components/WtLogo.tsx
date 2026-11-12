/** Traço laranja do logo WT: um arco que nasce no W e passa por cima do T. */
export function WtSwoosh({ className = "wtl-swoosh" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="wt-swoosh-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5a00" />
          <stop offset="0.55" stopColor="#ff8a1f" />
          <stop offset="1" stopColor="#ffc46b" />
        </linearGradient>
      </defs>
      <path d="M4 44 C 26 14, 70 2, 116 8 C 74 6, 36 18, 12 46 Z" fill="url(#wt-swoosh-g)" />
    </svg>
  );
}

/** Logotipo WT Sistemas (portal e login). */
export function WtLogo({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="wtl" aria-label="WT Sistemas">
      <span className="wtl-mark" aria-hidden="true">
        <b>WT</b>
        <WtSwoosh />
      </span>
      <span className="wtl-text" aria-hidden="true">
        <b>Sistemas</b>
        {tagline && <small>Tecnologia que impulsiona seu negócio</small>}
      </span>
    </div>
  );
}
