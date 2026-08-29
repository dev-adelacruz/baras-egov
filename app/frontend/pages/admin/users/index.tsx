import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Search, UserPlus, ShieldAlert, AlertCircle, CheckCircle2, RotateCcw, X,
  UserCog, UserMinus, UserCheck,
} from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import AppLayout from '../../../components/layout/AppLayout';
import CreateAccountDialog from '../../../components/admin/CreateAccountDialog';
import RoleDialog from '../../../components/admin/RoleDialog';
import { ConfirmDialog } from '../../../components/ui/Dialog';
import Menu from '../../../components/ui/Menu';
import Select from '../../../components/ui/Select';
import { TEXT_LINK } from '../../../components/ui/linkStyles';
import {
  adminUserService,
  AdminUser,
  OFFICE_MODULES,
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
  // BRGY-119: the role travels with the dialog, not with the pending action.
  // It used to be captured from a `<select>`'s change event before anything was
  // confirmed, which is what made granting Admin a single unconfirmed keystroke.
  | { kind: 'role'; user: AdminUser };

/**
 * A success confirmation (BRGY-132). `id` exists so a repeat of an identical
 * sentence still remounts the live region — deactivating two accounts in a row
 * produces two different strings, but an undo followed by the same action again
 * does not, and a live region whose text has not changed announces nothing.
 */
type Notice = {
  id: number;
  message: string;
  /** Present only while the action is still reversible. */
  undo?: () => Promise<void>;
};

// How long the Undo affordance stays on offer. Long enough to notice a misclick
// and act, short enough that the button is never a way to reverse something the
// admin has stopped thinking about — a stale Undo is its own hazard.
const UNDO_WINDOW_MS = 15_000;

// The row tint after a change. Long enough to find the row on a 40-account
// list, short enough not to read as a persistent state on the account.
const HIGHLIGHT_MS = 2_500;

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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const noticeSeq = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    []
  );

  // Returns the rows it loaded, so a caller that has just mutated an account can
  // tell whether that account is in the list the admin is actually looking at.
  // `null` means the load itself failed — distinct from "loaded, and it is not
  // there", which is a real answer the confirmation needs to report.
  const load = useCallback(async (): Promise<AdminUser[] | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const fresh = await adminUserService.list({
        search: search || undefined,
        office: officeFilter || undefined,
      });
      setUsers(fresh);
      return fresh;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts.');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [search, officeFilter]);

  useEffect(() => {
    if (canRead) {
      load();
    }
  }, [load, canRead]);

  // Raise a success confirmation. Replaces whatever was there — an admin acting
  // twice in a row should see the second outcome, not a queue of the first.
  const announce = useCallback((message: string, undo?: () => Promise<void>) => {
    noticeSeq.current += 1;
    setNotice({ id: noticeSeq.current, message, undo });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (!undo) return;
    undoTimer.current = setTimeout(() => {
      // Retire the affordance, keep the sentence. The record of what happened
      // is still useful after the window in which reversing it is sensible.
      setNotice((prev) => (prev?.undo ? { ...prev, undo: undefined } : prev));
    }, UNDO_WINDOW_MS);
  }, []);

  const highlight = useCallback((id: number) => {
    setHighlightId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  }, []);

  // Bring the changed row into view if it is off-screen. Runs off `users` too:
  // the highlight is set before the reloaded list has painted, so on create the
  // row does not exist yet at the moment the id is recorded.
  useEffect(() => {
    if (highlightId === null) return;
    const row = rowRefs.current[highlightId];
    if (!row) return;
    const { top, bottom } = row.getBoundingClientRect();
    if (top >= 0 && bottom <= window.innerHeight) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Optional-called: jsdom does not implement scrollIntoView, and a missing
    // scroll is not worth failing a render over.
    row.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [highlightId, users]);

  /**
   * Refresh, then confirm — in that order, because the confirmation reports
   * whether the account is visible and that is only knowable after the reload.
   *
   * A filtered list is the case worth handling: change someone's role while a
   * search is active and they may drop out of the result set, so the page shows
   * nothing happening. Saying so beats a silent no-op.
   */
  const afterMutation = useCallback(
    async (user: AdminUser, message: string, undo?: () => Promise<void>) => {
      const fresh = await load();
      const visible = fresh === null || fresh.some((u) => u.id === user.id);
      announce(
        visible
          ? message
          : `${message} It is not shown below — the current search or office filter excludes it.`,
        undo
      );
      if (visible) highlight(user.id);
    },
    [load, announce, highlight]
  );

  // The dialog owns submission and its own error surface — it keeps itself open
  // on success to show the temporary password once. All the page does is
  // refresh the list underneath and point at the new row, which on a 40-account
  // roster lands in alphabetical position and is otherwise easy to miss.
  const handleCreated = useCallback(
    (user: AdminUser) => {
      afterMutation(user, `Created ${user.email}.`);
    },
    [afterMutation]
  );

  // Note this is the *loaded* list, so it narrows when a search or office
  // filter is active — a duplicate outside the current filter won't be caught
  // here. That is what the server rejection is for; this only spares the admin
  // a round-trip for the case they can already see on screen.
  const existingEmails = useMemo(() => users.map((u) => u.email), [users]);

  // Deactivate, reactivate and the undo of either are the same call with the
  // flag flipped, so one function covers all three.
  const applyToggle = useCallback(
    (user: AdminUser, makeActive: boolean): Promise<AdminUser> =>
      makeActive ? adminUserService.activate(user.id) : adminUserService.deactivate(user.id),
    []
  );

  const undoToggle = useCallback(
    (user: AdminUser, restoreActive: boolean) => async () => {
      setError(null);
      try {
        const updated = await applyToggle(user, restoreActive);
        await afterMutation(
          updated ?? user,
          restoreActive ? `${user.email} can sign in again.` : `${user.email} is deactivated again.`
        );
      } catch (err) {
        // Undo is not guaranteed to be allowed: reversing a reactivation is a
        // deactivation, which the server refuses if it would empty the last
        // admin seat. Same treatment as any other refusal.
        const message = err instanceof Error ? err.message : 'Could not undo that change.';
        setNotice(null);
        await load();
        setError(message);
      }
    },
    [applyToggle, afterMutation, load]
  );

  const runUndo = async () => {
    if (!notice?.undo || isUndoing) return;
    setIsUndoing(true);
    try {
      await notice.undo();
    } finally {
      setIsUndoing(false);
    }
  };

  // Every mutation shares one failure path (BRGY-127): the server's sentence
  // reaches the banner verbatim, and the list is reloaded before it is set.
  const runMutation = async (mutate: () => Promise<void>) => {
    setError(null);
    // Drop any prior confirmation up front, so a failure never renders beneath
    // a success sentence describing a different account.
    setNotice(null);
    setIsConfirming(true);
    try {
      await mutate();
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

  const confirmRole = (user: AdminUser) => (role: string) =>
    runMutation(async () => {
      const updated = await adminUserService.update(user.id, { role });
      setPending(null);
      await afterMutation(
        updated ?? user,
        // "now has the X role", not "is now a X" — the roles are Admin, Staff
        // and Department Head, which need "an", nothing, and "a" respectively.
        // Naming the role as a role sidesteps the article and is the only
        // phrasing that stays correct if a fourth role is ever added.
        `${user.email} now has the ${humanize(role)} role.`
      );
    });

  const confirmToggle = (user: AdminUser) => () =>
    runMutation(async () => {
      const makeActive = !user.active;
      const updated = await applyToggle(user, makeActive);
      setPending(null);
      await afterMutation(
        updated ?? user,
        makeActive
          ? `Reactivated ${user.email}. They can sign in again.`
          : `Deactivated ${user.email}. They can no longer sign in.`,
        // Only the reversible action offers it. A role change is reversible
        // too, but it is not a misclick in the way a row action is — it was
        // chosen from a list and then confirmed by name.
        undoToggle(user, !makeActive)
      );
    });

  // Copy for the deactivate/reactivate confirmation. It names the person and
  // the consequence, because "Are you sure?" tells an admin nothing they did
  // not already know when they clicked. The role change has its own dialog
  // (BRGY-119) because it has to offer a choice as well as confirm one.
  const confirmCopy = (action: { user: AdminUser }) =>
    action.user.active
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

        {notice && (
          // status, not alert — matches the post-password-reset notice on
          // /login. A success confirmation should wait for a pause in speech
          // rather than interrupt. Keyed so that repeating an action verbatim
          // still re-announces; a live region whose text is unchanged is silent.
          <div
            key={notice.id}
            role="status"
            data-testid="admin-users-notice"
            className="flex items-start gap-3 px-4 py-3 rounded-xl bg-info-50 border border-info-200 text-info-700"
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm font-medium">{notice.message}</p>
            {notice.undo && (
              <button
                onClick={runUndo}
                disabled={isUndoing}
                className="inline-flex items-center gap-1.5 shrink-0 px-2 py-1 -my-1 rounded-lg text-sm font-semibold underline underline-offset-2 hover:bg-info-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-500 disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                {isUndoing ? 'Undoing…' : 'Undo'}
              </button>
            )}
            <button
              onClick={() => setNotice(null)}
              aria-label="Dismiss confirmation"
              className="shrink-0 p-1 -my-1 -mr-1 rounded-lg hover:bg-info-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-500 transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}

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

        {pending?.kind === 'toggle' && (
          <ConfirmDialog
            open
            onClose={() => setPending(null)}
            onConfirm={confirmToggle(pending.user)}
            isConfirming={isConfirming}
            testId="admin-users-confirm"
            {...confirmCopy(pending)}
          />
        )}

        {pending?.kind === 'role' && (
          <RoleDialog
            user={pending.user}
            onClose={() => setPending(null)}
            onConfirm={confirmRole(pending.user)}
            isConfirming={isConfirming}
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
          {/* BRGY-119 AC4/AC5: the last raw <select> on the page. It now shares
              Input's geometry like every other field. `srOnlyLabel` keeps the
              real <label> — and the accessible name — without adding a second
              line to a filter bar where "All offices" already says what it is. */}
          <Select
            label="Office"
            srOnlyLabel
            id="admin-users-office-filter"
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className="min-w-44"
          >
            <option value="">All offices</option>
            {OFFICE_MODULES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
          </Select>
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
                <tr
                  key={user.id}
                  ref={(el) => {
                    rowRefs.current[user.id] = el;
                  }}
                  data-testid={`user-row-${user.id}`}
                  // Stated as data rather than left implicit in a class name, so
                  // "this row just changed" is assertable without a test having
                  // to know which Tailwind token paints it.
                  data-recently-changed={highlightId === user.id ? 'true' : undefined}
                  // The tint fades out rather than snapping, so a row that is
                  // already on screen still reads as "this one just changed"
                  // without a flash. `motion-safe` because a colour transition
                  // is exactly what reduced-motion users have asked to skip.
                  className={`motion-safe:transition-colors motion-safe:duration-700 ${
                    highlightId === user.id ? 'bg-brand-50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-800">{user.email}</td>
                  {/* Text, not a control (BRGY-119). Editing lives in the row
                      menu; a cell that is always editable makes granting Admin
                      an unconfirmed change event, and forty stacked selects
                      turn a table you scan into a form you fill. */}
                  <td className="px-4 py-2.5 text-slate-600">{humanize(user.role)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{humanize(user.office)}</td>
                  <td className="px-4 py-2.5">
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
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">This is you</td>
                  )}
                  {canManage && user.id !== userId && (
                    // py-1, not py-2.5: the 36px trigger is the tallest thing in
                    // any row, so this cell alone decides row height. At py-2.5
                    // the rows came out at 57px — taller than the 54px the
                    // selects produced, which would have missed BRGY-119 AC3
                    // while appearing to satisfy it.
                    <td className="px-4 py-1">
                      {/* BRGY-120: one neutral trigger per row. The destructive
                          verb and its colour live inside the opened panel, so
                          the resting table carries no danger red at all. */}
                      <div className="flex justify-end">
                        <Menu
                          label={`Actions for ${user.email}`}
                          testId={`user-menu-${user.id}`}
                          items={[
                            {
                              label: 'Change role…',
                              icon: <UserCog className="w-4 h-4" aria-hidden="true" />,
                              onSelect: () => setPending({ kind: 'role', user }),
                            },
                            user.active
                              ? {
                                  label: 'Deactivate account',
                                  tone: 'danger' as const,
                                  icon: <UserMinus className="w-4 h-4" aria-hidden="true" />,
                                  onSelect: () => setPending({ kind: 'toggle', user }),
                                }
                              : {
                                  // Reactivate is not destructive, so it does not
                                  // wear the danger treatment (BRGY-120 AC5).
                                  label: 'Reactivate account',
                                  icon: <UserCheck className="w-4 h-4" aria-hidden="true" />,
                                  onSelect: () => setPending({ kind: 'toggle', user }),
                                },
                          ]}
                        />
                      </div>
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
