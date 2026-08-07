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

// Kept in sync with Permission::MODULES on the backend.
export const OFFICE_MODULES = [
  'civil_registry',
  'treasury',
  'business_permits',
  'social_welfare',
  'disaster_management',
  'health',
  'documents',
  'reports',
  'user_management',
];

export const ROLES = ['admin', 'department_head', 'municipal_staff', 'barangay_staff'];
