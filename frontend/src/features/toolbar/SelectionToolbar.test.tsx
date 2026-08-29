import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SelectionToolbar } from './SelectionToolbar'
import { PlayIcon, TrashIcon } from '../../components/icons'
import type { ToolbarAction } from './SelectionToolbar'

describe('SelectionToolbar', () => {
  it('renders the summary text and timecode, and fires action clicks', async () => {
    const onPlay = vi.fn()
    const onDelete = vi.fn()
    const actions: ToolbarAction[] = [
      { id: 'play', icon: PlayIcon, label: 'Play selection', variant: 'primary', onClick: onPlay },
      { id: 'delete', icon: TrashIcon, label: 'Delete', variant: 'danger', onClick: onDelete },
    ]
    render(
      <SelectionToolbar
        mode="actions"
        summary={{ text: 'hello there', timecode: '0:00 – 0:02' }}
        actions={actions}
      />,
    )

    expect(screen.getByText('0:00 – 0:02')).toBeInTheDocument()
    expect(screen.getByText('"hello there"')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Play selection' }))
    expect(onPlay).toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalled()
  })

  it('renders a clear-selection button only when onClear is passed', () => {
    const { rerender } = render(
      <SelectionToolbar mode="actions" summary={{ text: 'x' }} actions={[]} />,
    )
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument()

    const onClear = vi.fn()
    rerender(
      <SelectionToolbar mode="actions" summary={{ text: 'x' }} actions={[]} onClear={onClear} />,
    )
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument()
  })

  it('draft mode renders the label/input and wires Confirm/Cancel plus Enter/Escape', async () => {
    const onChange = vi.fn()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <SelectionToolbar
        mode="draft"
        draft={{ label: 'Comment:', value: 'draft text', onChange, onConfirm, onCancel }}
      />,
    )

    expect(screen.getByText('Comment:')).toBeInTheDocument()
    const input = screen.getByDisplayValue('draft text')

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await userEvent.type(input, '{Enter}')
    expect(onConfirm).toHaveBeenCalledTimes(2)

    await userEvent.type(input, '{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
