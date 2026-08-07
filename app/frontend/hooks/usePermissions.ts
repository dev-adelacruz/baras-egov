import { useSelector } from 'react-redux';
import { RootState } from '../state/store';

// Central hook for role-aware rendering. Reads the permission map and scope
// loaded from /api/v1/me. UI hiding here is a convenience, never the security
// boundary — the server enforces every action independently (BRGY-38).
export const usePermissions = () => {
  const permissions = useSelector((state: RootState) => state.user.permissions);
  const role = useSelector((state: RootState) => state.user.user?.role ?? null);
  const dataScope = useSelector((state: RootState) => state.user.dataScope);

  const can = (module: string, action: string = 'read'): boolean =>
    (permissions[module] ?? []).includes(action);

  const canAccessModule = (module: string): boolean =>
    (permissions[module] ?? []).length > 0;

  const accessibleModules = Object.keys(permissions);

  const barangay =
    dataScope && typeof dataScope === 'object' ? dataScope.barangay : null;
  const isBarangayScoped = barangay !== null;

  return { can, canAccessModule, accessibleModules, role, dataScope, barangay, isBarangayScoped };
};
