import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import userReducer from '../../state/user/userSlice'
import LoginForm from './LoginForm'
import { authService } from '../../services/authService'

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

describe('LoginForm autofill hints', () => {
  it('declares autocomplete tokens so password managers recognise the sign-in form', () => {
    renderForm()

    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('autocomplete', 'email')
    // current-password, not new-password — that token belongs to the reset form.
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })
})

describe('LoginForm error announcement', () => {
  const failLogin = () =>
    vi.spyOn(authService, 'login').mockRejectedValue(new Error('Incorrect email or password.'))

  const submit = async () => {
    await userEvent.type(screen.getByLabelText(/email address/i), 'staff@baras.gov')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
  }

  it('exposes the failure as a live region so it is announced', async () => {
    failLogin()
    renderForm()
    await submit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Incorrect email or password.')
  })

  it('marks both fields invalid and points them at the message', async () => {
    failLogin()
    renderForm()
    await submit()

    await screen.findByRole('alert')

    for (const field of [screen.getByLabelText(/email address/i), screen.getByLabelText('Password')]) {
      expect(field).toHaveAttribute('aria-invalid', 'true')
      expect(field).toHaveAttribute('aria-describedby', 'login-error')
    }
  })

  it('leaves the fields unmarked before any attempt', () => {
    renderForm()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-describedby')
  })
})

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
