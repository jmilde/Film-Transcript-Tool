import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent, DialogTrigger } from './Dialog'

function ControlledDialog({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button>outside</button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          onOpenChange?.(next)
        }}
      >
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent title="Delete video?" description="This can't be undone.">
          <button>Confirm delete</button>
        </DialogContent>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('opens on trigger click, traps focus, and shows title/description', async () => {
    render(<ControlledDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Delete video?')).toBeInTheDocument()
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm delete' })).toHaveFocus(),
    )
  })

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn()
    render(<ControlledDialog onOpenChange={onOpenChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on outside click', async () => {
    render(<ControlledDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    // Radix marks the rest of the page inert (`pointer-events: none`) while
    // the dialog is open, so `document.body` itself can't receive a real
    // click — the overlay is the click target a user would actually hit.
    await userEvent.click(screen.getByTestId('dialog-overlay'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes via the built-in close button', async () => {
    render(<ControlledDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('dialog')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
