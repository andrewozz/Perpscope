import { useLocation } from 'react-router-dom';

const titles: Record<string, string> = {
  '/': 'Dashboard / DEX Comparison',
  '/scanner': 'Scanner / Funding Arbitrage',
  '/engine': 'Engine / Market Regime',
};

export default function Topbar() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PerpScope';

  return (
    <header className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950 px-6 py-4">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path
            d="M2 7.5 7.5 2l5.5 5.5M4 6v6.5h7V6"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{title}</span>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-slate-200"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M3 12h10l-1.2-1.6V7a3.8 3.8 0 0 0-7.6 0v3.4L3 12Z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </button>

        <button
          type="button"
          className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-slate-300 hover:text-slate-100"
        >
          Login
        </button>
        <button
          type="button"
          className="rounded-lg bg-emerald-400 px-3.5 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
        >
          Sign up
        </button>
      </div>
    </header>
  );
}
