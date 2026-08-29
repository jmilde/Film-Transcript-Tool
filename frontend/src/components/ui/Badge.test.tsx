import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge } from './Badge'

describe('Badge', () => {
  it('renders its label text and a semantic-colored dot', () => {
    render(<Badge variant="success">Completed</Badge>)
    const badge = screen.getByText('Completed')
    expect(badge.className).toContain('bg-success-subtle')
    expect(badge.querySelector('[aria-hidden="true"]')).toHaveClass('bg-success')
  })

  it('defaults to the neutral variant', () => {
    render(<Badge>Pending</Badge>)
    expect(screen.getByText('Pending').className).toContain('bg-surface-raised')
  })
})
