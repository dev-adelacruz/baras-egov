type DataScope = 'all' | { barangay: string } | null;

interface UserState {
  isSignedIn: boolean;
  token: string | null;
  user: {
    id: number | null;
    email: string | null;
    role?: string | null;
    office?: string | null;
    barangay?: string | null;
  } | null;
  // Permission map from /api/v1/me: { module => [actions] }.
  permissions: Record<string, string[]>;
  // Data scope: 'all' for municipality-wide users, { barangay } for barangay staff.
  dataScope: DataScope;
  isLoading: boolean;
  error: string | null;
}
