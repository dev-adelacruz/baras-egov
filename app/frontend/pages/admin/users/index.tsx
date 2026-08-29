import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, UserPlus, ShieldAlert, AlertCircle } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import AppLayout from '../../../components/layout/AppLayout';
import CreateAccountDialog from '../../../components/admin/CreateAccountDialog';
import { ConfirmDialog } from '../../../components/ui/Dialog';
import { TEXT_LINK } from '../../../components/ui/linkStyles';
import {
  adminUserService,
  AdminUser,
  OFFICE_MODULES,
  ROLES,
} from '../../../services/adminUserService';

const humanize = (value: string | null): string =>
  value ? value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—';

/**
 * A destructive change waiting on confirmation (BRGY-127). Held as one value
 * rather than a flag per action, so the dialog can only ever describe the thing
 * that is actually about to happen.
 */
type PendingAction =
  | { kind: 'toggle'; user: AdminUser }
  | { kind: 'role'; user: AdminUser; role: string };

const AdminUsersPage: React.FC = () => {
  const { can, userId } = usePermissions();
  const canRead = can('user_management', 'read');
  const canManage = can('user_management', 'manage');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setUsers(await adminUserService.list({ search: search || undefined, office: officeFilter || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts.');
    } finally {
      setIsLoading(false);
    }
  }, [search, officeFilter]);

  useEffect(() => {
    if (canRead) {
      load();
    }
  }, [load, canRead]);

  // The dialog owns submission and its own error surface — it keeps itself open
  // on success to show the temporary password once. All the page does is
  // refresh the list underneath.
  const handleCreated = useCallback(() => {
    load();
  }, [load]);

  // Note this is the *loaded* list, so it narrows when a search or office
  // filter is active — a duplicate outside the current filter won't be caught
  // here. That is what the server rejection is for; this only spares the admin
  // a round-trip for the case they can already see on screen.
  const existingEmails = useMemo(() => users.map((u) => u.email), [users]);

  // Both destructive actions go through the same confirm step (BRGY-127). The
  // <select> is left uncontrolled-looking on purpose: `value` stays bound to
  // `user.role`, so cancelling re-renders the old value straight back in.
  const confirmPending = async () => {
    if (!pending) return;
    setError(null);
    setIsConfirming(true);
    try {
      if (pending.kind === 'role') {
        await adminUserService.update(pending.user.id, { role: pending.role });
      } else if (pending.user.active) {
        await adminUserService.deactivate(pending.user.id);
      } else {
        await adminUserService.activate(pending.user.id);
      }
      setPending(null);
      await load();
    } catch (err) {
      // The server's sentence, not a generic one. On a refused lockout that
      // message *is* the recovery instruction — "make another account an
      // administrator first" — so replacing it with "Failed to update account"
      // would throw away the only thing the admin can act on.
      const message = err instanceof Error ? err.message : 'Failed to update account.';
      setPending(null);
      // Reload first, then set the message. `load` clears the banner on entry,
      // so setting it beforehand would be wiped by the very refresh that puts
      // the row back to what the server actually holds.
      await load();
      setError(message);
    } finally {
      setIsConfirming(false);
    }
  };

  // Copy for the confirmation. Each branch names the person and the
  // consequence, because "Are you sure?" tells an admin nothing they did not
  // already know when they clicked.
  const confirmCopy = (action: PendingAction) => {
    if (action.kind === 'role') {
      return {
        title: 'Change role',
        description: `${action.user.email} will become ${humanize(action.role)}. Their access changes immediately.`,
        confirmLabel: 'Change role',
        tone: 'default' as const,
      };
    }
    return action.user.active
      ? {
          title: 'Deactivate account',
          description: `${action.user.email} will no longer be able to sign in.`,
          confirmLabel: 'Deactivate account',
          tone: 'danger' as const,
        }
      : {
          title: 'Reactivate account',
          description: `${action.user.email} will be able to sign in again.`,
          confirmLabel: 'Reactivate account',
          tone: 'default' as const,
        };
  };

  if (!canRead) {
    // Rendered inside the shell too, so someone who lands here by URL keeps the
    // nav and a way to sign out instead of hitting a dead end. The layout owns
    // the <h1>; this branch supplies its text via `title`.
    return (
      <AppLayout title="Access restricted">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldAlert className="w-10 h-10 text-slate-400 mb-3" />
          <p className="text-sm text-slate-500">You don't have permission to manage user accounts.</p>
          <Link to="/" className={`mt-4 inline-flex items-center gap-2 text-sm py-1.5 ${TEXT_LINK}`}>
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    // No page chrome of its own: no min-h-screen, no max-w cap, no back-link and
    // no <h1>. The shell supplies all four, and the sidebar's "Dashboard" item
    // replaces the 12px text link that used to be the only route back.
    <AppLayout title="Staff Accounts">
      <div className="space-y-6">
        <div className="flex items-center justify-end flex-wrap gap-3">
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-slate-900 text-sm font-semibold shadow-lg shadow-brand-600/30 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              New account
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {canManage && (
          <CreateAccountDialog
            open={showCreate}
            onClose={() => setShowCreate(false)}
            existingEmails={existingEmails}
            onCreated={handleCreated}
          />
        )}

        {pending && (
          <ConfirmDialog
            open
            onClose={() => setPending(null)}
            onConfirm={confirmPending}
            isConfirming={isConfirming}
            testId="admin-users-confirm"
            {...confirmCopy(pending)}
          />
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2 left-3" />
            <input
              type="text" placeholder="Search by email" aria-label="Search"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <select
            aria-label="Filter by office" value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">All offices</option>
            {OFFICE_MODULES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Office</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              )}
              {!isLoading && users.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No accounts found.</td></tr>
              )}
              {!isLoading && users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-800">{user.email}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        aria-label={`Role for ${user.email}`}
                        value={user.role}
                        onChange={(e) => setPending({ kind: 'role', user, role: e.target.value })}
                        className="px-2 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                      </select>
                    ) : humanize(user.role)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{humanize(user.office)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      user.active ? 'bg-accent-50 text-accent-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {user.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  {canManage && user.id === userId && (
                    // BRGY-127: no control at all on your own row, rather than a
                    // disabled one with a tooltip. A disabled button still reads
                    // as "this is something you do here"; the server refuses it
                    // regardless, so the honest UI is to not offer it.
                    <td className="px-4 py-3 text-right text-xs text-slate-400">This is you</td>
                  )}
                  {canManage && user.id !== userId && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setPending({ kind: 'toggle', user })}
                        // Activate/Deactivate sat at danger-600 vs brand-700 — two
                        // adjacent actions 11 degrees of hue apart. Green/red instead.
                        className={`text-xs font-semibold underline underline-offset-2 ${user.active ? 'text-danger-600 hover:text-danger-700' : 'text-accent-700 hover:text-accent-800'}`}
                      >
                        {user.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
};

export default AdminUsersPage;
