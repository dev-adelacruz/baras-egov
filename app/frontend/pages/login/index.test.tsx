import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import userReducer from '../../state/user/userSlice'
import { SUPPORT_CONTACT } from '../../config/support'
import LoginPage from './index'

const renderWith = (Page: React.ComponentType) => {
  const store = configureStore({ reducer: { user: userReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </Provider>
  )
}

const renderPage = () => renderWith(LoginPage)

afterEach(() => vi.restoreAllMocks())

describe('login page support contact', () => {
  // BRGY-121 set SUPPORT_CONTACT, so the configured branch is now the default
  // one. The null branch is still supported and is covered below.
  it('links to the configured support contact', () => {
    renderPage()

    const link = screen.getByRole('link', { name: /contact your administrator/i })
    expect(link).toHaveAttribute('href', `mailto:${SUPPORT_CONTACT}`)
  })

  it('exposes exactly one h1, and it names the task rather than the brand', () => {
    const { container } = renderPage()

    // The brand panel's tagline used to be the page's only <h1>, inside a
    // `hidden lg:flex` container — so below 1024px the document rendered no h1
    // at all and opened on an <h2>. jsdom applies no CSS, so the guard here is
    // the count: exactly one h1 in the DOM means no viewport can lose it.
    const h1s = container.querySelectorAll('h1')
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent(/sign in to your account/i)

    // And nothing outranks it — an h2 before the h1 would be its own defect,
    // since the panel renders first in DOM order.
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    expect(headings[0].tagName).toBe('H1')
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
    // element with neither a handler nor a destination is the bug (BRGY-96).
    const links = screen.queryAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute('href')
      expect(link.getAttribute('href')).not.toBe('')
    }
  })
})

describe('login page support contact when unset', () => {
  it('falls back to plain text with nothing focusable', async () => {
    vi.resetModules()
    vi.doMock('../../config/support', () => ({
      SUPPORT_CONTACT: null,
      supportMailto: () => null,
    }))

    const { default: UnconfiguredLoginPage } = await import('./index')
    renderWith(UnconfiguredLoginPage)

    // The original defect was <button>Contact your administrator</button> with
    // no onClick — focusable, announced as actionable, completely inert.
    expect(screen.queryByRole('button', { name: /contact your administrator/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /contact your administrator/i })).toBeNull()
    expect(
      screen.getByText(/your barangay administrator issues and resets accounts/i)
    ).toBeInTheDocument()

    vi.doUnmock('../../config/support')
    vi.resetModules()
  })
})
