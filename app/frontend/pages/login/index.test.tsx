import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import userReducer from '../../state/user/userSlice'
import LoginPage from './index'

const renderPage = () => {
  const store = configureStore({ reducer: { user: userReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </Provider>
  )
}

afterEach(() => vi.restoreAllMocks())

describe('login page support contact', () => {
  // SUPPORT_CONTACT is null until BRGY-121 supplies a real address. These
  // assertions describe that state; the second block covers the configured one.
  it('offers no focusable control when no support contact is configured', () => {
    renderPage()

    // The old markup was <button>Contact your administrator</button> with no
    // onClick — focusable, announced as actionable, and completely inert.
    expect(screen.queryByRole('button', { name: /contact your administrator/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /contact your administrator/i })).toBeNull()
  })

  it('still tells the user who resolves sign-in problems', () => {
    renderPage()

    expect(
      screen.getByText(/your barangay administrator issues and resets accounts/i)
    ).toBeInTheDocument()
  })

  it('no longer asks whether the user has an account', () => {
    renderPage()

    // There is no public sign-up, so everyone reading this already has one.
    expect(screen.queryByText(/don't have an account/i)).toBeNull()
    expect(screen.getByText(/trouble signing in/i)).toBeInTheDocument()
  })

  it('every control on the page is actionable', () => {
    renderPage()

    // Guards the defect class rather than the single instance: a focusable
    // element with neither a handler nor a destination is the bug.
    const links = screen.queryAllByRole('link')
    for (const link of links) {
      expect(link).toHaveAttribute('href')
      expect(link.getAttribute('href')).not.toBe('')
    }
  })
})

describe('login page support contact when configured', () => {
  it('renders a mailto link once an address is set', async () => {
    vi.resetModules()
    vi.doMock('../../config/support', () => ({
      SUPPORT_CONTACT: 'ithelpdesk@example.gov.ph',
      supportMailto: () => 'mailto:ithelpdesk@example.gov.ph',
    }))

    const { default: ConfiguredLoginPage } = await import('./index')
    const store = configureStore({ reducer: { user: userReducer } })
    render(
      <Provider store={store}>
        <MemoryRouter>
          <ConfiguredLoginPage />
        </MemoryRouter>
      </Provider>
    )

    const link = screen.getByRole('link', { name: /contact your administrator/i })
    expect(link).toHaveAttribute('href', 'mailto:ithelpdesk@example.gov.ph')

    vi.doUnmock('../../config/support')
    vi.resetModules()
  })
})
