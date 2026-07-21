import { authService } from './authService'

// Build a minimal fake Response for fetch mocks.
const mockResponse = (opts: {
  ok?: boolean
  status?: number
  authHeader?: string | null
  body?: unknown
}) =>
  ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (k: string) => (k === 'Authorization' ? opts.authHeader ?? null : null) },
    json: async () => opts.body ?? {},
  }) as unknown as Response

afterEach(() => vi.restoreAllMocks())

describe('authService.login', () => {
  it('reads the token from the Authorization header and the user from the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          authHeader: 'Bearer a.b.c',
          body: { status: { code: 200 }, data: { user: { id: 1, email: 'a@b.com' } } },
        })
      )
    )
    const res = await authService.login({ email: 'a@b.com', password: 'pw' })
    expect(res.token).toBe('a.b.c')
    expect(res.user).toEqual({ id: 1, email: 'a@b.com' })
  })

  it('throws when the response has no Authorization header (no token dispatched)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ authHeader: null, body: {} })))
    await expect(authService.login({ email: 'a@b.com', password: 'pw' })).rejects.toThrow(/no auth token/i)
  })

  it('throws with the server message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 401, body: { message: 'Invalid credentials' } }))
    )
    await expect(authService.login({ email: 'a@b.com', password: 'bad' })).rejects.toThrow('Invalid credentials')
  })
})

describe('authService.validateToken', () => {
  it('returns true when the token is valid (200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200 })))
    expect(await authService.validateToken('t')).toBe(true)
  })

  it('returns false when the token is rejected (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 401 })))
    expect(await authService.validateToken('t')).toBe(false)
  })
})
