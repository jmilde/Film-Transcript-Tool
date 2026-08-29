import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu'

describe('DropdownMenu', () => {
  it('opens on trigger click, fires onSelect, and closes', async () => {
    const onSelect = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    const renameItem = await screen.findByRole('menuitem', { name: 'Rename' })
    await userEvent.click(renameItem)
    expect(onSelect).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument())
  })
})
