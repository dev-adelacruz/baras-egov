import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import userReducer from '../../state/user/userSlice'
import Can from './Can'

const renderWithPermissions = (
  permissions: Record<string, string[]>,
  ui: React.ReactNode
) => {
  const store = configureStore({
    reducer: { user: userReducer },
    preloadedState: {
      user: {
        isSignedIn: true,
        token: 't',
        user: { id: 1, email: 'a@b.com', role: 'municipal_staff' },
        permissions,
        dataScope: 'all' as const,
        isLoading: false,
        error: null, errorKind: null,
      },
    },
  })
  return render(<Provider store={store}>{ui}</Provider>)
}

describe('Can', () => {
  it('renders children when the user has the permission', () => {
    renderWithPermissions({ civil_registry: ['read', 'write'] }, (
      <Can module="civil_registry" action="write">
        <span>Edit record</span>
      </Can>
    ))
    expect(screen.getByText('Edit record')).toBeInTheDocument()
  })

  it('hides children when the action is not permitted', () => {
    renderWithPermissions({ civil_registry: ['read'] }, (
      <Can module="civil_registry" action="write">
        <span>Edit record</span>
      </Can>
    ))
    expect(screen.queryByText('Edit record')).not.toBeInTheDocument()
  })

  it('renders the fallback when the module is inaccessible', () => {
    renderWithPermissions({ civil_registry: ['read'] }, (
      <Can module="treasury" action="read" fallback={<span>No access</span>}>
        <span>Treasury</span>
      </Can>
    ))
    expect(screen.getByText('No access')).toBeInTheDocument()
    expect(screen.queryByText('Treasury')).not.toBeInTheDocument()
  })
})
