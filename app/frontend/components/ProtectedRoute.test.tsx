import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import userReducer from '../state/user/userSlice'
import ProtectedRoute from './ProtectedRoute'

const renderGuard = (userState: Partial<{ isSignedIn: boolean; isLoading: boolean }>) => {
  const store = configureStore({
    reducer: { user: userReducer },
    preloadedState: {
      user: { isSignedIn: false, token: null, user: null, isLoading: false, error: null, ...userState },
    },
  })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><div>Secret Dashboard</div></ProtectedRoute>} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

describe('ProtectedRoute', () => {
  it('renders the protected content when the user is signed in', async () => {
    renderGuard({ isSignedIn: true, isLoading: false })
    expect(await screen.findByText('Secret Dashboard')).toBeInTheDocument()
  })

  it('redirects to /login when the user is not signed in', async () => {
    renderGuard({ isSignedIn: false, isLoading: false })
    expect(await screen.findByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument()
  })

  it('shows a loading state while auth is being checked', () => {
    renderGuard({ isSignedIn: false, isLoading: true })
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })
})
