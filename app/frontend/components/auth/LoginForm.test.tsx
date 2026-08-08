import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import userReducer from '../../state/user/userSlice'
import LoginForm from './LoginForm'

const renderForm = () => {
  const store = configureStore({ reducer: { user: userReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <LoginForm onSuccess={vi.fn()} />
      </MemoryRouter>
    </Provider>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('LoginForm password visibility toggle', () => {
  it('exposes an accessible name that reflects the current state', async () => {
    renderForm()

    const toggle = screen.getByRole('button', { name: /show password/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(toggle)

    expect(screen.getByRole('button', { name: /hide password/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('unmasks and re-masks the password field', async () => {
    renderForm()

    // Exact match: the toggle's aria-label also contains "password".
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: /show password/i }))
    expect(password).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: /hide password/i }))
    expect(password).toHaveAttribute('type', 'password')
  })

  // The regression: the button carried tabIndex={-1}, so keyboard users could
  // never reach it and had no way to check what they had typed.
  it('is reachable by keyboard, immediately after the password field', async () => {
    renderForm()

    screen.getByLabelText(/email address/i).focus()
    await userEvent.tab() // -> password
    await userEvent.tab() // -> toggle

    expect(screen.getByRole('button', { name: /show password/i })).toHaveFocus()
  })

  it('operates with Enter and Space', async () => {
    renderForm()

    // Exact match: the toggle's aria-label also contains "password".
    const password = screen.getByLabelText('Password')
    screen.getByRole('button', { name: /show password/i }).focus()

    await userEvent.keyboard('{Enter}')
    expect(password).toHaveAttribute('type', 'text')

    await userEvent.keyboard(' ')
    expect(password).toHaveAttribute('type', 'password')
  })

  it('does not submit the form when activated', async () => {
    renderForm()

    const toggle = screen.getByRole('button', { name: /show password/i })
    expect(toggle).toHaveAttribute('type', 'button')

    await userEvent.click(toggle)

    // A submit would surface a validation error or a loading label.
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
  })
})
