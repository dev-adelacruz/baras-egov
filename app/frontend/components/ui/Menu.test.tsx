import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Menu from './Menu'

/**
 * BRGY-120. The menu exists so a destructive action can sit behind a neutral
 * trigger, which only helps if the trigger is actually reachable — the control
 * it replaces was a 62x16 text link that failed WCAG 2.2 2.5.8 outright.
 */
describe('Menu', () => {
  const items = (onSelect = vi.fn()) => [
    { label: 'Change role…', onSelect },
    { label: 'Deactivate account', tone: 'danger' as const, onSelect },
  ]

  const renderMenu = (onSelect = vi.fn()) => {
    render(<Menu label="Actions for clerk@baras.gov" items={items(onSelect)} />)
    return onSelect
  }

  it('is closed at rest and exposes no destructive text', () => {
    renderMenu()

    const trigger = screen.getByRole('button', { name: 'Actions for clerk@baras.gov' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    // The whole point: nothing named "Deactivate" is on the page until asked.
    expect(screen.queryByText('Deactivate account')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens on click and marks the destructive item as such', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Actions for clerk@baras.gov' }))

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Deactivate account' })).toHaveAttribute(
      'data-tone',
      'danger'
    )
    expect(screen.getByRole('menuitem', { name: 'Change role…' })).toHaveAttribute(
      'data-tone',
      'default'
    )
  })

  it('opens on ArrowDown with the first item focused', async () => {
    const user = userEvent.setup()
    renderMenu()

    screen.getByRole('button', { name: 'Actions for clerk@baras.gov' }).focus()
    await user.keyboard('{ArrowDown}')

    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Change role…' })).toHaveFocus()
    )
  })

  it('moves focus with the arrow keys and wraps', async () => {
    const user = userEvent.setup()
    renderMenu()

    screen.getByRole('button', { name: 'Actions for clerk@baras.gov' }).focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Deactivate account' })).toHaveFocus()
    )

    await user.keyboard('{ArrowDown}')
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: 'Change role…' })).toHaveFocus()
    )
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByRole('button', { name: 'Actions for clerk@baras.gov' })
    await user.click(trigger)
    await screen.findByRole('menu')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('closes on an outside click without firing anything', async () => {
    const user = userEvent.setup()
    const onSelect = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Actions for clerk@baras.gov' }))
    await screen.findByRole('menu')

    await user.click(document.body)

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('survives a scroll event that was already in flight when it opened', async () => {
    // Regression. Closing on any scroll is a race: the browser dispatches a
    // scroll on the frame *after* the scrolling happens, so a scroll already in
    // flight when the menu opens lands just after the listener attaches and
    // closes it within a frame. On a 40-row table, clicking the menu on a row
    // you had to scroll to did nothing at all. The menu now follows its trigger
    // and only gives up once the row has actually left the viewport.
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole('button', { name: 'Actions for clerk@baras.gov' }))
    await screen.findByRole('menu')

    window.dispatchEvent(new Event('scroll'))

    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('runs the chosen item and closes', async () => {
    const user = userEvent.setup()
    const onSelect = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Actions for clerk@baras.gov' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate account' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
