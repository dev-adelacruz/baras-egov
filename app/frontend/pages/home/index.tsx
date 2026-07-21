import React, { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../../state/user/userSlice';
import { RootState } from '../../state/store';
import {
  LayoutDashboard, User, Settings, LogOut, Bell,
  ChevronDown, Zap, TrendingUp, Users, ShoppingCart,
  DollarSign, ArrowUpRight, ArrowDownRight, Menu, X,
  ArrowRight, UserPlus, BarChart2, ShieldCheck, Key,
} from 'lucide-react';

// ─── Data ───────────────────────────────────────────────────────────────────

const statCards = [
  { label: 'Total Revenue', value: '$48,295', change: '+12.5%', up: true, icon: DollarSign },
  { label: 'Active Users', value: '3,842', change: '+8.1%', up: true, icon: Users },
  { label: 'New Orders', value: '1,209', change: '-3.2%', up: false, icon: ShoppingCart },
  { label: 'Growth Rate', value: '24.6%', change: '+4.9%', up: true, icon: TrendingUp },
];

const activities = [
  {
    title: 'New user registered',
    desc: 'sarah.chen@company.com joined the platform',
    time: '2m ago',
    icon: UserPlus,
  },
  {
    title: 'Order #1042 completed',
    desc: '$299 — Pro plan annual subscription',
    time: '47m ago',
    icon: ShoppingCart,
  },
  {
    title: 'Monthly report ready',
    desc: 'March 2026 analytics report generated',
    time: '2h ago',
    icon: BarChart2,
  },
  {
    title: 'System backup succeeded',
    desc: 'All 12 databases backed up successfully',
    time: '3h ago',
    icon: ShieldCheck,
  },
  {
    title: 'New API key created',
    desc: 'Production environment — expires in 90 days',
    time: '5h ago',
    icon: Key,
  },
];

const performanceMetrics = [
  { label: 'Conversion Rate', pct: 68 },
  { label: 'User Retention', pct: 84 },
  { label: 'Goal Completion', pct: 52 },
  { label: 'Revenue Target', pct: 79 },
];

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Users', icon: Users, active: false },
  { label: 'Profile', icon: User, active: false },
  { label: 'Settings', icon: Settings, active: false },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

const StatCard: React.FC<typeof statCards[0]> = ({
  label, value, change, up, icon: Icon,
}) => (
  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-200 cursor-default">
    <div className="flex items-start justify-between">
      <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-teal-600" />
      </div>
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full ${
        up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}>
        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {change}
      </span>
    </div>
    <div className="mt-4">
      <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
      <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">{label}</p>
    </div>
    <div className="mt-4 h-1 w-full rounded-full bg-teal-500/80" />
  </div>
);

// ─── Main component ──────────────────────────────────────────────────────────

const HomePage: React.FC = () => {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.user.user);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    dispatch(logoutUser() as any);
  };

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'U';

  const firstName = user?.email?.split('@')[0] ?? 'there';

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-64 bg-slate-900 flex flex-col shrink-0
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-600 flex items-center justify-center shadow-lg shadow-teal-900/60">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-base tracking-tight">AppName</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav label */}
        <div className="px-5 pt-5 pb-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.12em]">Main Menu</p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors duration-150 text-left
                ${active
                  ? 'bg-teal-600/15 text-teal-400 border-l-2 border-teal-500 pl-[10px]'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100 border-l-2 border-transparent pl-[10px]'
                }
              `}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400" />
              )}
            </button>
          ))}
        </nav>

        {/* Bottom user section */}
        <div className="p-3 border-t border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors group">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-300 truncate">{user?.email}</p>
              <p className="text-[10px] text-slate-500 font-medium">Administrator</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-1 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-tight">Dashboard</h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">{today}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors duration-150">
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-2 ring-white" />
            </button>

            {/* User dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((prev) => !prev)}
                aria-expanded={dropdownOpen}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors duration-150"
              >
                <div className="w-7 h-7 rounded-lg bg-teal-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {initials}
                </div>
                <span className="text-sm font-medium text-slate-700 max-w-[140px] truncate hidden sm:block">
                  {user?.email}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-900/10 overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Signed in as</p>
                    <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      Profile
                    </button>
                    <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                      <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                      Settings
                    </button>
                  </div>
                  <div className="border-t border-slate-100 py-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">

          {/* Welcome banner */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-900">
            <div className="absolute inset-0 pointer-events-none">
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />
            </div>
            <div className="relative z-10 px-6 py-6 lg:px-8 lg:py-7">
              <p className="text-teal-400 text-xs font-semibold uppercase tracking-widest mb-1">Overview</p>
              <h2 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
                Good {timeOfDay}, <span className="text-teal-300">{firstName}</span>
              </h2>
              <p className="text-slate-400 text-sm mt-1.5 max-w-md">
                Your platform is running smoothly. Here's a summary of today's activity.
              </p>
              <button className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-all duration-150 shadow-lg shadow-teal-900/40 group">
                View full report
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-150" />
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>

          {/* Bottom row: Activity + Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Recent Activity (2/3) */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Recent Activity</h3>
                <button className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors group">
                  View all
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
              <div className="divide-y divide-slate-50">
                {activities.map((a, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/70 transition-colors">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <a.icon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{a.title}</p>
                      <p className="text-xs text-slate-500 truncate">{a.desc}</p>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{a.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Metrics (1/3) */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">Performance</h3>
                <p className="text-xs text-slate-500 mt-0.5">vs. previous month</p>
              </div>
              <div className="p-6 space-y-5">
                {performanceMetrics.map((m) => (
                  <div key={m.label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-600">{m.label}</span>
                      <span className="text-xs font-bold text-slate-800">{m.pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
};

export default HomePage;
