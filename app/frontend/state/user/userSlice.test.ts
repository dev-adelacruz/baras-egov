import { configureStore } from '@reduxjs/toolkit'
import reducer, { signOut, loginUser, logoutUser } from './userSlice'
import { authService } from '../../services/authService'
import { tokenStorage } from '../../services/tokenStorage'

vi.mock('../../services/authService', () => ({
  authService: { login: vi.fn(), logout: vi.fn(), validateToken: vi.fn() },
}))
vi.mock('../../services/tokenStorage', () => ({
  tokenStorage: { storeToken: vi.fn(), getToken: vi.fn(), clearToken: vi.fn() },
}))

const initial = { isSignedIn: false, token: null, user: null, isLoading: false, error: null }

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
