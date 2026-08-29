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

// reset, not clear: `clearAllMocks` wipes recorded calls but leaves
// implementations in place, so a `mockRejectedValue` set by one test stays
// armed for every test after it. That was survivable only while the rejecting
// test happened to run last.
afterEach(() => vi.resetAllMocks())

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

  /**
   * BRGY-132. Failure had a red banner; success had nothing at all. With 40
   * accounts a newly created one lands in alphabetical position off-screen, so
   * "did that work?" was only answerable by searching for the address you had
   * just typed.
   */
  describe('mutation feedback', () => {
    const admin = { id: 1, email: 'admin@baras.gov', role: 'admin', office: null, active: true }
    const colleague = { id: 2, email: 'clerk@baras.gov', role: 'staff', office: 'certifications', active: true }
    const manage = { user_management: ['read', 'write', 'delete', 'manage'] }

    const listReturns = (rows: unknown[]) =>
      (adminUserService.list as ReturnType<typeof vi.fn>).mockResolvedValue(rows)

    const deactivateColleague = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('button', { name: /deactivate/i }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deactivate account' })
      )
    }

    it('AC1/AC2 — confirms a deactivation by name, in a status region', async () => {
      listReturns([admin, colleague])
      // Resolves with the updated row, as the real service does.
      ;(adminUserService.deactivate as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...colleague, active: false,
      })
      const user = userEvent.setup()
      renderPage(manage)
      await deactivateColleague(user)

      const notice = await screen.findByTestId('admin-users-notice')
      // status, not alert: it must not interrupt what the admin is doing.
      expect(notice).toHaveAttribute('role', 'status')
      expect(notice).toHaveTextContent('Deactivated clerk@baras.gov. They can no longer sign in.')
    })

    it('AC1 — a role change names the person and the new role', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await screen.findByText('clerk@baras.gov')
      await user.selectOptions(screen.getByLabelText('Role for clerk@baras.gov'), 'department_head')
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Change role' })
      )

      expect(await screen.findByTestId('admin-users-notice')).toHaveTextContent(
        'clerk@baras.gov is now a Department Head.'
      )
    })

    it('AC3 — marks the affected row as recently changed', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)
      await deactivateColleague(user)

      await screen.findByTestId('admin-users-notice')
      expect(screen.getByTestId('user-row-2')).toHaveAttribute('data-recently-changed', 'true')
      expect(screen.getByTestId('user-row-1')).not.toHaveAttribute('data-recently-changed')
    })

    it('says so when the changed account is filtered out of the visible list', async () => {
      // The row the admin just acted on drops out of the result set. Without
      // this the page reloads to a list that looks untouched.
      ;(adminUserService.list as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([admin, colleague])
        .mockResolvedValue([admin])

      const user = userEvent.setup()
      renderPage(manage)
      await deactivateColleague(user)

      expect(await screen.findByTestId('admin-users-notice')).toHaveTextContent(
        /It is not shown below — the current search or office filter excludes it\./
      )
    })

    it('AC4 — offers undo, and undoing reactivates the account', async () => {
      listReturns([admin, colleague])
      ;(adminUserService.deactivate as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...colleague, active: false,
      })
      ;(adminUserService.activate as ReturnType<typeof vi.fn>).mockResolvedValue(colleague)
      const user = userEvent.setup()
      renderPage(manage)
      await deactivateColleague(user)

      const notice = await screen.findByTestId('admin-users-notice')
      await user.click(within(notice).getByRole('button', { name: 'Undo' }))

      await waitFor(() => expect(adminUserService.activate).toHaveBeenCalledWith(2))
      expect(await screen.findByTestId('admin-users-notice')).toHaveTextContent(
        'clerk@baras.gov can sign in again.'
      )
    })

    it('AC4 — a role change offers no undo, having already been confirmed by name', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await screen.findByText('clerk@baras.gov')
      await user.selectOptions(screen.getByLabelText('Role for clerk@baras.gov'), 'department_head')
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Change role' })
      )

      const notice = await screen.findByTestId('admin-users-notice')
      expect(within(notice).queryByRole('button', { name: 'Undo' })).toBeNull()
    })

    it('AC4 — a refused undo surfaces the server\'s reason and drops the confirmation', async () => {
      // Undoing a reactivation is a deactivation, which the server refuses when
      // it would empty the last admin seat.
      const deactivated = { ...colleague, active: false }
      listReturns([admin, deactivated])
      ;(adminUserService.deactivate as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('This is the only administrator who can still sign in.')
      )

      const user = userEvent.setup()
      renderPage(manage)

      await user.click(await screen.findByRole('button', { name: /reactivate/i }))
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reactivate account' })
      )
      const notice = await screen.findByTestId('admin-users-notice')
      await user.click(within(notice).getByRole('button', { name: 'Undo' }))

      expect(
        await screen.findByText('This is the only administrator who can still sign in.')
      ).toBeInTheDocument()
      expect(screen.queryByTestId('admin-users-notice')).toBeNull()
    })

    it('AC5 — a failed mutation shows the error banner and no success confirmation', async () => {
      listReturns([admin, colleague])
      ;(adminUserService.deactivate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Nope.'))

      const user = userEvent.setup()
      renderPage(manage)
      await deactivateColleague(user)

      expect(await screen.findByText('Nope.')).toBeInTheDocument()
      expect(screen.queryByTestId('admin-users-notice')).toBeNull()
    })

    it('AC1 — creating an account confirms it by name', async () => {
      listReturns([admin])
      ;(adminUserService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 3, email: 'new.clerk@baras.gov', role: 'staff', office: 'certifications', active: true,
      })

      const user = userEvent.setup()
      renderPage(manage)

      await user.click(await screen.findByRole('button', { name: /new account/i }))
      await user.type(await screen.findByLabelText('Email'), 'new.clerk@baras.gov')
      await user.type(screen.getByLabelText('Temporary password'), 'password123')
      await user.click(screen.getByRole('button', { name: 'Create account' }))

      expect(await screen.findByTestId('admin-users-notice')).toHaveTextContent(
        'Created new.clerk@baras.gov.'
      )
    })
  })
})
