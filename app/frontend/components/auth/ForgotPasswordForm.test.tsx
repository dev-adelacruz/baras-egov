import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ForgotPasswordForm from './ForgotPasswordForm'
import { authService } from '../../services/authService'

const renderForm = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordForm />
    </MemoryRouter>
  )

afterEach(() => vi.restoreAllMocks())

describe('ForgotPasswordForm', () => {
  it('submits the email and shows an enumeration-safe success message', async () => {
    const spy = vi.spyOn(authService, 'requestPasswordReset').mockResolvedValue()
    renderForm()

    await userEvent.type(screen.getByLabelText(/email address/i), 'staff@baras.gov')
    await userEvent.click(screen.getByRole('button', { name: /send reset instructions/i }))

    expect(spy).toHaveBeenCalledWith('staff@baras.gov')
    expect(await screen.findByText(/we've sent password reset instructions/i)).toBeInTheDocument()
  })

  it('shows an error message when the request fails', async () => {
    vi.spyOn(authService, 'requestPasswordReset').mockRejectedValue(new Error('Server error'))
    renderForm()

    await userEvent.type(screen.getByLabelText(/email address/i), 'staff@baras.gov')
    await userEvent.click(screen.getByRole('button', { name: /send reset instructions/i }))

    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument())
  })
})
