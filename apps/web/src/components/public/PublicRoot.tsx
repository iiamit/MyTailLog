/** The v2 root for public pages: Direction D tokens and type in light, the skip link, normal page scrolling. */
export function PublicRoot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-ui="v2" data-theme="light" className={`public-v2 min-h-dvh bg-cover text-ink ${className}`}>
      <a href="#main-content" className="sr-only rounded-control bg-leaf px-4 py-3 font-bold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
        Skip to content
      </a>
      {children}
    </div>
  );
}
