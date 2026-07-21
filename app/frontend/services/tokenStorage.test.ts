import { tokenStorage } from './tokenStorage'

describe('tokenStorage', () => {
  it('stores and retrieves a token from localStorage', () => {
    tokenStorage.storeToken('abc', { storageType: 'local' })
    expect(tokenStorage.getToken()).toBe('abc')
    expect(localStorage.getItem('auth_token')).toBe('abc')
    expect(tokenStorage.getStorageType()).toBe('local')
    expect(tokenStorage.hasToken()).toBe(true)
  })

  it('stores in sessionStorage (not localStorage) when storageType is session', () => {
    tokenStorage.storeToken('xyz', { storageType: 'session' })
    expect(sessionStorage.getItem('auth_token')).toBe('xyz')
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(tokenStorage.getToken()).toBe('xyz')
  })

  it('clears the token from all storage locations', () => {
    tokenStorage.storeToken('abc', { storageType: 'local' })
    tokenStorage.clearToken()
    expect(tokenStorage.getToken()).toBeNull()
    expect(tokenStorage.hasToken()).toBe(false)
  })

  it('returns null when no token is stored', () => {
    expect(tokenStorage.getToken()).toBeNull()
    expect(tokenStorage.hasToken()).toBe(false)
  })
})
