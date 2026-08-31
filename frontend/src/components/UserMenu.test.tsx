import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UserMenu } from './UserMenu'
import { AuthContext } from '../auth/context'
import type { AuthContextValue } from '../auth/context'

function renderMenu(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    session: { user: { email: 'jan@example.com' } } as AuthContextValue['session'],
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  }
  return { value, ...render(<AuthContext value={value}>{<UserMenu />}</AuthContext>) }
}

describe('UserMenu', () => {
  it('shows the signed-in email and a sign-out action behind the account button', async () => {
    renderMenu()

    expect(screen.queryByText('jan@example.com')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    expect(await screen.findByText('jan@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('calls signOut when Sign out is clicked', async () => {
    const { value } = renderMenu()

    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(value.signOut).toHaveBeenCalled()
  })
})
