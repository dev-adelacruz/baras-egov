import { adminUserService } from './adminUserService'
import { tokenStorage } from './tokenStorage'

vi.mock('./tokenStorage', () => ({
  tokenStorage: { getToken: vi.fn(() => 'tok-123') },
}))

const mockResponse = (opts: { ok?: boolean; status?: number; body?: unknown }) =>
  ({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => opts.body ?? {},
  }) as unknown as Response

afterEach(() => vi.restoreAllMocks())

describe('adminUserService.list', () => {
  it('sends the bearer token and builds the filter query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ body: { data: { users: [{ id: 1, email: 'a@b.com' }] } } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const users = await adminUserService.list({ office: 'treasury', search: 'ab' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/admin/users?office=treasury&search=ab')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
    expect(users).toEqual([{ id: 1, email: 'a@b.com' }])
  })

  it('throws the server message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      mockResponse({ ok: false, status: 403, body: { status: { message: 'Not authorized to read user_management' } } })
    ))
    await expect(adminUserService.list()).rejects.toThrow(/not authorized/i)
  })
})

describe('adminUserService.create', () => {
  it('wraps the payload under the user key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse({ status: 201, body: { data: { user: { id: 2, email: 'new@b.com' } } } })
    )
    vi.stubGlobal('fetch', fetchMock)

    const user = await adminUserService.create({ email: 'new@b.com', password: 'password123', role: 'staff', office: 'treasury' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/admin/users')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      user: { email: 'new@b.com', password: 'password123', role: 'staff', office: 'treasury' },
    })
    expect(user.id).toBe(2)
  })
})

describe('adminUserService deactivate / activate', () => {
  it('PATCHes the deactivate member route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ body: { data: { user: { id: 3, active: false } } } }))
    vi.stubGlobal('fetch', fetchMock)

    await adminUserService.deactivate(3)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/admin/users/3/deactivate')
    expect(init.method).toBe('PATCH')
  })
})
