import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'

function ControlledPalette({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(true)
  return (
    <CommandPalette
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onOpenChange?.(next)
      }}
      label="Search"
    >
      <input placeholder="Search transcripts..." autoFocus />
    </CommandPalette>
  )
}

describe('CommandPalette', () => {
  it('renders its content and a focus-trapped dialog role', async () => {
    render(<ControlledPalette />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search transcripts...')).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn()
    render(<ControlledPalette onOpenChange={onOpenChange} />)
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on outside (overlay) click', async () => {
    render(<ControlledPalette />)
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByTestId('command-palette-overlay'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
