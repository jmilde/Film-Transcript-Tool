import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('defaults to the dense, neutral workspace treatment', () => {
    render(<Card>content</Card>)
    expect(screen.getByText('content').className).toContain('border-border')
  })

  it('applies the airy pastel treatment with a tint', () => {
    render(
      <Card variant="airy" tint="success">
        content
      </Card>,
    )
    expect(screen.getByText('content').className).toContain('bg-success-subtle')
  })

  it('merges a caller-provided className', () => {
    render(<Card className="mt-4">content</Card>)
    expect(screen.getByText('content').className).toContain('mt-4')
  })
})
