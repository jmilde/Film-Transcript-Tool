import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('renders a multiline textbox that accepts typed value', async () => {
    render(<Textarea placeholder="Ask about this project's videos..." />)
    const textarea = screen.getByPlaceholderText("Ask about this project's videos...")
    await userEvent.type(textarea, 'What was said about minerals?')
    expect(textarea).toHaveValue('What was said about minerals?')
  })
})
