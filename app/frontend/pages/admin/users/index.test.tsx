import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import userReducer from '../../../state/user/userSlice'
import AdminUsersPage from './index'
import { adminUserService } from '../../../services/adminUserService'

vi.mock('../../../services/adminUserService', async (importActual) => {
  const actual = await importActual<typeof import('../../../services/adminUserService')>()
  return {
    ...actual,
    adminUserService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn(), activate: vi.fn() },
  }
})

const renderPage = (permissions: Record<string, string[]>) => {
  const store = configureStore({
    reducer: { user: userReducer },
    preloadedState: {
      user: {
        isSignedIn: true,
        token: 't',
        user: { id: 1, email: 'admin@baras.gov', role: 'admin' },
        permissions,
        dataScope: 'all' as const,
        isLoading: false,
        error: null, errorKind: null,
      },
    },
  })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AdminUsersPage />
      </MemoryRouter>
    </Provider>
  )
}

afterEach(() => vi.clearAllMocks())

describe('AdminUsersPage', () => {
  it('lists accounts for an admin', async () => {
    ;(adminUserService.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 2, email: 'clerk@baras.gov', role: 'municipal_staff', office: 'certifications', barangay: null, active: true },
    ])

    renderPage({ user_management: ['read', 'write', 'delete', 'manage'] })

    expect(await screen.findByText('clerk@baras.gov')).toBeInTheDocument()
    expect(adminUserService.list).toHaveBeenCalled()
  })

  it('blocks a user without user_management access', () => {
    renderPage({ certifications: ['read', 'write'] })

    expect(screen.getByText('Access restricted')).toBeInTheDocument()
    expect(adminUserService.list).not.toHaveBeenCalled()
  })
})
