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

describe('authService.fetchMe', () => {
  it('sends the bearer token and returns the user payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({
        ok: true,
        status: 200,
        body: {
          data: {
            user: {
              id: 1,
              email: 'a@b.com',
              role: 'admin',
              permissions: { user_management: ['read', 'write'] },
              data_scope: 'all',
            },
          },
        },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const me = await authService.fetchMe('tok123')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/me')
    expect(init.headers.Authorization).toBe('Bearer tok123')
    expect(me.role).toBe('admin')
    expect(me.permissions.user_management).toEqual(['read', 'write'])
  })

  it('throws when the request is unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 401 })))
    await expect(authService.fetchMe('bad')).rejects.toThrow(/status 401/i)
  })
})

describe('authService.requestPasswordReset', () => {
  it('POSTs the email to the password endpoint and resolves on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(authService.requestPasswordReset('a@b.com')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/users/password')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ user: { email: 'a@b.com' } })
  })

  it('throws with the server message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 422, body: { status: { message: 'Bad request' } } }))
    )
    await expect(authService.requestPasswordReset('a@b.com')).rejects.toThrow('Bad request')
  })
})

describe('authService.resetPassword', () => {
  it('PUTs the token and new password in snake_case and resolves on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      authService.resetPassword({ token: 'tok', password: 'newpass', passwordConfirmation: 'newpass' })
    ).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/users/password')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({
      user: { reset_password_token: 'tok', password: 'newpass', password_confirmation: 'newpass' },
    })
  })

  it('throws with the server message when the token is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ ok: false, status: 422, body: { status: { message: 'Reset password token is invalid' } } })
      )
    )
    await expect(
      authService.resetPassword({ token: 'bad', password: 'newpass', passwordConfirmation: 'newpass' })
    ).rejects.toThrow(/token is invalid/i)
  })
})
