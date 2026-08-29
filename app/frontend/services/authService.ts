// Authentication service for handling API calls
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    email: string;
    // Add other user fields as needed
  };
  expires_in?: number;
}

export interface ApiError {
  message: string;
  status?: number;
}

/**
 * Why a sign-in failed, in terms the UI can present differently.
 *
 * Devise returns 401 for a wrong password, for the final-attempt warning and
 * for a locked account alike, so the status code alone cannot tell them apart.
 * See classifyLoginFailure.
 */
export type LoginFailureKind =
  | 'invalid'
  | 'last-attempt'
  | 'locked'
  | 'forbidden'
  | 'rate-limited'
  | 'server'
  | 'network'
  | 'unknown';

// Error carrying copy that is safe to render directly to the user. Raw HTTP
// statuses and server-supplied strings never reach the UI — every failure is
// translated here, at the service boundary. `kind` lets the UI vary the
// treatment without re-deriving meaning from the copy.
export class AuthError extends Error {
  readonly status?: number;
  readonly kind: LoginFailureKind;

  constructor(message: string, kind: LoginFailureKind = 'unknown', status?: number) {
    super(message);
    this.name = 'AuthError';
    this.kind = kind;
    this.status = status;
  }
}

const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";

const LOGIN_FAILURE_MESSAGES: Record<LoginFailureKind, string> = {
  // Identical copy for a wrong password and a malformed request, so neither
  // reveals whether the email exists.
  invalid: 'Incorrect email or password.',
  // The most useful state of the three: the last moment the user can still
  // avoid being locked out for an hour.
  'last-attempt':
    'Incorrect email or password. One more failed attempt will lock this account.',
  // No unlock duration stated — the API does not expose `unlock_in`, and
  // guessing it is exactly the kind of invented detail this codebase keeps
  // removing. Surfacing the real window needs a backend change.
  locked:
    'This account is locked after too many failed sign-in attempts. Wait for it to unlock automatically, or ask your administrator to unlock it now.',
  forbidden: 'This account does not have access to the console. Contact your administrator.',
  'rate-limited': 'Too many sign-in attempts. Wait a moment and try again.',
  server: 'Something went wrong on our end. Try again shortly.',
  network: NETWORK_ERROR_MESSAGE,
  unknown: 'Could not sign you in. Try again, or contact your administrator.',
};

// Devise's lockable messages. Captured from the running API — eleven attempts
// against a seed account with maximum_attempts = 10:
//
//   1–8   401  "Invalid email or password."
//   9     401  "You have one more attempt before your account is locked."
//   10+   401  "Your account is locked."
//
// Matching English server copy is brittle: if the API is localised or its
// wording changes these stop matching and every case falls back to 'invalid',
// which is the safe direction to fail — the user sees the generic message
// rather than a wrong one. A machine-readable error code from the backend
// would remove the guesswork entirely.
const LAST_ATTEMPT_PATTERN = /one more attempt/i;
const LOCKED_PATTERN = /account is locked/i;

export const classifyLoginFailure = (status: number, body = ''): LoginFailureKind => {
  if (status === 401 || status === 422) {
    // Order matters. The warning is "You have one more attempt before your
    // account is locked." — it contains the locked phrase, so testing for
    // locked first misclassifies the one state the user can still act on.
    if (LAST_ATTEMPT_PATTERN.test(body)) return 'last-attempt';
    if (LOCKED_PATTERN.test(body)) return 'locked';
    return 'invalid';
  }
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  return 'unknown';
};

export const loginFailureMessage = (kind: LoginFailureKind): string =>
  LOGIN_FAILURE_MESSAGES[kind];

// BRGY-136 removed `DataScope`, `barangay` and `data_scope`. They answered
// "which barangay's records may this account see", and one deployment holds
// exactly one barangay's records. Isolation is the deployment, not a filter.
export interface CurrentUser {
  id: number;
  email: string;
  role: string;
  office: string | null;
  permissions: Record<string, string[]>;
}

class AuthService {
  private baseURL = '/api/v1';

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    let response: Response;

    try {
      response = await fetch(`${this.baseURL}/users/sign_in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user: credentials }),
      });
    } catch {
      // fetch only rejects on a transport failure — the request never reached
      // the server, so there is no status to translate.
      throw new AuthError(NETWORK_ERROR_MESSAGE, 'network');
    }

    if (!response.ok) {
      // Read as text, not JSON: Devise sends a plain-text body here, which is
      // what made response.json() throw in BRGY-92. The body is the only way
      // to tell a locked account from a wrong password — both are 401.
      const body = await response.text().catch(() => '');
      const kind = classifyLoginFailure(response.status, body);
      throw new AuthError(loginFailureMessage(kind), kind, response.status);
    }

    // devise-jwt returns the JWT in the Authorization response header
    // (as "Bearer <token>"), not in the JSON body.
    const authHeader = response.headers.get('Authorization');
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '';

    if (!token) {
      throw new AuthError('Login succeeded but no auth token was returned', 'unknown');
    }

    const body = await response.json().catch(() => ({}));
    const user = body?.data?.user;

    return { token, user };
  }

  // Request password-reset instructions for an email. The backend always
  // responds 200 (enumeration-safe), so a resolved promise only means the
  // request was accepted, not that the email exists.
  async requestPasswordReset(email: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/users/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user: { email } }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.status?.message || `Request failed with status ${response.status}`);
    }
  }

  // Complete a password reset using the token emailed to the user.
  async resetPassword(params: {
    token: string;
    password: string;
    passwordConfirmation: string;
  }): Promise<void> {
    const response = await fetch(`${this.baseURL}/users/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: {
          reset_password_token: params.token,
          password: params.password,
          password_confirmation: params.passwordConfirmation,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.status?.message || `Password reset failed with status ${response.status}`);
    }
  }

  async logout(): Promise<void> {
    try {
      const response = await fetch(`${this.baseURL}/users/sign_out`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Logout failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, we should clear local auth state
      throw error;
    }
  }

  // Load the authenticated user's identity, role, scope and permission map
  // (GET /api/v1/me). Drives role-aware rendering on the frontend.
  async fetchMe(token: string): Promise<CurrentUser> {
    const response = await fetch(`${this.baseURL}/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load current user (status ${response.status})`);
    }

    const body = await response.json().catch(() => ({}));
    return body?.data?.user;
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/users/validate_token`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return false;
      }
      return true;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  // Helper method to set authorization header for future requests
  setAuthHeader(token: string): void {
    // This can be used to configure fetch defaults if needed
    // For now, we'll handle headers in each request
  }
}

export const authService = new AuthService();
