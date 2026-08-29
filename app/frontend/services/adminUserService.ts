import { tokenStorage } from './tokenStorage';

// Client for the admin account-management API (BRGY-40). Every call is
// authenticated with the stored JWT; the server enforces admin-only access.
export interface AdminUser {
  id: number;
  email: string;
  role: string;
  office: string | null;
  barangay: string | null;
  active: boolean;
}

export interface UserFilters {
  office?: string;
  barangay?: string;
  search?: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: string;
  office?: string;
  barangay?: string;
}

export interface UpdateUserInput {
  role?: string;
  office?: string;
  barangay?: string;
  active?: boolean;
}

const BASE_URL = '/api/v1/admin/users';

const authHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${tokenStorage.getToken() ?? ''}`,
});

const parseError = async (response: Response, fallback: string): Promise<never> => {
  const body = await response.json().catch(() => ({}));
  throw new Error(body?.status?.message || `${fallback} (status ${response.status})`);
};

class AdminUserService {
  async list(filters: UserFilters = {}): Promise<AdminUser[]> {
    const params = new URLSearchParams();
    if (filters.office) params.set('office', filters.office);
    if (filters.barangay) params.set('barangay', filters.barangay);
    if (filters.search) params.set('search', filters.search);
    const query = params.toString();

    const response = await fetch(`${BASE_URL}${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!response.ok) return parseError(response, 'Failed to load accounts');

    const body = await response.json().catch(() => ({}));
    return body?.data?.users ?? [];
  }

  async create(input: CreateUserInput): Promise<AdminUser> {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ user: input }),
    });
    if (!response.ok) return parseError(response, 'Failed to create account');

    const body = await response.json().catch(() => ({}));
    return body?.data?.user;
  }

  async update(id: number, input: UpdateUserInput): Promise<AdminUser> {
    const response = await fetch(`${BASE_URL}/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ user: input }),
    });
    if (!response.ok) return parseError(response, 'Failed to update account');

    const body = await response.json().catch(() => ({}));
    return body?.data?.user;
  }

  async deactivate(id: number): Promise<AdminUser> {
    return this.toggleActive(id, 'deactivate');
  }

  async activate(id: number): Promise<AdminUser> {
    return this.toggleActive(id, 'activate');
  }

  private async toggleActive(id: number, action: 'activate' | 'deactivate'): Promise<AdminUser> {
    const response = await fetch(`${BASE_URL}/${id}/${action}`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    if (!response.ok) return parseError(response, `Failed to ${action} account`);

    const body = await response.json().catch(() => ({}));
    return body?.data?.user;
  }
}

export const adminUserService = new AdminUserService();

// Kept in sync with Permission::MODULES on the backend (app/models/permission.rb).
// These are the barangay's own desks — BRGY-137 replaced the municipal org
// chart this used to mirror. Order matches the Ruby constant so the two can be
// diffed by eye.
export const OFFICE_MODULES = [
  'residents',
  'certifications',
  'clearances',
  'katarungan',
  'treasury',
  'social_services',
  'health',
  'disaster_management',
  'legislative',
  'reports',
  'user_management',
];

export const ROLES = ['admin', 'department_head', 'municipal_staff', 'barangay_staff'];

/**
 * Roles the create form offers. `barangay_staff` is deliberately absent:
 * `User` validates `barangay` present when the role is `barangay_staff`, and
 * BRGY-129 drops the Barangay field because a deployment serves one barangay.
 * Offering it would mean a dropdown option that returns 422 every time.
 *
 * `ROLES` keeps the full list so existing accounts still render in the table
 * and in the per-row role select. The two lists converge when BRGY-136 merges
 * `municipal_staff` and `barangay_staff` into a single `staff` role.
 */
export const ASSIGNABLE_ROLES = ROLES.filter((r) => r !== 'barangay_staff');
