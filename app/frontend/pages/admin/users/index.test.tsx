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

type User = ReturnType<typeof userEvent.setup>

// BRGY-120: row actions moved behind a neutral ⋯ trigger, so every flow that
// used to click a red link now opens the menu first.
const openRowMenu = async (user: User, email: string) =>
  user.click(await screen.findByRole('button', { name: `Actions for ${email}` }))

const chooseMenuItem = async (user: User, name: string | RegExp) =>
  user.click(await screen.findByRole('menuitem', { name }))

// BRGY-119: picking a role and confirming it are one dialog.
const changeRoleTo = async (user: User, email: string, role: string) => {
  await openRowMenu(user, email)
  await chooseMenuItem(user, 'Change role…')
  const dialog = await screen.findByRole('dialog', { name: 'Change role' })
  await user.selectOptions(within(dialog).getByLabelText('New role'), role)
  await user.click(within(dialog).getByRole('button', { name: 'Change role' }))
}

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
      // something you do here". With BRGY-120 the whole menu is gone, so there
      // is no route to a role change on your own row either.
      expect(within(ownRow).queryByRole('button', { name: /actions for/i })).toBeNull()
      expect(within(ownRow).getByText('This is you')).toBeInTheDocument()
      expect(
        within(colleagueRow).getByRole('button', { name: 'Actions for clerk@baras.gov' })
      ).toBeInTheDocument()
    })

    it('AC7 — deactivating a colleague confirms first, naming them and the consequence', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Deactivate account')

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

      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Deactivate account')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(adminUserService.deactivate).not.toHaveBeenCalled()
    })

    it('AC7 — a role change is picked and confirmed in one dialog, naming the person', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Change role…')

      const dialog = await screen.findByRole('dialog', { name: 'Change role' })
      expect(within(dialog).getByText(/clerk@baras\.gov/)).toBeInTheDocument()
      // Opening the dialog sends nothing — the old inline <select> fired a PATCH
      // on the change event itself.
      expect(adminUserService.update).not.toHaveBeenCalled()

      await user.selectOptions(within(dialog).getByLabelText('New role'), 'admin')
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

      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Deactivate account')
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

    const deactivateColleague = async (user: User) => {
      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Deactivate account')
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

      await changeRoleTo(user, 'clerk@baras.gov', 'department_head')

      expect(await screen.findByTestId('admin-users-notice')).toHaveTextContent(
        'clerk@baras.gov now has the Department Head role.'
      )
    })

    it('AC1 — role copy stays grammatical for every role, including Admin and Staff', async () => {
      // "is now a Admin" / "is now a Staff" was the first phrasing. Naming the
      // role as a role is the only wording correct across all three.
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await changeRoleTo(user, 'clerk@baras.gov', 'admin')

      const notice = await screen.findByTestId('admin-users-notice')
      expect(notice).toHaveTextContent('clerk@baras.gov now has the Admin role.')
      expect(notice.textContent).not.toMatch(/is now a Admin/)
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

      await changeRoleTo(user, 'clerk@baras.gov', 'department_head')

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

      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Reactivate account')
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

  /**
   * BRGY-119 + BRGY-120. At 40 rows the table rendered 40 native selects and 40
   * red "Deactivate" links — a form, with a stripe of the error colour down its
   * right edge. Both are the same defect from different directions: a row's
   * controls were live at rest.
   */
  describe('row controls', () => {
    const admin = { id: 1, email: 'admin@baras.gov', role: 'admin', office: null, active: true }
    const colleague = { id: 2, email: 'clerk@baras.gov', role: 'staff', office: 'certifications', active: true }
    const manage = { user_management: ['read', 'write', 'delete', 'manage'] }

    const listReturns = (rows: unknown[]) =>
      (adminUserService.list as ReturnType<typeof vi.fn>).mockResolvedValue(rows)

    it('BRGY-119 AC1 — the Role column is text, not a control', async () => {
      listReturns([admin, colleague])
      renderPage(manage)

      const table = await screen.findByRole('table')
      const row = within(table).getByText('clerk@baras.gov').closest('tr')!
      expect(within(row).getByText('Staff')).toBeInTheDocument()
      // No <select> anywhere in the table — this is the whole ticket.
      expect(within(table).queryAllByRole('combobox')).toHaveLength(0)
    })

    it('BRGY-120 AC1 — the resting table offers no destructive control', async () => {
      listReturns([admin, colleague])
      renderPage(manage)

      const table = await screen.findByRole('table')
      expect(within(table).queryByRole('button', { name: /deactivate/i })).toBeNull()
      expect(within(table).queryByText(/deactivate/i)).toBeNull()
      // One neutral trigger instead, on the colleague's row only.
      expect(within(table).getAllByRole('button', { name: /^Actions for/ })).toHaveLength(1)
    })

    it('BRGY-119 AC4 — the office filter is a labelled Select, not a bare one', async () => {
      listReturns([admin, colleague])
      renderPage(manage)

      await screen.findByRole('table')
      // Accessible name comes from a real <label>, visually hidden in the
      // filter bar but present in the accessibility tree.
      expect(screen.getByLabelText('Office')).toBeInTheDocument()
    })

    it('BRGY-119 AC2 — choosing Admin calls out the escalation, and only then', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Change role…')
      const dialog = await screen.findByRole('dialog', { name: 'Change role' })

      expect(screen.queryByTestId('role-escalation-warning')).toBeNull()

      await user.selectOptions(within(dialog).getByLabelText('New role'), 'admin')
      expect(await screen.findByTestId('role-escalation-warning')).toHaveTextContent(
        /deactivate and change the role of every account — including yours/
      )

      await user.selectOptions(within(dialog).getByLabelText('New role'), 'department_head')
      await waitFor(() => expect(screen.queryByTestId('role-escalation-warning')).toBeNull())
    })

    it('BRGY-119 — confirming is refused until the role actually changes', async () => {
      listReturns([admin, colleague])
      const user = userEvent.setup()
      renderPage(manage)

      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Change role…')
      const dialog = await screen.findByRole('dialog', { name: 'Change role' })

      // Opens on the current role, so the confirm has nothing to apply yet.
      expect(within(dialog).getByRole('button', { name: 'Change role' })).toBeDisabled()

      await user.selectOptions(within(dialog).getByLabelText('New role'), 'admin')
      expect(within(dialog).getByRole('button', { name: 'Change role' })).toBeEnabled()
    })

    it('BRGY-119 — a role the app no longer offers still renders in the dialog', async () => {
      // BRGY-136 merged `barangay_staff` away. An account created before that
      // migration must not have its role silently rewritten by the control.
      const legacy = { ...colleague, role: 'barangay_staff' }
      listReturns([admin, legacy])
      const user = userEvent.setup()
      renderPage(manage)

      await openRowMenu(user, 'clerk@baras.gov')
      await chooseMenuItem(user, 'Change role…')
      const dialog = await screen.findByRole('dialog', { name: 'Change role' })

      const select = within(dialog).getByLabelText('New role') as HTMLSelectElement
      expect(select.value).toBe('barangay_staff')
      expect(within(dialog).getByRole('option', { name: 'Barangay Staff' })).toBeInTheDocument()
    })

    it('BRGY-120 AC5 — reactivate is offered but not marked destructive', async () => {
      listReturns([admin, { ...colleague, active: false }])
      const user = userEvent.setup()
      renderPage(manage)

      await openRowMenu(user, 'clerk@baras.gov')

      const item = await screen.findByRole('menuitem', { name: 'Reactivate account' })
      expect(item).toHaveAttribute('data-tone', 'default')
      expect(screen.queryByRole('menuitem', { name: 'Deactivate account' })).toBeNull()
    })
  })
})
