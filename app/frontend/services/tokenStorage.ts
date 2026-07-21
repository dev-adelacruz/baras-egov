// Token storage backed by localStorage / sessionStorage.

export interface TokenStorageOptions {
  storageType: 'local' | 'session';
}

class TokenStorage {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly STORAGE_TYPE_KEY = 'auth_storage_type';

  // Store the token in the requested storage location.
  storeToken(token: string, options: TokenStorageOptions): void {
    const storage = options.storageType === 'local' ? localStorage : sessionStorage;
    storage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.STORAGE_TYPE_KEY, options.storageType);
  }

  // Retrieve the token from whichever storage holds it.
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY);
  }

  // Clear the token from all storage locations.
  clearToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.STORAGE_TYPE_KEY);
  }

  // Get the storage type used for the current token.
  getStorageType(): 'local' | 'session' | null {
    return localStorage.getItem(this.STORAGE_TYPE_KEY) as 'local' | 'session' | null;
  }

  // Check if a token exists.
  hasToken(): boolean {
    return !!(localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY));
  }
}

export const tokenStorage = new TokenStorage();
