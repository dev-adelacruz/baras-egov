import React, { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import Dialog from '../ui/Dialog';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { AdminUser, ROLES } from '../../services/adminUserService';

/**
 * Change-role, as a deliberate act rather than an inline `onChange` (BRGY-119).
 *
 * The Role column used to render a native `<select>` in every row, which meant
 * granting Admin was a single unconfirmed change event — and forty of them
 * stacked vertically turned a data table into a form. Editing now lives behind
 * the row menu, and picking and confirming happen in one place so the new role
 * is named in the same breath as the person it applies to.
 */

const humanize = (value: string): string =>
  value.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export interface RoleDialogProps {
  user: AdminUser;
  onClose: () => void;
  onConfirm: (role: string) => void;
  isConfirming?: boolean;
}

const RoleDialog: React.FC<RoleDialogProps> = ({ user, onClose, onConfirm, isConfirming = false }) => {
  const [role, setRole] = useState(user.role);

  // A role the app no longer offers still has to render, or the control would
  // silently show the wrong value and "cancel" would change it. Retired roles
  // are appended rather than hidden — BRGY-136 merged two roles away, and an
  // account created before that migration is exactly this case.
  const options = useMemo(
    () => (ROLES.includes(user.role) ? ROLES : [...ROLES, user.role]),
    [user.role]
  );

  const unchanged = role === user.role;
  const escalating = role === 'admin' && user.role !== 'admin';

  return (
    <Dialog
      open
      onClose={onClose}
      title="Change role"
      size="compact"
      testId="role-dialog"
      footer={
        <>
          <Button variant="secondary" fullWidth={false} onClick={onClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            fullWidth={false}
            onClick={() => onConfirm(role)}
            disabled={unchanged}
            isLoading={isConfirming}
            loadingLabel="Working…"
          >
            Change role
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-900">{user.email}</span> is currently{' '}
          {humanize(user.role)}. Their access changes as soon as you confirm.
        </p>

        <Select
          label="New role"
          id="role-dialog-role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={isConfirming}
          data-autofocus
        >
          {options.map((r) => (
            <option key={r} value={r}>
              {humanize(r)}
            </option>
          ))}
        </Select>

        {escalating && (
          // Named explicitly rather than left for the admin to infer. This is
          // the only change on this page that hands someone the ability to
          // deactivate the person making it.
          <div
            role="status"
            data-testid="role-escalation-warning"
            className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-warning-50 border border-warning-200 text-warning-800"
          >
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-sm font-medium">
              Administrators can create, deactivate and change the role of every account —
              including yours.
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default RoleDialog;
