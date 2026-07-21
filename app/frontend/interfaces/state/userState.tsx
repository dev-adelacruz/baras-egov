interface UserState {
  isSignedIn: boolean;
  token: string | null;
  user: {
    id: number | null;
    email: string | null;
  } | null;
  isLoading: boolean;
  error: string | null;
}
