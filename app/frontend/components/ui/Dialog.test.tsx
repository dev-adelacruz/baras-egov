import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Dialog, { ConfirmDialog } from './Dialog'
import Drawer from './Drawer'

/**
 * BRGY-126. These assert the guarantees that made the primitive necessary —
 * the ones every hand-rolled overlay in this app was missing.
 */

const Harness: React.FC<{ initial?: boolean }> = ({ initial = false }) => {
  const [open, setOpen] = useState(initial)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New staff account">
        <input aria-label="Email" />
        <input aria-label="Password" />
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Hidden">
        <p>body</p>
      </Dialog>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('body')).toBeNull()
  })

  it('names itself with its own title', () => {
    render(
      <Dialog open onClose={() => {}} title="New staff account" description="Sign-in details">
        <p>body</p>
      </Dialog>
    )
    // aria-labelledby must resolve to the heading, not just be present.
    expect(screen.getByRole('dialog', { name: 'New staff account' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('New staff account')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness initial />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves focus in on open and returns it to the trigger on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(trigger)

    // Focus must leave the trigger — it is behind a scrim now.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(document.activeElement).not.toBe(trigger)
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('returns focus to the trigger when dismissed by the scrim too', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await user.click(trigger)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // Regression guard. Focus return was only ever asserted on the Escape path,
    // so a scrim-close that blanked focus shipped unnoticed: mousedown's default
    // action moves focus and runs *after* the handler, undoing the restore.
    const scrim = document.querySelector('[aria-hidden="true"]') as HTMLElement
    await user.click(scrim)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('contains Tab within the panel', async () => {
    const user = userEvent.setup()
    render(<Harness initial />)

    const panel = screen.getByRole('dialog')
    // Tab all the way round; focus must never land outside the dialog. Without
    // containment it walks straight into the page behind the scrim.
    for (let i = 0; i < 8; i += 1) {
      await user.tab()
      expect(panel.contains(document.activeElement)).toBe(true)
    }
  })

  // AC 7 — the two sizes. Asserted as pixels rather than class strings so the
  // test is about the criterion (compact ~430px, form ~560px) and not about how
  // the utility happens to be spelled. There is no consumer rendering a Dialog
  // yet, so without this nothing would catch a wrong value until BRGY-129
  // builds the create form against it.
  const maxWidthPx = (el: HTMLElement): number => {
    const rem = el.className.match(/max-w-\[([\d.]+)rem\]/)
    if (!rem) throw new Error(`no max-w-[…rem] utility on panel: ${el.className}`)
    return parseFloat(rem[1]) * 16
  }

  it.each([
    ['compact' as const, 430],
    ['form' as const, 560],
  ])('sizes the %s dialog to %ipx', (size, expected) => {
    render(
      <Dialog open onClose={() => {}} title="Sized" size={size} testId="panel">
        <p>body</p>
      </Dialog>
    )
    expect(maxWidthPx(screen.getByTestId('panel'))).toBe(expected)
  })

  it('defaults to the form size', () => {
    render(
      <Dialog open onClose={() => {}} title="Default" testId="panel">
        <p>body</p>
      </Dialog>
    )
    expect(maxWidthPx(screen.getByTestId('panel'))).toBe(560)
  })

  it('locks page scroll while open and restores it after', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(document.body.style.overflow).not.toBe('hidden')
    await user.click(screen.getByRole('button', { name: 'Open dialog' }))
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'))
  })
})

describe('ConfirmDialog', () => {
  const setup = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Deactivate this account?"
        description="eduardo.villafuerte@baras.gov.local will no longer be able to sign in."
        confirmLabel="Deactivate account"
        tone="danger"
        {...props}
      />
    )
    return { onConfirm, onClose }
  }

  it('is an alertdialog — it interrupts and must be resolved', () => {
    setup()
    expect(screen.getByRole('alertdialog', { name: 'Deactivate this account?' })).toBeInTheDocument()
  })

  it('uses the compact size — one decision, not a form', () => {
    setup({ testId: 'confirm-panel' })
    const cls = screen.getByTestId('confirm-panel').className
    expect(cls).toMatch(/max-w-\[26\.875rem\]/)
  })

  it('names the action rather than saying OK', () => {
    setup()
    // The button must be actionable without re-reading the title. "OK" and
    // "Confirm" are the failure mode this asserts against.
    const confirm = screen.getByRole('button', { name: 'Deactivate account' })
    expect(confirm).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(ok|confirm|yes)$/i })).toBeNull()
  })

  it('names the affected account in the description', () => {
    setup()
    expect(
      screen.getByText(/eduardo\.villafuerte@baras\.gov\.local will no longer be able to sign in\./)
    ).toBeInTheDocument()
  })

  it('fires the action only when the confirming button is pressed', async () => {
    const user = userEvent.setup()
    const { onConfirm, onClose } = setup()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Deactivate account' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disables both actions while the confirmation is in flight', () => {
    setup({ isConfirming: true })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    // The confirm button swaps to its loading label, so match on the spinner text.
    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled()
  })
})

describe('Drawer', () => {
  it('renders as a labelled modal dialog', () => {
    render(
      <Drawer open onClose={() => {}} title="Account details">
        <p>detail body</p>
      </Drawer>
    )
    const panel = screen.getByRole('dialog', { name: 'Account details' })
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('detail body')).toBeInTheDocument()
  })

  it('offers a close control', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} title="Account details">
        <p>detail body</p>
      </Drawer>
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
