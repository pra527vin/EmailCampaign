/**
 * The product mark: three stacked waves running green -> lime -> teal -> blue,
 * with the two sparkles from the logo. Drawn as inline SVG so it stays crisp at
 * every size, inherits no colour from the page, and needs no network request.
 */
export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 400" role="img" aria-label="MailStrive" className={className}>
      <defs>
        <linearGradient id="mailstrive-wave-1" x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#0f8a50" />
          <stop offset="45%" stopColor="#5fae2e" />
          <stop offset="100%" stopColor="#cfe553" />
        </linearGradient>
        <linearGradient id="mailstrive-wave-2" x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#0f8a50" />
          <stop offset="55%" stopColor="#9db61a" />
          <stop offset="100%" stopColor="#e2f191" />
        </linearGradient>
        <linearGradient id="mailstrive-wave-3" x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#0f8a50" />
          <stop offset="50%" stopColor="#149dba" />
          <stop offset="100%" stopColor="#1466a0" />
        </linearGradient>
      </defs>

      <g>
        <path
          fill="url(#mailstrive-wave-1)"
          d="M26 214c62 26 112 8 168-34 47-35 88-58 132-56-52 30-86 66-134 100-46 33-104 39-166-10z"
        />
        <path
          fill="url(#mailstrive-wave-2)"
          d="M62 254c62 26 112 8 168-34 47-35 88-58 132-56-52 30-86 66-134 100-46 33-104 39-166-10z"
        />
        <path
          fill="url(#mailstrive-wave-3)"
          d="M104 292c62 26 112 8 168-34 47-35 88-58 132-56-52 30-86 66-134 100-46 33-104 39-166-10z"
        />
        {/* Sparkles, mirroring the logo's four-point stars. */}
        <path fill="#28bcd8" d="M330 108c4 26 10 32 34 36-24 4-30 10-34 36-4-26-10-32-34-36 24-4 30-10 34-36z" />
        <path fill="#bcd427" d="M374 92c2 15 6 19 20 21-14 2-18 6-20 21-3-15-7-19-21-21 14-2 18-6 21-21z" />
        <path fill="#bcd427" d="M356 168c2 12 5 15 16 17-11 2-14 5-16 17-2-12-5-15-16-17 11-2 14-5 16-17z" />
      </g>
    </svg>
  );
}

/** Mark plus wordmark, used in the sidebar, mobile header and login screen. */
export function BrandLockup({
  size = 'md',
  onDark = false,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  /**
   * Set on the navy sidebar.
   *
   * The gradient wordmark ends in blue, which all but disappears against the
   * sidebar, so on dark the name is set in plain white -- the mark beside it
   * already carries the palette.
   */
  onDark?: boolean;
  className?: string;
}) {
  const mark = size === 'lg' ? 'h-11 w-11' : size === 'sm' ? 'h-7 w-7' : 'h-[34px] w-[34px]';
  const text = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-xs' : 'text-sm';

  if (onDark) {
    return (
      <span className={`inline-flex items-center gap-2.5 ${className}`}>
        <BrandMark className={mark} />
        <span className={`font-bold tracking-[-0.01em] text-white ${text}`}>MailStrive</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <BrandMark className={mark} />
      <span className={`brand-wordmark tracking-[-0.01em] ${text}`}>MailStrive</span>
    </span>
  );
}
