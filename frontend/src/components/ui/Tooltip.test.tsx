import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('shows its content on trigger hover', async () => {
    render(
      <Tooltip content="Undo the last edit" delayDuration={0}>
        <button>Undo</button>
      </Tooltip>,
    )
    expect(screen.queryByText('Undo the last edit')).not.toBeInTheDocument()
    await userEvent.hover(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Undo the last edit')).toBeInTheDocument()
  })
})
