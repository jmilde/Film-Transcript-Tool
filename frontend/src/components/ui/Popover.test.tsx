import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

describe('Popover', () => {
  it('opens its content on trigger click and closes on Escape', async () => {
    render(
      <Popover>
        <PopoverTrigger>Open filters</PopoverTrigger>
        <PopoverContent>Filter options</PopoverContent>
      </Popover>,
    )
    expect(screen.queryByText('Filter options')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open filters' }))
    expect(await screen.findByText('Filter options')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Filter options')).not.toBeInTheDocument())
  })
})
