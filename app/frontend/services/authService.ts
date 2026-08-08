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

// Error carrying copy that is safe to render directly to the user. Raw HTTP
// statuses and server-supplied strings never reach the UI — every failure is
// translated here, at the service boundary.
export class AuthError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";

const LOGIN_ERROR_MESSAGES: Record<number, string> = {
  // Devise answers both bad credentials and malformed params this way; the
  // copy stays identical so neither reveals whether the email exists.
  401: 'Incorrect email or password.',
  422: 'Incorrect email or password.',
  403: 'This account does not have access to the console. Contact your administrator.',
  423: 'Account locked after too many failed attempts. Contact your administrator.',
  429: 'Too many sign-in attempts. Wait a moment and try again.',
};

// Maps a login response status to copy a staff member can act on. Deliberately
// ignores any message in the response body: server strings are not written for
// end users and have leaked implementation detail in the past.
export const loginErrorMessage = (status: number): string => {
  const mapped = LOGIN_ERROR_MESSAGES[status];
  if (mapped) return mapped;
  if (status >= 500) return 'Something went wrong on our end. Try again shortly.';
  return 'Could not sign you in. Try again, or contact your administrator.';
};

export type DataScope = 'all' | { barangay: string };

export interface CurrentUser {
  id: number;
  email: string;
  role: string;
  office: string | null;
  barangay: string | null;
  permissions: Record<string, string[]>;
  data_scope: DataScope;
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
      throw new AuthError(NETWORK_ERROR_MESSAGE);
    }

    if (!response.ok) {
      throw new AuthError(loginErrorMessage(response.status), response.status);
    }

    // devise-jwt returns the JWT in the Authorization response header
    // (as "Bearer <token>"), not in the JSON body.
    const authHeader = response.headers.get('Authorization');
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : '';

    if (!token) {
      throw new AuthError('Login succeeded but no auth token was returned');
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
