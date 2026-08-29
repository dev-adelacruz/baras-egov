interface UserState {
  isSignedIn: boolean;
  token: string | null;
  user: {
    id: number | null;
    email: string | null;
    role?: string | null;
    office?: string | null;
  } | null;
  // Permission map from /api/v1/me: { module => [actions] }.
  permissions: Record<string, string[]>;
  isLoading: boolean;
  error: string | null;
  // Why the last sign-in failed. Devise answers 401 for a wrong password, the
  // final-attempt warning and a locked account alike, so the UI needs this to
  // present them differently (BRGY-106).
  errorKind: import('../../services/authService').LoginFailureKind | null;
}
