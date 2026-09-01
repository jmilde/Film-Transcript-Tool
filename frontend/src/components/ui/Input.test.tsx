import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Input } from './Input'

describe('Input', () => {
  it('renders a text input that accepts typed value', async () => {
    render(<Input placeholder="New project name" />)
    const input = screen.getByPlaceholderText('New project name')
    await userEvent.type(input, 'xochi')
    expect(input).toHaveValue('xochi')
  })

  it('passes through disabled', () => {
    render(<Input placeholder="disabled" disabled />)
    expect(screen.getByPlaceholderText('disabled')).toBeDisabled()
  })
})
