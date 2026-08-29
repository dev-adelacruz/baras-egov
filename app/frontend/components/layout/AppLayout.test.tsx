import { render, screen, within } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import userReducer from '../../state/user/userSlice'
import AppLayout from './AppLayout'

const renderLayout = (
  permissions: Record<string, string[]> = { user_management: ['read', 'manage'] },
  route = '/',
  title = 'Dashboard'
) => {
  const store = configureStore({
    reducer: { user: userReducer },
    preloadedState: {
      user: {
        isSignedIn: true,
        token: 't',
        user: { id: 1, email: 'admin@baras.gov', role: 'admin' },
        permissions,
        isLoading: false,
        error: null,
        errorKind: null,
      },
    },
  })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <AppLayout title={title}>
          <p>page body</p>
        </AppLayout>
      </MemoryRouter>
    </Provider>
  )
}

describe('AppLayout', () => {
  it('renders exactly one h1, and it is the page title', () => {
    const { container } = renderLayout(undefined, '/admin/users', 'Staff Accounts')

    // The shell owns the h1 so pages don't add a second one — two h1s per page
    // is the defect BRGY-123 removed from the auth pages.
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent('Staff Accounts')
  })

  it('offers a way to sign out', () => {
    renderLayout()

    // Before BRGY-124 the shell only wrapped the dashboard, so /admin/users had
    // no sign-out control at all.
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('marks the current route active, and only the current route', () => {
    renderLayout(undefined, '/admin/users')

    const nav = screen.getByRole('navigation')
    const current = within(nav).getAllByRole('button', { current: 'page' })

    // `active` used to be a hardcoded literal on Dashboard, which would have
    // marked it current on every page once the sidebar became shared.
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Users')
  })

  it('hides nav items the user has no permission for', () => {
    renderLayout({ certifications: ['read'] })

    const nav = screen.getByRole('navigation')
    expect(within(nav).queryByRole('button', { name: /users/i })).toBeNull()
    expect(within(nav).queryByRole('button', { name: /settings/i })).toBeNull()
    // Ungated items still render. UI hiding is convenience, never the security
    // boundary — the server enforces every action independently (BRGY-38).
    expect(within(nav).getByRole('button', { name: /dashboard/i })).toBeInTheDocument()
  })

  it('renders the page content it wraps', () => {
    renderLayout()

    expect(screen.getByText('page body')).toBeInTheDocument()
  })
})
