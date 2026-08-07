import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search, UserPlus, ShieldAlert, AlertCircle } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import {
  adminUserService,
  AdminUser,
  OFFICE_MODULES,
  ROLES,
} from '../../../services/adminUserService';

const humanize = (value: string | null): string =>
  value ? value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—';

const emptyForm = { email: '', password: '', role: 'municipal_staff', office: 'civil_registry', barangay: '' };

const AdminUsersPage: React.FC = () => {
  const { can } = usePermissions();
  const canRead = can('user_management', 'read');
  const canManage = can('user_management', 'manage');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await adminUserService.create({
        email: form.email,
        password: form.password,
        role: form.role,
        office: form.office,
        barangay: form.barangay || undefined,
      });
      setForm(emptyForm);
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account.');
    }
  };

  const handleRoleChange = async (user: AdminUser, role: string) => {
    setError(null);
    try {
      await adminUserService.update(user.id, { role });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account.');
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    setError(null);
    try {
      if (user.active) {
        await adminUserService.deactivate(user.id);
      } else {
        await adminUserService.activate(user.id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change account status.');
    }
  };

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-6 text-center">
        <ShieldAlert className="w-10 h-10 text-slate-400 mb-3" />
        <h1 className="text-lg font-bold text-slate-900">Access restricted</h1>
        <p className="text-sm text-slate-500 mt-1">You don't have permission to manage user accounts.</p>
        <Link to="/" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 mb-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Staff Accounts</h1>
          </div>
          {canManage && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold shadow-lg shadow-teal-600/30 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              New account
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {showCreate && canManage && (
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="email" required placeholder="Email" aria-label="Email"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <input
              type="password" required minLength={6} placeholder="Temporary password" aria-label="Password"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <select
              aria-label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
            </select>
            <select
              aria-label="Office" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {OFFICE_MODULES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}
            </select>
            <input
              type="text" placeholder="Barangay (for barangay staff)" aria-label="Barangay"
              value={form.barangay} onChange={(e) => setForm({ ...form, barangay: e.target.value })}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button type="submit" className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors">
              Create account
            </button>
          </form>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute w-4 h-4 text-slate-400 top-1/2 -translate-y-1/2 left-3" />
            <input
              type="text" placeholder="Search by email" aria-label="Search"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <select
            aria-label="Filter by office" value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
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
                <th className="px-4 py-3">Barangay</th>
                <th className="px-4 py-3">Status</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              )}
              {!isLoading && users.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No accounts found.</td></tr>
              )}
              {!isLoading && users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-medium text-slate-800">{user.email}</td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      <select
                        aria-label={`Role for ${user.email}`}
                        value={user.role}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        className="px-2 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                      </select>
                    ) : humanize(user.role)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{humanize(user.office)}</td>
                  <td className="px-4 py-3 text-slate-600">{user.barangay ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      user.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {user.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`text-xs font-semibold ${user.active ? 'text-red-600 hover:text-red-700' : 'text-teal-700 hover:text-teal-800'}`}
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
    </div>
  );
};

export default AdminUsersPage;
