import { useSelector } from 'react-redux';
import { RootState } from '../state/store';

// Central hook for role-aware rendering. Reads the permission map loaded from
// /api/v1/me. UI hiding here is a convenience, never the security boundary —
// the server enforces every action independently (BRGY-38).
//
// BRGY-136 removed `dataScope`, `barangay` and `isBarangayScoped`. They existed
// to narrow one barangay's view against another's inside a shared database;
// each deployment has its own.
export const usePermissions = () => {
  const permissions = useSelector((state: RootState) => state.user.permissions);
  const role = useSelector((state: RootState) => state.user.user?.role ?? null);

  const can = (module: string, action: string = 'read'): boolean =>
    (permissions[module] ?? []).includes(action);

  const canAccessModule = (module: string): boolean =>
    (permissions[module] ?? []).length > 0;

  const accessibleModules = Object.keys(permissions);

  return { can, canAccessModule, accessibleModules, role };
};
