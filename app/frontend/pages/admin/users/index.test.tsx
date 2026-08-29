import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      { id: 2, email: 'clerk@baras.gov', role: 'staff', office: 'certifications', active: true },
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

  /**
   * BRGY-127. The signed-in admin's own row carried a live Deactivate button
   * styled exactly like the others, and the role dropdown was the same trap by
   * another route. With one administrator and no IT department, either one ends
   * with nobody able to sign in and a phone call to a developer.
   *
   * The server refuses all of it regardless — these cover the UI half.
   */
  describe('lockout guards', () => {
    const admin = { id: 1, email: 'admin@baras.gov', role: 'admin', office: null, active: true }
    const colleague = { id: 2, email: 'clerk@baras.gov', role: 'staff', office: 'certifications', active: true }
    const manage = { user_management: ['read', 'write', 'delete', 'manage'] }

    const listReturns = (rows: unknown[]) =>
      (adminUserService.list as ReturnType<typeof vi.fn>).mockResolvedValue(rows)

    it('AC6 — renders no action on the signed-in admin\'s own row', async () => {
      listReturns([admin, colleague])
      renderPage(manage)

      // Scoped to the table: the app shell also renders the signed-in admin's
      // email in the header and sidebar footer.
      const table = await screen.findByRole('table')
      const ownRow = within(table).getByText('admin@baras.gov').closest('tr')!
      const colleagueRow = within(table).getByText('clerk@baras.gov').closest('tr')!

      // Absent, not disabled: a disabled button still reads as "this is
      // something you do here".
      expect(within(ownRow).queryByRole('button', { name: /deactivate/i })).toBeNull()
      expect(within(ownRow).getByText('This is you')).toBeInTheDocument()
      expect(within(colleagueRow).getByRole('button', { name: /deactivate/i })).toBeInTheDocument()
    })

    it('AC7 — deactivating a colleague confirms first, naming them and the consequence', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await user.click(await screen.findByRole('button', { name: /deactivate/i }))

      const dialog = await screen.findByRole('alertdialog', { name: 'Deactivate account' })
      expect(within(dialog).getByText('clerk@baras.gov will no longer be able to sign in.')).toBeInTheDocument()
      // Nothing has been sent yet — the confirm is a real gate, not a toast.
      expect(adminUserService.deactivate).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }))
      await waitFor(() => expect(adminUserService.deactivate).toHaveBeenCalledWith(2))
    })

    it('AC7 — cancelling the confirmation sends nothing', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await user.click(await screen.findByRole('button', { name: /deactivate/i }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(adminUserService.deactivate).not.toHaveBeenCalled()
    })

    it('AC7 — a role change confirms first, naming the new role', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await screen.findByText('clerk@baras.gov')
      await user.selectOptions(screen.getByLabelText('Role for clerk@baras.gov'), 'admin')

      const dialog = await screen.findByRole('alertdialog', { name: 'Change role' })
      expect(within(dialog).getByText(/clerk@baras\.gov will become Admin/)).toBeInTheDocument()
      expect(adminUserService.update).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: 'Change role' }))
      await waitFor(() => expect(adminUserService.update).toHaveBeenCalledWith(2, { role: 'admin' }))
    })

    it('AC8 — surfaces the server\'s refusal verbatim, not a generic string', async () => {
      // On a refused lockout the server's sentence *is* the recovery
      // instruction. Replacing it with "Failed to update account" throws away
      // the only thing the admin can act on.
      const refusal =
        'This is the only administrator who can still sign in. Make another account an administrator first, ' +
        'or nobody will be able to manage accounts.'
      listReturns([admin, colleague])
      ;(adminUserService.deactivate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(refusal))

      const user = userEvent.setup()
      renderPage(manage)

      await user.click(await screen.findByRole('button', { name: /deactivate/i }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deactivate account' })
      )

      expect(await screen.findByText(refusal)).toBeInTheDocument()
    })
  })
})
