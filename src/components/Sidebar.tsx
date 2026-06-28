import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', icon: GridIcon },
  { to: '/scanner', label: 'Arb Scanner', icon: ScanIcon },
  { to: '/engine', label: 'Regime Engine', icon: PulseIcon },
];

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <rect x="10" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="9" cy="9" r="0.9" fill="currentColor" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M2 9.5h3l1.5-4 2.5 7 2-5.5 1.5 2.5H16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-800/80 bg-slate-950">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none" className="shrink-0">
          <circle cx="16" cy="16" r="14.5" stroke="#34d399" strokeWidth="1.5" opacity="0.35" />
          <circle cx="16" cy="16" r="9.5" stroke="#34d399" strokeWidth="1.5" opacity="0.6" />
          <line x1="16" y1="16" x2="24" y2="8" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="16" cy="16" r="2.5" fill="#34d399" />
        </svg>
        <span className="text-xl font-bold tracking-tight">
          <span className="text-slate-100">Perp</span>
          <span className="text-emerald-400">Scope</span>
        </span>
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-slate-500">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="10" y1="10" x2="13" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-transparent text-sm text-slate-300 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
      </div>

      <p className="px-5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Menu
      </p>
      <nav className="flex flex-col gap-1 px-3">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-400/10 text-emerald-400'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-slate-800/80 px-3 py-4 text-sm text-slate-500">
        <a href="#" className="rounded-lg px-3 py-2 hover:bg-slate-900 hover:text-slate-300">
          Documentation
        </a>
        <a href="#" className="rounded-lg px-3 py-2 hover:bg-slate-900 hover:text-slate-300">
          Need help?
        </a>
      </div>
    </aside>
  );
}
