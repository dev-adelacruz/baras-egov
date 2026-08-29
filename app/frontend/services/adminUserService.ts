import { tokenStorage } from './tokenStorage';

// Client for the admin account-management API (BRGY-40). Every call is
// authenticated with the stored JWT; the server enforces admin-only access.
export interface AdminUser {
  id: number;
  email: string;
  role: string;
  office: string | null;
  active: boolean;
}

export interface UserFilters {
  office?: string;
  search?: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: string;
  office?: string;
}

export interface UpdateUserInput {
  role?: string;
  office?: string;
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
  // `signal` lets the caller abort a superseded search (BRGY-131). Aborting is
  // preferable to merely ignoring the response: this product is built for LGU
  // connectivity, where the request that never finishes is the one that costs.
  async list(filters: UserFilters = {}, signal?: AbortSignal): Promise<AdminUser[]> {
    const params = new URLSearchParams();
    if (filters.office) params.set('office', filters.office);
    if (filters.search) params.set('search', filters.search);
    const query = params.toString();

    const response = await fetch(`${BASE_URL}${query ? `?${query}` : ''}`, {
      method: 'GET',
      headers: authHeaders(),
      signal,
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
// These are the barangay's own desks — BRGY-137 replaced the municipal org chart
// this used to mirror, and BRGY-142 cut it to what the hall actually staffs.
// Order matches the Ruby constant so the two can be diffed by eye.
//
// A module is a desk a person is assigned to, not a document type. Barangay
// clearance lives under `certifications` because the same secretary prepares
// both; `health` is gone because a Barangay Health Station reports to the
// municipal RHU and keeps DOH-prescribed records, not the barangay's.
export const OFFICE_MODULES = [
  'residents',
  'certifications',
  'katarungan',
  'treasury',
  'social_services',
  'disaster_management',
  'legislative',
  'reports',
  'user_management',
];

/**
 * Kept in sync with the `role` enum in app/models/user.rb.
 *
 * BRGY-136 merged `barangay_staff` and `municipal_staff` into a single `staff`
 * role. The two already resolved to identical permissions — the only thing
 * separating them was barangay scoping, which is gone because one deployment
 * serves one barangay.
 *
 * There is no longer an `ASSIGNABLE_ROLES` subset. It existed solely to hide
 * `barangay_staff`, which would have returned 422 every time it was chosen;
 * every role in this list can now actually be assigned.
 */
export const ROLES = ['admin', 'department_head', 'staff'];
