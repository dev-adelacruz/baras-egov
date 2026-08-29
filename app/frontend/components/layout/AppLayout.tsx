import React, { useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '../../state/user/userSlice';
import { RootState } from '../../state/store';
import { usePermissions } from '../../hooks/usePermissions';
import BrandMark from '../ui/BrandMark';
import { useOverlay } from '../ui/useOverlay';
import {
  LayoutDashboard, User, Settings, LogOut, Bell,
  ChevronDown, Users, Menu, X,
} from 'lucide-react';

/**
 * The shell every signed-in page renders inside.
 *
 * This markup used to live inline in `pages/home/index.tsx`, which meant the
 * dashboard had a sidebar and every other authenticated page had none. Clicking
 * "Users" in the nav took you to a page with no nav and no way to sign out —
 * a dead end reachable from the shell itself.
 *
 * Same drift `AuthLayout` was extracted to fix, on the other side of the login.
 */

// `module` gates a nav item behind a permission; items without one are always
// shown. The server still enforces access independently (BRGY-38).
//
// Profile and Settings have no destination — they are two of the dead controls
// BRGY-112 covers. They are carried over unchanged rather than quietly dropped:
// deciding what they should do is that ticket's call, not this one's. Note that
// sharing the shell does spread them to a second page.
const navItems: Array<{
  label: string;
  icon: typeof LayoutDashboard;
  module?: string;
  to?: string;
}> = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Users', icon: Users, module: 'user_management', to: '/admin/users' },
  { label: 'Profile', icon: User },
  { label: 'Settings', icon: Settings, module: 'user_management' },
];

// Falls back to nothing, not to a role. This used to return 'Staff' for a null
// role, so an administrator whose user had not loaded was shown, in persistent
// chrome, as a member of staff — plausible enough that nobody questioned it
// (BRGY-143). An empty string is honest: we do not know yet.
const humanizeRole = (role: string | null): string =>
  role
    ? role.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : '';

interface AppLayoutProps {
  /**
   * The page's title. The layout renders it as the page's one `<h1>`, so pages
   * must not render their own — two `<h1>`s per page is the defect BRGY-123
   * just removed from the auth pages.
   */
  title: string;
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ title, children }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useSelector((state: RootState) => state.user.user);
  const { role, canAccessModule } = usePermissions();

  const visibleNavItems = navItems.filter((item) => !item.module || canAccessModule(item.module));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // The sidebar is a static rail at `lg` and an overlay below it, so it can't
  // wear a Dialog's chrome — but it needs every one of that primitive's
  // behaviours. `useOverlay` (BRGY-126) supplies them: focus moves in on open,
  // Tab is contained, Escape closes, focus returns to the menu button, and the
  // page behind stops scrolling. Before this it had none of them.
  useOverlay({ open: sidebarOpen, onClose: () => setSidebarOpen(false), panelRef: sidebarRef });

  const handleLogout = () => {
    dispatch(logoutUser() as any);
  };

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'U';

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

  // Close the mobile drawer on navigation — otherwise tapping a nav item leaves
  // the overlay covering the page you just asked for.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close it when the viewport crosses into `lg`, where the sidebar stops being
  // an overlay and becomes a static rail.
  //
  // Without this, opening the menu at 390px and resizing to 1440px (rotating a
  // tablet) left `sidebarOpen` true: the rail kept `role="dialog"` and
  // `aria-modal`, the body stayed `overflow: hidden`, and both the close button
  // and the scrim are `lg:hidden` — so the page could not be scrolled and had no
  // visible way out. Closing here resolves all four at once, which suppressing
  // the hook alone would not: the aria attributes derive from this state.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const sync = (e: MediaQueryList | MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
    };
    sync(desktop);
    desktop.addEventListener('change', sync);
    return () => desktop.removeEventListener('change', sync);
  }, []);

  return (
    // `min-h-dvh`, not `h-screen overflow-hidden`. 100vh excludes mobile browser
    // chrome, so the old shell clipped its own content on short viewports and
    // whenever the keyboard opened — BRGY-102's bug, which the dashboard never
    // got. Letting the page grow and scroll normally removes the clipping;
    // the sidebar stays put via `lg:sticky` instead of a fixed-height shell.
    <div className="flex min-h-dvh bg-slate-50">

      {/* Mobile scrim. `preventDefault` keeps mousedown's default focus change
          from undoing the focus restore — see the note in Overlay.tsx. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/50 z-20 lg:hidden backdrop-blur-[2px] animate-overlay-fade"
          onMouseDown={(e) => {
            e.preventDefault();
            setSidebarOpen(false);
          }}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      {/* `invisible` when closed, not just translated off-canvas. Sliding it to
          x=-256 leaves its six controls in the tab order while nothing is on
          screen — measured: a keyboard user hit Close/Dashboard/Users/Profile/
          Settings/Sign out at x=-244 before reaching the page. `visibility:
          hidden` removes descendants from the tab order; React 18 has no
          `inert` prop, so this is the version-safe way to do it. It also keeps
          the closed rail out of `useOverlay`'s focus trap.
          Cost: closing no longer animates out. Opening still slides in. */}
      <aside
        ref={sidebarRef}
        tabIndex={-1}
        // Only an overlay below `lg`. At `lg` it is a static rail, so it must
        // not claim to be a modal — `aria-modal` on a persistent sidebar would
        // tell a screen reader the rest of the page is inert when it isn't.
        role={sidebarOpen ? 'dialog' : undefined}
        aria-modal={sidebarOpen ? true : undefined}
        aria-label={sidebarOpen ? 'Main menu' : undefined}
        className={`
        fixed lg:sticky inset-y-0 lg:inset-y-auto lg:top-0 left-0 z-30 lg:h-dvh
        w-64 bg-slate-900 flex flex-col shrink-0 focus:outline-none
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen
          ? 'translate-x-0 visible'
          : '-translate-x-full invisible lg:translate-x-0 lg:visible'}
      `}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-700/50 shrink-0">
          <BrandMark onDark />
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
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
          {visibleNavItems.map(({ label, icon: Icon, to }) => {
            // Derived from the route, never hardcoded. It used to be a literal
            // `active: true` on Dashboard, so a shared sidebar would have
            // marked Dashboard current on every page including /admin/users.
            const active = to !== undefined && pathname === to;
            return (
              <button
                key={label}
                onClick={() => { if (to) navigate(to); }}
                aria-current={active ? 'page' : undefined}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors duration-150 text-left border-l-2 pl-2.5
                  ${active
                    ? 'bg-brand-600/15 text-brand-400 border-brand-500'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100 border-transparent'
                  }
                `}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
                {active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom user section */}
        <div className="p-3 border-t border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-300 truncate">{user?.email}</p>
              <p className="text-[10px] text-slate-500 font-medium">{humanizeRole(role)}</p>
            </div>
            {/* Was `opacity-0 group-hover:opacity-100` — focusable while fully
                transparent, so a keyboard user could land on a control they
                could not see. Same defect class as BRGY-93 and BRGY-96. */}
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
              className="p-1.5 rounded text-slate-400 hover:text-danger-400 hover:bg-slate-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 transition-colors"
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
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              {/* The page's only <h1>. Pages supply the text via `title` and
                  must not render a heading of their own. */}
              <h1 className="text-sm font-bold text-slate-900 leading-tight truncate">{title}</h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">{today}</p>
            </div>
            {/* BRGY-136 removed the barangay badge that sat here. It told a
                user which barangay's records they were looking at, which is
                only worth saying when it could have been a different one. */}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Notifications */}
            <button
              aria-label="Notifications"
              className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors duration-150"
            >
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-danger-500 rounded-full ring-2 ring-white" />
            </button>

            {/* User dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((prev) => !prev)}
                aria-expanded={dropdownOpen}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors duration-150"
              >
                <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {initials}
                </div>
                <span className="text-sm font-medium text-slate-700 max-w-35 truncate hidden sm:block">
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
                    {/* Two more of BRGY-112's dead controls — carried over as-is. */}
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
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50 transition-colors"
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

        {/* Content. One measure for every page — the dashboard used to run full
            width while /admin/users capped itself at 1024px, so the two pages
            had different geometry in the same session. */}
        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
