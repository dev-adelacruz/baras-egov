import { configureStore } from '@reduxjs/toolkit'
import reducer, { signOut, loginUser, logoutUser, fetchCurrentUser } from './userSlice'
import { authService } from '../../services/authService'
import { tokenStorage } from '../../services/tokenStorage'

vi.mock('../../services/authService', () => ({
  authService: { login: vi.fn(), logout: vi.fn(), validateToken: vi.fn(), fetchMe: vi.fn() },
}))
vi.mock('../../services/tokenStorage', () => ({
  tokenStorage: { storeToken: vi.fn(), getToken: vi.fn(), clearToken: vi.fn() },
}))

const initial = {
  isSignedIn: false,
  token: null,
  user: null,
  permissions: {},
  dataScope: null,
  isLoading: false,
  error: null, errorKind: null,
}

describe('userSlice reducer', () => {
  it('returns the initial state', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initial)
  })

  it('signOut clears the auth state', () => {
    const s = reducer({ ...initial, isSignedIn: true, token: 't', user: { id: 1, email: 'a' } }, signOut())
    expect(s.isSignedIn).toBe(false)
    expect(s.token).toBeNull()
    expect(s.user).toBeNull()
  })

  it('loginUser.fulfilled marks the user signed in', () => {
    const s = reducer(initial, {
      type: loginUser.fulfilled.type,
      payload: { token: 't', user: { id: 1, email: 'a@b.com' } },
    })
    expect(s.isSignedIn).toBe(true)
    expect(s.token).toBe('t')
    expect(s.isLoading).toBe(false)
  })

  it('loginUser.rejected records the error and stays signed out', () => {
    const s = reducer(initial, { type: loginUser.rejected.type, payload: 'Login failed' })
    expect(s.error).toBe('Login failed')
    expect(s.isSignedIn).toBe(false)
  })

  it('logoutUser.fulfilled clears the auth state', () => {
    const s = reducer({ ...initial, isSignedIn: true, token: 't' }, { type: logoutUser.fulfilled.type })
    expect(s.isSignedIn).toBe(false)
    expect(s.token).toBeNull()
  })

  it('fetchCurrentUser.fulfilled stores role, permissions and scope', () => {
    const s = reducer(initial, {
      type: fetchCurrentUser.fulfilled.type,
      payload: {
        id: 1,
        email: 'staff@baras.gov',
        role: 'barangay_staff',
        office: 'disaster_management',
        barangay: 'Barangay Uno',
        permissions: { disaster_management: ['read', 'write'] },
        data_scope: { barangay: 'Barangay Uno' },
      },
    })
    expect(s.isSignedIn).toBe(true)
    expect(s.user?.role).toBe('barangay_staff')
    expect(s.permissions).toEqual({ disaster_management: ['read', 'write'] })
    expect(s.dataScope).toEqual({ barangay: 'Barangay Uno' })
  })

  it('signOut clears permissions and scope', () => {
    const s = reducer(
      { ...initial, isSignedIn: true, permissions: { treasury: ['read'] }, dataScope: 'all' },
      signOut()
    )
    expect(s.permissions).toEqual({})
    expect(s.dataScope).toBeNull()
  })
})

describe('loginUser thunk storage (remember-me)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('persists to sessionStorage when rememberMe is false', async () => {
    ;(authService.login as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 't', user: { id: 1, email: 'a@b.com' } })
    const store = configureStore({ reducer: { user: reducer } })
    await store.dispatch(loginUser({ email: 'a@b.com', password: 'pw', rememberMe: false }) as never)
    expect(tokenStorage.storeToken).toHaveBeenCalledWith('t', { storageType: 'session' })
    expect(store.getState().user.isSignedIn).toBe(true)
  })

  it('persists to localStorage when rememberMe is true', async () => {
    ;(authService.login as ReturnType<typeof vi.fn>).mockResolvedValue({ token: 't', user: { id: 1, email: 'a@b.com' } })
    const store = configureStore({ reducer: { user: reducer } })
    await store.dispatch(loginUser({ email: 'a@b.com', password: 'pw', rememberMe: true }) as never)
    expect(tokenStorage.storeToken).toHaveBeenCalledWith('t', { storageType: 'local' })
  })
})
