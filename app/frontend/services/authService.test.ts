import { authService } from './authService'

// Build a minimal fake Response for fetch mocks.
const mockResponse = (opts: {
  ok?: boolean
  status?: number
  authHeader?: string | null
  body?: unknown
  text?: string
}) =>
  ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (k: string) => (k === 'Authorization' ? opts.authHeader ?? null : null) },
    json: async () => opts.body ?? {},
    // Devise sends plain text on a failed sign-in, not JSON.
    text: async () => opts.text ?? '',
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

  // Previously this asserted the server's own message was surfaced. That is the
  // behaviour BRGY-92 removes: the body produced "Login failed with status 401"
  // whenever it carried no `message`, and server strings are not user copy.
  it('ignores the server message and uses mapped copy on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 401, body: { message: 'Invalid credentials' } }))
    )
    await expect(authService.login({ email: 'a@b.com', password: 'bad' })).rejects.toThrow(
      'Incorrect email or password.'
    )
  })

  it.each([
    [401, 'Incorrect email or password.'],
    [422, 'Incorrect email or password.'],
    [403, 'This account does not have access to the console. Contact your administrator.'],
    [429, 'Too many sign-in attempts. Wait a moment and try again.'],
    [500, 'Something went wrong on our end. Try again shortly.'],
    [503, 'Something went wrong on our end. Try again shortly.'],
    [418, 'Could not sign you in. Try again, or contact your administrator.'],
  ])('maps status %i to its own copy', async (status, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status, body: {} })))
    await expect(authService.login({ email: 'a@b.com', password: 'pw' })).rejects.toThrow(expected)
  })

  // Devise answers 401 for all three of these. Status alone cannot tell them
  // apart, which is why the previous 423 mapping could never fire — verified
  // against the running API in BRGY-106.
  it.each([
    ['Invalid email or password.', 'invalid', 'Incorrect email or password.'],
    [
      'You have one more attempt before your account is locked.',
      'last-attempt',
      'One more failed attempt will lock this account.',
    ],
    ['Your account is locked.', 'locked', 'This account is locked'],
  ])('reads the 401 body %j as %s', async (body, kind, expected) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 401, text: body })))
    await expect(authService.login({ email: 'a@b.com', password: 'pw' })).rejects.toMatchObject({
      kind,
      message: expect.stringContaining(expected),
    })
  })

  it('falls back to the generic message when the body is unrecognised', async () => {
    // If the API is ever localised these patterns stop matching. Failing to
    // 'invalid' is the safe direction — a generic message, never a wrong one.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 401, text: 'Mali ang email o password.' }))
    )
    await expect(authService.login({ email: 'a@b.com', password: 'pw' })).rejects.toMatchObject({
      kind: 'invalid',
      message: 'Incorrect email or password.',
    })
  })

  it('tags a transport failure as a network problem', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(authService.login({ email: 'a@b.com', password: 'pw' })).rejects.toMatchObject({
      kind: 'network',
    })
  })

  it('never leaks an HTTP status code into the message', async () => {
    for (const status of [400, 401, 403, 418, 422, 429, 500, 502, 503]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: false, status, body: {} })))
      await expect(authService.login({ email: 'a@b.com', password: 'pw' })).rejects.toThrow(
        expect.not.stringContaining(String(status))
      )
    }
  })

  it('reports a connection problem when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(authService.login({ email: 'a@b.com', password: 'pw' })).rejects.toThrow(
      "Can't reach the server. Check your connection and try again."
    )
  })

  it('does not surface the underlying transport error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(authService.login({ email: 'a@b.com', password: 'pw' })).rejects.not.toThrow(/failed to fetch/i)
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
