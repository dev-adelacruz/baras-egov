import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateAccountDialog from './CreateAccountDialog'
import { adminUserService, ASSIGNABLE_ROLES, OFFICE_MODULES } from '../../services/adminUserService'

/**
 * BRGY-129. Each test names the acceptance criterion it covers, because the
 * ticket's criteria are mostly about *shape* — where the submit button sits,
 * whether a rule is stated before or after it is broken — and a test that only
 * asserted "the form submits" would pass against the form this replaced.
 */

vi.mock('../../services/adminUserService', async (importActual) => {
  const actual = await importActual<typeof import('../../services/adminUserService')>()
  return { ...actual, adminUserService: { create: vi.fn() } }
})

const created = {
  id: 9,
  email: 'juan@example.gov.ph',
  role: 'municipal_staff',
  office: 'certifications',
  barangay: null,
  active: true,
}

const setup = (props: Partial<React.ComponentProps<typeof CreateAccountDialog>> = {}) => {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(
    <CreateAccountDialog
      open
      onClose={onClose}
      onCreated={onCreated}
      existingEmails={['taken@example.gov.ph']}
      {...props}
    />
  )
  return { onClose, onCreated, user: userEvent.setup() }
}

const fillValid = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('Email'), 'juan@example.gov.ph')
  await user.type(screen.getByLabelText('Temporary password'), 'sekretong-lihim')
}

const createMock = () => adminUserService.create as ReturnType<typeof vi.fn>

afterEach(() => vi.clearAllMocks())

describe('CreateAccountDialog', () => {
  it('AC1 — is a titled dialog whose actions live outside the field grid', async () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'New staff account' })

    const submit = within(dialog).getByRole('button', { name: 'Create account' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    // The defect this guards: the old submit button sat *inside* the form's
    // grid with a text field's exact geometry, so the last row read as two
    // fields. Being outside the <form> element is the structural proof.
    expect(submit.closest('form')).toBeNull()
  })

  it('AC2 — every field has a real label bound to its control', () => {
    setup()
    for (const label of ['Email', 'Temporary password', 'Role', 'Office']) {
      const field = screen.getByLabelText(label)
      expect(field).toBeInTheDocument()
      expect(field.id).toBeTruthy()
      // getByLabelText also matches aria-label, which the old form used for all
      // five fields. Require an actual <label for=…> element.
      expect(document.querySelector(`label[for="${field.id}"]`)).not.toBeNull()
    }
  })

  it('AC3 — pairs Role and Office on one row, email and password full width', () => {
    setup()
    const role = screen.getByLabelText('Role')
    const office = screen.getByLabelText('Office')

    const row = role.closest('.grid')
    expect(row).not.toBeNull()
    expect(row).toContainElement(office)
    expect(row?.className).toMatch(/sm:grid-cols-2/)

    // The two full-width fields must not be in that row.
    expect(row).not.toContainElement(screen.getByLabelText('Email'))
    expect(row).not.toContainElement(screen.getByLabelText('Temporary password'))
  })

  it('AC4 — password autocompletes as new-password, email not at all', () => {
    setup()
    // Without this the admin's password manager offers to autofill, or save,
    // their own credentials into a form that provisions someone else.
    expect(screen.getByLabelText('Temporary password')).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'off')
  })

  it('AC5 — generates a password into the field', async () => {
    const { user } = setup()
    const password = screen.getByLabelText('Temporary password') as HTMLInputElement
    expect(password.value).toBe('')

    await user.click(screen.getByRole('button', { name: /generate/i }))
    expect(password.value.length).toBeGreaterThanOrEqual(12)
    // Ambiguous glyphs are excluded so the value survives being read off a
    // screen and typed by hand.
    expect(password.value).not.toMatch(/[Il1O0]/)
  })

  it('AC5 — shows the password once on success, with a copy control', async () => {
    createMock().mockResolvedValue(created)
    const { user, onCreated, onClose } = setup()

    // After setup(), deliberately: userEvent.setup() installs its own clipboard
    // stub and would overwrite this one. jsdom exposes navigator.clipboard as a
    // getter-only property, so it has to be redefined rather than assigned.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    // The dialog stays open — closing on success is how the old form lost the
    // value, and there is no reset path to recover it.
    expect(await screen.findByRole('dialog', { name: 'Account created' })).toBeInTheDocument()
    expect(screen.getByTestId('created-password')).toHaveTextContent('sekretong-lihim')
    expect(onCreated).toHaveBeenCalledWith(created)
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /copy password/i }))
    expect(writeText).toHaveBeenCalledWith('sekretong-lihim')
    expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument()
  })

  it('AC6 — states the length rule before submission, not after', () => {
    setup()
    // Pristine form: the rule is already on screen.
    expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument()
  })

  it('AC7 — renders errors against their own field', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAttribute('aria-describedby', 'create-account-email-error')
    expect(document.getElementById('create-account-email-error')).toHaveTextContent('Enter an email address.')

    expect(createMock()).not.toHaveBeenCalled()
  })

  it('AC7 — attributes a server rejection to the field it names', async () => {
    createMock().mockRejectedValue(new Error('Email has already been taken'))
    const { user } = setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() =>
      expect(document.getElementById('create-account-email-error')).toHaveTextContent(
        'Email has already been taken'
      )
    )
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('AC7 — keeps an unattributable rejection at dialog level', async () => {
    createMock().mockRejectedValue(new Error('Something went wrong (status 500)'))
    const { user } = setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    // Not pinned to a field it does not name — and not on the page-level banner
    // either, which is reserved for load failures.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong (status 500)')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
  })

  it('AC8 — catches a duplicate email without a round-trip', async () => {
    const { user } = setup()

    await user.type(screen.getByLabelText('Email'), 'taken@example.gov.ph')
    await user.type(screen.getByLabelText('Temporary password'), 'sekretong-lihim')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(document.getElementById('create-account-email-error')).toHaveTextContent(
      'An account with this email already exists.'
    )
    expect(createMock()).not.toHaveBeenCalled()
  })

  it('AC9 — shows exactly one primary CTA', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    const primaries = within(dialog)
      .getAllByRole('button')
      .filter((b) => b.className.includes('bg-brand-500'))
    expect(primaries).toHaveLength(1)
    expect(primaries[0]).toHaveAccessibleName('Create account')
  })

  it('AC10 — is a full-screen sheet at the narrow breakpoint', () => {
    setup()
    const panel = screen.getByTestId('create-account-dialog')
    // Base (narrow) classes are unprefixed; the centred card is opt-in at sm.
    expect(panel.className).toMatch(/\bw-full\b/)
    expect(panel.className).toMatch(/\bh-full\b/)
    expect(panel.className).toMatch(/\brounded-none\b/)
    expect(panel.className).toMatch(/sm:h-auto/)
    expect(panel.className).toMatch(/sm:rounded-2xl/)
  })

  it('does not offer barangay_staff — it would fail server validation', () => {
    setup()
    const role = screen.getByLabelText('Role')
    expect(within(role).queryByRole('option', { name: 'Barangay Staff' })).toBeNull()
    expect(within(role).getByRole('option', { name: 'Municipal Staff' })).toBeInTheDocument()
    // And no Barangay field at all — one deployment serves one barangay.
    expect(screen.queryByLabelText(/barangay/i)).toBeNull()
  })

  it('submits only the four fields the form collects', async () => {
    createMock().mockResolvedValue(created)
    const { user } = setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(createMock()).toHaveBeenCalledTimes(1))
    expect(createMock()).toHaveBeenCalledWith({
      email: 'juan@example.gov.ph',
      password: 'sekretong-lihim',
      role: 'municipal_staff',
      office: 'certifications',
    })
  })

  // Regression guard. The first cut of this dialog defaulted to
  // ASSIGNABLE_ROLES[0], which is 'admin' — so an untouched form provisioned a
  // full administrator, where the form it replaced defaulted to staff.
  it('defaults to the least-privileged role, not admin', () => {
    setup()
    expect(screen.getByLabelText('Role')).toHaveValue('municipal_staff')
  })

  // Both defaults are named rather than indexed. BRGY-137 reordered
  // OFFICE_MODULES and silently moved the office default from one desk to
  // another; before that, ASSIGNABLE_ROLES[0] silently made every new account
  // an admin. A positional default is a hidden dependency on list order.
  it('takes its defaults by name, not by list position', () => {
    setup()
    expect(screen.getByLabelText('Office')).toHaveValue('certifications')
    expect(ASSIGNABLE_ROLES[0]).toBe('admin')
    expect(OFFICE_MODULES[0]).toBe('residents')
    // Neither list's first entry is what the form defaults to — which is the
    // whole point. If these ever coincide, the guard has stopped guarding.
    expect(screen.getByLabelText('Role')).not.toHaveValue(ASSIGNABLE_ROLES[0])
    expect(screen.getByLabelText('Office')).not.toHaveValue(OFFICE_MODULES[0])
  })

  it.each([
    ['client validation', undefined],
    ['a server rejection', 'Email has already been taken'],
  ])('moves focus to the failing field on %s', async (_label, serverMessage) => {
    if (serverMessage) createMock().mockRejectedValue(new Error(serverMessage))
    const { user } = setup()

    if (serverMessage) await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    // The server path used to leave focus on the submit button: .focus() ran
    // while isSubmitting still had the field disabled, so it did nothing.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Email')))
  })

  it('clears a field error as soon as the field is corrected', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')

    await user.type(screen.getByLabelText('Email'), 'j')
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
  })

  it('cancels without submitting', async () => {
    const { user, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(createMock()).not.toHaveBeenCalled()
  })

  it('disables the form while a create is in flight', async () => {
    let release: (v: unknown) => void = () => {}
    createMock().mockReturnValue(new Promise((resolve) => { release = resolve }))
    const { user } = setup()

    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText('Email')).toBeDisabled()

    // Let the pending create settle before the test ends, so the resulting
    // state update doesn't land on an unmounted tree.
    release(created)
    await screen.findByRole('dialog', { name: 'Account created' })
  })
})
